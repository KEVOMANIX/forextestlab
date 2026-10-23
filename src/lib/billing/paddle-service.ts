import "server-only";

import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import {
  accessEndedEmail,
  cancellationScheduledEmail,
  paymentFailedEmail,
  proActivatedEmail,
  trialEndedEmail,
  trialStartedEmail,
} from "@/lib/lifecycle-email";
import { sendLifecycleEmail } from "@/lib/lifecycle-send";
import { paddleProductKeyFromPriceId } from "./tiers";
import type { PaddleWebhookEvent } from "./paddle";

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

function eventData(event: PaddleWebhookEvent): PaddleData {
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
  const trialEnd = trialEndsAt(data, rawStatus, nextPaymentAt);

  if (subscriptionId && customerId) {
    await prisma.paddleCustomerClaim.upsert({
      where: { customerId },
      create: { customerId, subscriptionId, priceId, productKey, status: rawStatus, nextPaymentAt, cancelAtPeriodEnd },
      update: { subscriptionId, priceId, productKey, status: rawStatus, nextPaymentAt, cancelAtPeriodEnd },
    });
  }

  if (!subscriptionId || !customerId || !priceId || !productKey || !user) return;
  const previous = await prisma.billingSubscription.findUnique({
    where: { subscriptionCode: subscriptionId },
    select: { status: true, cancelAtPeriodEnd: true },
  });
  const access = subscriptionAccess({ status: rawStatus, previousStatus: previous?.status ?? null, trialEnd, nextPaymentAt });
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
        trialEndsAt: trialEnd,
      },
      update: { planCode: priceId, productKey, provider: "paddle", status: rawStatus, nextPaymentAt, cancelAtPeriodEnd, trialEndsAt: trialEnd },
    }),
    prisma.userProfile.update({
      where: { id: user.id },
      data: {
        paddleCustomerId: customerId,
        billingPlan: productKey,
        billingStatus: access.billingStatus,
        proAccessUntil: access.proAccessUntil,
        // One trial per account: remembered the first time Paddle reports one.
        ...(rawStatus === "trialing" && !user.proTrialStartedAt ? { proTrialStartedAt: new Date() } : {}),
      },
    }),
  ]);
  await sendSubscriptionEmails({
    subscriptionId, productKey, user, previous, status: rawStatus, cancelAtPeriodEnd, nextPaymentAt, trialEnd,
    unpaidTrial: access.unpaidTrial,
  });
}

/**
 * When a trial ends. Paddle gives it on each item as `trial_dates`; while the
 * subscription is trialing, the next billing date is the same moment.
 */
function trialEndsAt(data: PaddleData, status: string, nextPaymentAt: Date | null): Date | null {
  const items = Array.isArray(data.items) ? data.items : [];
  const dates = objectValue(objectValue(items[0]).trialDates ?? objectValue(items[0]).trial_dates);
  const end = stringValue(dates.endsAt ?? dates.ends_at);
  if (end) return new Date(end);
  return status === "trialing" ? nextPaymentAt : null;
}

/**
 * What a Paddle subscription status means for access.
 *
 * - trialing: Pro until the trial ends, exactly. No grace: a trial that is
 *   cancelled, or whose first charge fails, ends on its date.
 * - active: Pro, with the existing 5-day grace past the next billing date.
 * - past_due after a trial: the first charge failed and nothing was ever
 *   paid, so the account returns to Free (its work is kept).
 * - past_due on a paying subscription: Pro continues through the grace while
 *   Paddle retries ("attention").
 * - anything else (canceled, paused): Free from now.
 */
export function subscriptionAccess(input: {
  status: string;
  previousStatus: string | null;
  trialEnd: Date | null;
  nextPaymentAt: Date | null;
  now?: Date;
}): { billingStatus: string; proAccessUntil: Date | undefined; unpaidTrial: boolean } {
  const now = input.now ?? new Date();
  if (input.status === "trialing") {
    return { billingStatus: "active", proAccessUntil: input.trialEnd ?? input.nextPaymentAt ?? undefined, unpaidTrial: false };
  }
  if (input.status === "active") {
    return { billingStatus: "active", proAccessUntil: input.nextPaymentAt ? addDays(input.nextPaymentAt, 5) : undefined, unpaidTrial: false };
  }
  if (input.status === "past_due") {
    const unpaidTrial = input.previousStatus === "trialing" || (input.previousStatus === null && input.trialEnd !== null);
    return unpaidTrial
      ? { billingStatus: "inactive", proAccessUntil: now, unpaidTrial: true }
      : { billingStatus: "attention", proAccessUntil: input.nextPaymentAt ? addDays(input.nextPaymentAt, 5) : undefined, unpaidTrial: false };
  }
  return { billingStatus: "inactive", proAccessUntil: now, unpaidTrial: false };
}

