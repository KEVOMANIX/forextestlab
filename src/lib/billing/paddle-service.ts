import "server-only";

import type { EventEntity } from "@paddle/paddle-node-sdk";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { paddleProductKeyFromPriceId } from "./tiers";

type PaddleData = Record<string, unknown>;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function objectValue(value: unknown): PaddleData {
  return value && typeof value === "object" ? value as PaddleData : {};
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function eventData(event: EventEntity): PaddleData {
  return objectValue(event.data);
}

function customData(data: PaddleData): PaddleData {
  return objectValue(data.customData ?? data.custom_data);
}

function firstPriceId(data: PaddleData): string | null {
  const items = Array.isArray(data.items) ? data.items : [];
  const first = objectValue(items[0]);
  return stringValue(objectValue(first.price).id) ?? stringValue(first.priceId ?? first.price_id);
}

async function resolveUser(data: PaddleData) {
  const metadata = customData(data);
  const userId = stringValue(metadata.userId ?? metadata.user_id);
  if (userId) {
    const user = await prisma.userProfile.findUnique({ where: { id: userId } });
    if (user) return user;
  }
  const customerId = stringValue(data.customerId ?? data.customer_id);
  if (customerId) {
    const user = await prisma.userProfile.findUnique({ where: { paddleCustomerId: customerId } });
    if (user) return user;
  }
  const email = stringValue(data.email)?.trim().toLowerCase();
  return email ? prisma.userProfile.findUnique({ where: { email } }) : null;
}

async function syncCustomer(data: PaddleData): Promise<void> {
  const id = stringValue(data.id);
  const email = stringValue(data.email)?.trim().toLowerCase();
  if (!id || !email) return;
  await prisma.paddleCustomerClaim.upsert({
    where: { customerId: id },
    create: { customerId: id, email },
    update: { email },
  });
  await prisma.userProfile.updateMany({ where: { email }, data: { paddleCustomerId: id } });
}

async function syncSubscription(data: PaddleData): Promise<void> {
  const subscriptionId = stringValue(data.id);
  const customerId = stringValue(data.customerId ?? data.customer_id);
  const priceId = firstPriceId(data);
  const productKey = paddleProductKeyFromPriceId(priceId);
  const user = await resolveUser(data);
  const rawStatus = stringValue(data.status) ?? "active";
  const nextBilled = stringValue(data.nextBilledAt ?? data.next_billed_at);
  const period = objectValue(data.currentBillingPeriod ?? data.current_billing_period);
  const periodEnd = stringValue(period.endsAt ?? period.ends_at);
  const nextPaymentAt = nextBilled || periodEnd ? new Date(nextBilled || periodEnd!) : null;
  const scheduled = objectValue(data.scheduledChange ?? data.scheduled_change);
  const cancelAtPeriodEnd = stringValue(scheduled.action) === "cancel";
  const billingStatus = rawStatus === "past_due"
    ? "attention"
    : ["active", "trialing"].includes(rawStatus)
      ? "active"
      : "inactive";

  if (subscriptionId && customerId) {
    await prisma.paddleCustomerClaim.upsert({
      where: { customerId },
      create: { customerId, subscriptionId, priceId, productKey, status: rawStatus, nextPaymentAt, cancelAtPeriodEnd },
      update: { subscriptionId, priceId, productKey, status: rawStatus, nextPaymentAt, cancelAtPeriodEnd },
    });
  }

  if (!subscriptionId || !customerId || !priceId || !productKey || !user) return;
  await prisma.$transaction([
    prisma.billingSubscription.upsert({
      where: { subscriptionCode: subscriptionId },
      create: {
        userId: user.id,
        subscriptionCode: subscriptionId,
        planCode: priceId,
        productKey,
        provider: "paddle",
        status: rawStatus,
        nextPaymentAt,
        cancelAtPeriodEnd,
      },
      update: { planCode: priceId, productKey, provider: "paddle", status: rawStatus, nextPaymentAt, cancelAtPeriodEnd },
    }),
    prisma.userProfile.update({
      where: { id: user.id },
      data: {
        paddleCustomerId: customerId,
        billingPlan: productKey,
        billingStatus,
        proAccessUntil: billingStatus === "inactive" ? new Date() : nextPaymentAt ? addDays(nextPaymentAt, 5) : undefined,
      },
    }),
  ]);
}

export async function claimPaddleSubscriptionForUser(userId: string, email: string): Promise<void> {
  const claim = await prisma.paddleCustomerClaim.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!claim) return;
  const billingStatus = claim.status === "past_due"
    ? "attention"
    : claim.status && ["active", "trialing"].includes(claim.status)
      ? "active"
      : "inactive";
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.userProfile.update({
      where: { id: userId },
      data: {
        paddleCustomerId: claim.customerId,
        billingPlan: claim.productKey ?? undefined,
        billingStatus,
        proAccessUntil: billingStatus === "inactive" ? undefined : claim.nextPaymentAt ? addDays(claim.nextPaymentAt, 5) : undefined,
      },
    }),
  ];
  if (claim.subscriptionId && claim.priceId && claim.productKey && claim.status) {
    operations.push(prisma.billingSubscription.upsert({
      where: { subscriptionCode: claim.subscriptionId },
      create: {
        userId,
        subscriptionCode: claim.subscriptionId,
        planCode: claim.priceId,
        productKey: claim.productKey,
        provider: "paddle",
        status: claim.status,
        nextPaymentAt: claim.nextPaymentAt,
        cancelAtPeriodEnd: claim.cancelAtPeriodEnd,
      },
      update: {
        userId,
        planCode: claim.priceId,
        productKey: claim.productKey,
        provider: "paddle",
        status: claim.status,
        nextPaymentAt: claim.nextPaymentAt,
        cancelAtPeriodEnd: claim.cancelAtPeriodEnd,
      },
    }));
  }
  await prisma.$transaction(operations);
}

