import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  checkoutProductReady,
  getCheckoutProduct,
  type CheckoutProductKey,
} from "./catalog";
import {
  initializePaystackTransaction,
  type PaystackTransaction,
  verifyPaystackTransaction,
} from "./paystack";

export type PaymentResultStatus = "success" | "pending" | "failed";

export interface PaymentResult {
  status: PaymentResultStatus;
  reference: string;
  message: string;
}

function planCodeFromTransaction(transaction: PaystackTransaction): string | null {
  if (typeof transaction.plan === "object" && transaction.plan) {
    return transaction.plan.plan_code ?? null;
  }
  return typeof transaction.plan === "string" && transaction.plan.startsWith("PLN_")
    ? transaction.plan
    : null;
}

export function productKeyFromPlanCode(planCode: string | null | undefined): CheckoutProductKey | null {
  if (!planCode) return null;
  const monthly = getCheckoutProduct("pro_monthly_usd");
  const annual = getCheckoutProduct("pro_annual_usd");
  if (monthly.planCode === planCode) return monthly.key;
  if (annual.planCode === planCode) return annual.key;
  return null;
}

export async function createCheckout(input: {
  userId: string;
  email: string;
  productKey: CheckoutProductKey;
  callbackBaseUrl: string;
}): Promise<{ authorizationUrl: string; reference: string }> {
  if (!checkoutProductReady(input.productKey)) {
    throw new Error("This payment option is not available yet.");
  }
  const product = getCheckoutProduct(input.productKey);
  const reference = `ftl-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  await prisma.billingPayment.create({
    data: {
      userId: input.userId,
      reference,
      productKey: product.key,
      amount: product.amount,
      currency: product.currency,
      status: "initialized",
    },
  });

  try {
    const initialized = await initializePaystackTransaction({
      email: input.email,
      amount: product.amount,
      currency: product.currency,
      reference,
      callbackUrl: `${input.callbackBaseUrl.replace(/\/$/, "")}/billing/callback`,
      productKey: product.key,
      userId: input.userId,
      planCode: product.planCode,
      channels: product.channels,
    });
    return { authorizationUrl: initialized.authorization_url, reference };
  } catch (error) {
    await prisma.billingPayment.update({ where: { reference }, data: { status: "initialization_failed" } });
    throw error;
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export async function recordSuccessfulTransaction(transaction: PaystackTransaction): Promise<PaymentResult> {
  const reference = transaction.reference;
  const existing = await prisma.billingPayment.findUnique({
    where: { reference },
    include: { user: true },
  });

  let payment = existing;
  if (!payment) {
    const productKey = productKeyFromPlanCode(planCodeFromTransaction(transaction));
    const customerCode = transaction.customer?.customer_code;
    const email = transaction.customer?.email?.trim().toLowerCase();
    const user = customerCode
      ? await prisma.userProfile.findUnique({ where: { paystackCustomerCode: customerCode } })
      : email
        ? await prisma.userProfile.findUnique({ where: { email } })
        : null;
    if (!productKey || !user) {
      return { status: "failed", reference, message: "This payment could not be matched to an account." };
    }
    const product = getCheckoutProduct(productKey);
    payment = await prisma.billingPayment.create({
      data: {
        userId: user.id,
        reference,
        productKey,
        amount: product.amount,
        currency: product.currency,
        status: "initialized",
      },
      include: { user: true },
    });
  }

  if (payment.status === "success") {
    return { status: "success", reference, message: "Payment already confirmed." };
  }
  if (transaction.status !== "success") {
    await prisma.billingPayment.update({ where: { reference }, data: { status: transaction.status } });
    return {
      status: ["pending", "processing", "ongoing", "queued"].includes(transaction.status) ? "pending" : "failed",
      reference,
      message: `Payment is ${transaction.status}.`,
    };
  }

  const product = getCheckoutProduct(payment.productKey as CheckoutProductKey);
  const transactionPlanCode = planCodeFromTransaction(transaction);
  const validPlan = !product.recurring || !transactionPlanCode || transactionPlanCode === product.planCode;
  if (transaction.amount !== payment.amount || transaction.currency !== payment.currency || !validPlan) {
    await prisma.billingPayment.update({ where: { reference }, data: { status: "amount_or_plan_mismatch" } });
    return { status: "failed", reference, message: "Payment details did not match the selected product." };
  }

  const paidAt = new Date(transaction.paid_at || transaction.paidAt || Date.now());
  const customerCode = transaction.customer?.customer_code;
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.billingPayment.findUnique({ where: { reference } });
    if (!fresh || fresh.status === "success") return;
    const profile = await tx.userProfile.findUniqueOrThrow({ where: { id: fresh.userId } });
    const accessBase = product.recurring
      ? paidAt
      : profile.proAccessUntil && profile.proAccessUntil > paidAt
        ? profile.proAccessUntil
        : paidAt;
    await tx.billingPayment.update({
      where: { reference },
      data: {
        status: "success",
        providerTransactionId: String(transaction.id),
        channel: transaction.channel ?? null,
        paidAt,
      },
    });
    await tx.userProfile.update({
      where: { id: fresh.userId },
      data: {
        billingPlan: product.key,
        billingStatus: "active",
        proAccessUntil: addDays(accessBase, product.accessDays),
        paystackCustomerCode: customerCode || undefined,
      },
    });
  });
  return { status: "success", reference, message: "Your Pro access is active." };
}

export async function verifyAndRecordPayment(reference: string): Promise<PaymentResult> {
  const safeReference = reference.trim();
  if (!/^[A-Za-z0-9.=-]{4,160}$/.test(safeReference)) {
    return { status: "failed", reference: safeReference, message: "Invalid payment reference." };
  }
  try {
    const transaction = await verifyPaystackTransaction(safeReference);
    return recordSuccessfulTransaction(transaction);
  } catch {
    return { status: "pending", reference: safeReference, message: "Payment confirmation is still pending." };
  }
}

interface SubscriptionEventData {
  subscription_code?: string;
  status?: string;
  next_payment_date?: string | null;
  email_token?: string;
  customer?: { customer_code?: string; email?: string };
  plan?: { plan_code?: string };
  invoice_code?: string;
  paid?: boolean;
  transaction?: PaystackTransaction;
  subscription?: { subscription_code?: string; plan?: { plan_code?: string } };
}

async function userForSubscriptionEvent(data: SubscriptionEventData) {
  const customerCode = data.customer?.customer_code;
  const email = data.customer?.email?.trim().toLowerCase();
  if (customerCode) {
    const user = await prisma.userProfile.findUnique({ where: { paystackCustomerCode: customerCode } });
    if (user) return user;
  }
  return email ? prisma.userProfile.findUnique({ where: { email } }) : null;
}

async function recordSubscription(data: SubscriptionEventData, statusOverride?: string): Promise<void> {
  const subscriptionCode = data.subscription_code || data.subscription?.subscription_code;
  const planCode = data.plan?.plan_code || data.subscription?.plan?.plan_code;
  const productKey = productKeyFromPlanCode(planCode);
  const user = await userForSubscriptionEvent(data);
  if (!subscriptionCode || !planCode || !productKey || !user) return;
  const status = statusOverride || data.status || "active";
  const nextPaymentAt = data.next_payment_date ? new Date(data.next_payment_date) : null;
  await prisma.$transaction([
    prisma.billingSubscription.upsert({
      where: { subscriptionCode },
      create: { userId: user.id, subscriptionCode, planCode, productKey, status, nextPaymentAt },
      update: {
        status,
        nextPaymentAt,
        cancelAtPeriodEnd: status === "non-renewing" || status === "disabled" || status === "complete",
      },
    }),
    prisma.userProfile.update({
      where: { id: user.id },
      data: {
        billingPlan: productKey,
        billingStatus: status === "active" ? "active" : status,
        proAccessUntil: nextPaymentAt ? addDays(nextPaymentAt, 5) : undefined,
        paystackCustomerCode: data.customer?.customer_code || undefined,
      },
    }),
  ]);
}

export async function processPaystackWebhook(rawBody: string, event: { event?: string; data?: unknown }): Promise<void> {
  const eventType = event.event || "unknown";
  const eventId = createHash("sha256").update(rawBody).digest("hex");
  const duplicate = await prisma.billingWebhookEvent.findUnique({ where: { id: eventId } });
  if (duplicate) return;
  const data = (event.data || {}) as SubscriptionEventData & PaystackTransaction;

  if (eventType === "charge.success") {
    await recordSuccessfulTransaction(data as PaystackTransaction);
  } else if (eventType === "subscription.create") {
    await recordSubscription(data, "active");
  } else if (eventType === "subscription.not_renew") {
    await recordSubscription(data, "non-renewing");
  } else if (eventType === "subscription.disable") {
    await recordSubscription(data, data.status || "disabled");
  } else if (eventType === "invoice.payment_failed") {
    await recordSubscription(data, "attention");
  }

  try {
    await prisma.billingWebhookEvent.create({ data: { id: eventId, eventType } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
}