/**
 * Emails for a change in a Paddle subscription. Paddle re-sends and reorders
 * subscription events, so only a real change of state sends anything, and each
 * email is keyed so it goes once. Receipts are Paddle's own.
 */
async function sendSubscriptionEmails(input: {
  subscriptionId: string;
  productKey: string;
  user: { email: string; displayName: string | null; proAccessUntil: Date | null };
  previous: { status: string; cancelAtPeriodEnd: boolean } | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  nextPaymentAt: Date | null;
  trialEnd: Date | null;
  unpaidTrial: boolean;
}): Promise<void> {
  const { subscriptionId, user, previous, status } = input;
  const planName = input.productKey.endsWith("_year") ? "Pro Yearly" : "Pro Monthly";
  if (status === "trialing" && !previous) {
    await sendLifecycleEmail(`trial:${subscriptionId}`, user.email,
      trialStartedEmail({ name: user.displayName, planName, trialEndsAt: input.trialEnd ?? input.nextPaymentAt }));
  }
  // Paid Pro begins: a direct subscription, or a trial's first charge going through.
  if (status === "active" && previous?.status !== "active" && previous?.status !== "past_due") {
    await sendLifecycleEmail(`pro:${subscriptionId}`, user.email,
      proActivatedEmail({ name: user.displayName, planName, until: input.nextPaymentAt, recurring: true }));
  }
  if (status === "past_due" && previous?.status !== "past_due") {
    await sendLifecycleEmail(`payment_failed:${subscriptionId}:${new Date().toISOString().slice(0, 10)}`, user.email,
      input.unpaidTrial
        ? trialEndedEmail({ name: user.displayName, reason: "unpaid" })
        : paymentFailedEmail({ name: user.displayName, planName, accessUntil: user.proAccessUntil }));
  }
  if (input.cancelAtPeriodEnd && !previous?.cancelAtPeriodEnd && status !== "canceled") {
    const trial = status === "trialing";
    const endsAt = trial ? input.trialEnd ?? input.nextPaymentAt : input.nextPaymentAt;
    await sendLifecycleEmail(`cancelled:${subscriptionId}:${endsAt?.toISOString().slice(0, 10) ?? "end"}`, user.email,
      cancellationScheduledEmail({ name: user.displayName, planName, endsAt, trial }));
  }
  if (status === "canceled" && previous?.status !== "canceled") {
    await sendLifecycleEmail(`ended:${subscriptionId}`, user.email,
      previous?.status === "trialing"
        ? trialEndedEmail({ name: user.displayName, reason: "cancelled" })
        : accessEndedEmail(user.displayName));
  }
}

export async function claimPaddleSubscriptionForUser(userId: string, email: string): Promise<void> {
  const claim = await prisma.paddleCustomerClaim.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!claim) return;
  const billingStatus = claim.status === "past_due"
    ? "attention"
    : claim.status && ["active", "trialing"].includes(claim.status)
      ? "active"
      : "inactive";
  const trialing = claim.status === "trialing";
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.userProfile.update({
      where: { id: userId },
      data: {
        paddleCustomerId: claim.customerId,
        billingPlan: claim.productKey ?? undefined,
        billingStatus,
        // A trial runs to its end exactly; a paid plan keeps its 5-day grace.
        proAccessUntil: billingStatus === "inactive"
          ? undefined
          : claim.nextPaymentAt ? (trialing ? claim.nextPaymentAt : addDays(claim.nextPaymentAt, 5)) : undefined,
        ...(trialing ? { proTrialStartedAt: new Date() } : {}),
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
  // Starting a free trial completes a zero-total checkout. Nothing was paid,
  // and access comes from the subscription's trialing status, not from here.
  if (!(amount > 0)) return;

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

export async function processPaddleWebhook(event: PaddleWebhookEvent): Promise<void> {
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