async function syncTransaction(data: PaddleData): Promise<void> {
  const transactionId = stringValue(data.id);
  const customerId = stringValue(data.customerId ?? data.customer_id);
  const priceId = firstPriceId(data);
  const productKey = paddleProductKeyFromPriceId(priceId);
  const user = await resolveUser(data);
  if (!transactionId || !productKey || !user) return;
  const details = objectValue(data.details);
  const totals = objectValue(details.totals);
  const amount = Number(stringValue(totals.grandTotal ?? totals.grand_total ?? totals.total) ?? "0");
  const currency = stringValue(data.currencyCode ?? data.currency_code) ?? "USD";
  const paidAtValue = stringValue(data.billedAt ?? data.billed_at ?? data.updatedAt ?? data.updated_at);
  const paidAt = paidAtValue ? new Date(paidAtValue) : new Date();

  await prisma.$transaction([
    prisma.billingPayment.upsert({
      where: { reference: transactionId },
      create: { userId: user.id, reference: transactionId, providerTransactionId: transactionId, productKey, amount, currency, provider: "paddle", status: "success", paidAt },
      update: { providerTransactionId: transactionId, provider: "paddle", status: "success", paidAt },
    }),
    prisma.userProfile.update({
      where: { id: user.id },
      data: { paddleCustomerId: customerId || undefined, billingPlan: productKey, billingStatus: "active" },
    }),
  ]);
}

export async function processPaddleWebhook(event: EventEntity): Promise<void> {
  const id = event.eventId;
  if (await prisma.billingWebhookEvent.findUnique({ where: { id } })) return;
  const type = event.eventType;
  const data = eventData(event);
  if (type === "customer.created" || type === "customer.updated") await syncCustomer(data);
  else if (type.startsWith("subscription.")) await syncSubscription(data);
  else if (type === "transaction.completed") await syncTransaction(data);

  try {
    await prisma.billingWebhookEvent.create({ data: { id, eventType: type, provider: "paddle" } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
}
