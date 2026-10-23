import "server-only";

import { PRO_PLAN_FEATURES } from "@/lib/billing/plan-copy";
import type { BrandEmailOptions } from "@/lib/contact-email";

/**
 * The emails a customer gets at the moments that matter to their account:
 * joining, paying, a failed payment, cancelling, losing Pro, and security
 * changes. Receipts are not here: Paddle and Paystack send those themselves,
 * so these say what the payment means for the account instead.
 *
 * Each builder returns the subject, plain text and branded HTML options; the
 * call sites send them with `sendBrandedEmail`.
 */

export interface LifecycleEmail {
  subject: string;
  text: string;
  options: BrandEmailOptions;
}

const SITE = "https://forextestlab.com";
const p = "margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:25px;color:#344a5a";
const box = "background:#f7fafc;border:1px solid #e1e9ef;border-radius:12px";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || SITE;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "there";
}

/** "23 October 2026", the way the emails name a date. */
export function emailDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(value);
}

function rows(items: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${box}">
    ${items.map(([label, value], index) => `<tr><td class="block" style="padding:${index ? "0" : "16px"} 20px ${index === items.length - 1 ? "16px" : "10px"}">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:1px;color:#7a8b98">${escape(label)}</p>
      <p style="margin:2px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:23px;font-weight:700;color:#142433">${escape(value)}</p>
    </td></tr>`).join("")}
  </table>`;
}

function checklist(items: readonly string[]): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${items.map((item) => `<tr>
    <td valign="top" style="width:26px;padding:0 0 10px;font-family:Arial,sans-serif;font-size:15px;line-height:23px;font-weight:700;color:#079669">✓</td>
    <td style="padding:0 0 10px;font-family:Arial,sans-serif;font-size:15px;line-height:23px;color:#344a5a">${escape(item)}</td>
  </tr>`).join("")}</table>`;
}

function note(text: string): string {
  return `<p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:21px;color:#526574">${text}</p>`;
}

const PRO_FEATURES: readonly string[] = PRO_PLAN_FEATURES;

export function welcomeEmail(name: string | null | undefined): LifecycleEmail {
  const steps: Array<[string, string]> = [
    ["Start a backtest", "Pick a pair and a date range, then replay the market candle by candle."],
    ["Trade it like it's live", "Place orders with stops and targets. Every result is recorded for you."],
    ["Read your results", "Your dashboard tells you whether you're profitable, with the figures behind it."],
  ];
  return {
    subject: "Welcome to ForexTestLab",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "Your ForexTestLab account is ready. Three steps to your first useful result:",
      ...steps.map(([title, body], index) => `${index + 1}. ${title}: ${body}`),
      "",
      `Start your first backtest: ${siteUrl()}/app/backtest`,
      "",
      "Practising for a prop-firm evaluation? Challenges have their own page, scored against firm rules.",
    ].join("\n"),
    options: {
      preheader: "Your account is ready. Here's how to get a useful result from your first session.",
      eyebrow: "Welcome",
      title: `Hi ${firstName(name)}, you're in`,
      intro: "Your ForexTestLab account is ready. Three steps to your first useful result:",
      contentHtml: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${steps.map(([title, body], index) => `<tr>
          <td valign="top" style="width:40px;padding:0 0 16px"><span style="display:inline-block;width:28px;height:28px;border-radius:14px;background:#e3f8f0;color:#079669;font-family:Arial,sans-serif;font-size:14px;line-height:28px;font-weight:700;text-align:center">${index + 1}</span></td>
          <td style="padding:2px 0 16px"><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:22px;font-weight:700;color:#142433">${escape(title)}</p><p style="${p};margin-top:2px">${escape(body)}</p></td>
        </tr>`).join("")}</table>${note("Practising for a prop-firm evaluation? Challenges have their own page, scored against firm rules.")}`,
      action: { label: "Start your first backtest", href: `${siteUrl()}/app/backtest` },
      closing: "The ForexTestLab team",
    },
  };
}

export function proActivatedEmail(input: {
  name: string | null | undefined;
  planName: string;
  /** Renewal date for a subscription; the last day of access for a pass. */
  until: Date | null;
  recurring: boolean;
}): LifecycleEmail {
  const when = input.until ? emailDate(input.until) : null;
  const details: Array<[string, string]> = [["Plan", input.planName]];
  if (when) details.push([input.recurring ? "Renews on" : "Pro access until", when]);
  return {
    subject: "Your ForexTestLab Pro is active",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `Thanks for upgrading. Your ${input.planName} is active${when ? ` ${input.recurring ? `and renews on ${when}` : `until ${when}`}` : ""}.`,
      "",
      "Now unlocked:",
      ...PRO_FEATURES.map((feature) => `- ${feature}`),
      "",
      `Open ForexTestLab: ${siteUrl()}/app`,
      "Your payment receipt comes separately from our payment provider.",
    ].join("\n"),
    options: {
      preheader: `Your ${input.planName} is active. Here's what's unlocked.`,
      eyebrow: "Pro activated",
      title: "You're on Pro",
      intro: `Thanks for upgrading, ${firstName(input.name)}. Everything below is unlocked now.`,
      contentHtml: `${rows(details)}<div style="height:22px"></div>${checklist(PRO_FEATURES)}${note("Your payment receipt comes separately from our payment provider. Manage your plan any time from Account → Billing.")}`,
      action: { label: "Open ForexTestLab", href: `${siteUrl()}/app` },
      closing: "The ForexTestLab team",
    },
  };
}

export function paymentFailedEmail(input: {
  name: string | null | undefined;
  planName: string;
  /** How long Pro keeps working while the payment is retried. */
  accessUntil: Date | null;
}): LifecycleEmail {
  const grace = input.accessUntil ? emailDate(input.accessUntil) : null;
  return {
    subject: "Action needed: your ForexTestLab payment didn't go through",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `We couldn't take the payment for your ${input.planName}.`,
      grace ? `Your Pro access continues until ${grace} while the payment is retried.` : "",
      "Update your payment details to keep Pro without interruption:",
      `${siteUrl()}/account/billing`,
    ].filter(Boolean).join("\n"),
    options: {
      preheader: "Update your payment details to keep Pro without interruption.",
      eyebrow: "Payment problem",
      title: "We couldn't take your payment",
      intro: `The payment for your ${input.planName} didn't go through. This usually means an expired card or a bank decline.`,
      contentHtml: `${rows([["Plan", input.planName], ...(grace ? [["Pro access continues until", grace] as [string, string]] : [])])}${note("Update your payment details and the next retry will go through. If your bank declined it, they can tell you why.")}`,
      action: { label: "Update payment details", href: `${siteUrl()}/account/billing` },
      closing: "ForexTestLab Support",
    },
  };
}

/** Sent when Paddle reports a new trialing subscription. */
export function trialStartedEmail(input: {
  name: string | null | undefined;
  planName: string;
  trialEndsAt: Date | null;
}): LifecycleEmail {
  const end = input.trialEndsAt ? emailDate(input.trialEndsAt) : "the end of your 7-day trial";
  return {
    subject: "Your 7-day ForexTestLab Pro trial has started",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `Your Pro trial is active until ${end}. Everything in Pro is unlocked:`,
      ...PRO_FEATURES.map((feature) => `- ${feature}`),
      "",
      `On ${end} the card you added is charged for ${input.planName} unless you cancel before then. Cancel any time from Account → Billing: you keep Pro until the trial ends and are not charged.`,
      `${siteUrl()}/account/billing`,
    ].join("\n"),
    options: {
      preheader: `Pro is unlocked until ${end}.`,
      eyebrow: "Pro trial",
      title: "Your Pro trial has started",
      intro: `Hi ${firstName(input.name)}, everything in Pro is unlocked for 7 days.`,
      contentHtml: `${rows([["Plan after the trial", input.planName], ["Trial ends and first charge", end]])}<div style="height:22px"></div>${checklist(PRO_FEATURES)}${note(`Your card is charged automatically on ${escape(end)} unless you cancel before then. Cancel from Account → Billing: Pro stays until the trial ends and you are not charged.`)}`,
      action: { label: "Open ForexTestLab", href: `${siteUrl()}/app` },
      closing: "The ForexTestLab team",
    },
  };
}

/** A trial that ended without a paid plan: cancelled, or the first charge failed. */
export function trialEndedEmail(input: { name: string | null | undefined; reason: "cancelled" | "unpaid" }): LifecycleEmail {
  const unpaid = input.reason === "unpaid";
  return {
    subject: unpaid ? "We couldn't start your ForexTestLab Pro plan" : "Your ForexTestLab Pro trial has ended",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      unpaid
        ? "Your Pro trial ended but the first payment didn't go through, so your account is back on Free."
        : "Your Pro trial has ended and your account is back on Free.",
      "Your sessions, trades and results are all still in your account.",
      `To go Pro, choose a plan from Account → Billing: ${siteUrl()}/account/billing`,
    ].join("\n"),
    options: {
      preheader: "Your sessions are all still in your account.",
      eyebrow: unpaid ? "Payment problem" : "Trial ended",
      title: unpaid ? "Your trial ended without a payment" : "Your Pro trial has ended",
      intro: unpaid
        ? "The first payment after your trial didn't go through, so your account is back on Free. This usually means an expired card or a bank decline."
        : "Your account is back on Free. Thanks for trying Pro.",
      contentHtml: checklist(["Your sessions, trades and results are kept", "Free: 3 new sessions a month on the major pairs", "Go Pro any time from Account → Billing"]),
      action: { label: unpaid ? "Update payment and go Pro" : "See Pro plans", href: `${siteUrl()}/account/billing` },
      closing: "The ForexTestLab team",
    },
  };
}

export function cancellationScheduledEmail(input: {
  name: string | null | undefined;
  planName: string;
  endsAt: Date | null;
  /** Cancelled during the free trial: say plainly there will be no charge. */
  trial?: boolean;
}): LifecycleEmail {
  const end = input.endsAt ? emailDate(input.endsAt) : "the end of your billing period";
  if (input.trial) {
    return {
      subject: "Your ForexTestLab Pro trial is cancelled",
      text: [
        `Hi ${firstName(input.name)},`,
        "",
        `Your Pro trial is cancelled and your card will not be charged. You keep full Pro access until ${end}; after that your account moves to Free and your sessions stay in your account.`,
        "Changed your mind? Turn your plan back on from Account → Billing before then:",
        `${siteUrl()}/account/billing`,
      ].join("\n"),
      options: {
        preheader: `No charge. You keep Pro until ${end}.`,
        eyebrow: "Trial cancelled",
        title: "You won't be charged",
        intro: `Your ${input.planName} trial is cancelled. You keep full Pro access until it ends, then your account moves to Free.`,
        contentHtml: `${rows([["Pro access until", end], ["Charge", "None"]])}${note("Your sessions, trades and results stay in your account on Free.")}`,
        action: { label: "Keep Pro after the trial", href: `${siteUrl()}/account/billing` },
        closing: "The ForexTestLab team",
      },
    };
  }
  return {
    subject: "Your ForexTestLab Pro won't renew",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `Your ${input.planName} has been cancelled. You keep full Pro access until ${end}, and your saved sessions stay in your account.`,
      "Changed your mind? Turn renewal back on from Account → Billing:",
      `${siteUrl()}/account/billing`,
    ].join("\n"),
    options: {
      preheader: `You keep Pro until ${end}.`,
      eyebrow: "Plan cancelled",
      title: "Your plan won't renew",
      intro: `Your ${input.planName} has been cancelled. Nothing changes until the date below.`,
      contentHtml: `${rows([["Pro access until", end]])}${note("Your saved sessions and results stay in your account after that. If you have a moment, reply and tell us why you're leaving; we read every answer.")}`,
      action: { label: "Keep Pro", href: `${siteUrl()}/account/billing` },
      closing: "The ForexTestLab team",
    },
  };
}

export function accessEndedEmail(name: string | null | undefined): LifecycleEmail {
  return {
    subject: "Your ForexTestLab Pro has ended",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "Your Pro access has ended. Your saved sessions and results are still in your account.",
      `Renew any time to pick up where you left off: ${siteUrl()}/account/billing`,
    ].join("\n"),
    options: {
      preheader: "Your saved sessions are still here when you want them.",
      eyebrow: "Pro ended",
      title: "Your Pro access has ended",
      intro: "Thanks for backtesting with Pro. Your saved sessions and results are still in your account, so you can pick up where you left off whenever you renew.",
      contentHtml: checklist(["Your sessions, trades and results are kept", "Renew any time from Account → Billing"]),
      action: { label: "Renew Pro", href: `${siteUrl()}/account/billing` },
      closing: "The ForexTestLab team",
    },
  };
}

/** For Pro that will not renew by itself: a Kenya pass, or access granted by the team. */
export function accessEndingSoonEmail(input: { name: string | null | undefined; endsAt: Date }): LifecycleEmail {
  const end = emailDate(input.endsAt);
  return {
    subject: "Your ForexTestLab Pro access ends soon",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `Your Pro access ends on ${end}. It doesn't renew automatically.`,
      `Buy a pass or choose a plan to keep Pro: ${siteUrl()}/account/billing`,
    ].join("\n"),
    options: {
      preheader: `Your Pro access ends on ${end}.`,
      eyebrow: "Reminder",
      title: "Your Pro access ends soon",
      intro: "Your Pro access doesn't renew on its own, so here's a heads-up before it runs out.",
      contentHtml: `${rows([["Pro access until", end]])}${note("Your saved sessions stay in your account either way.")}`,
      action: { label: "Keep Pro", href: `${siteUrl()}/account/billing` },
      closing: "The ForexTestLab team",
    },
  };
}

export function accessGrantedEmail(input: { name: string | null | undefined; until: Date; days: number }): LifecycleEmail {
  const until = emailDate(input.until);
  const length = input.days >= 365 ? "a year" : `${input.days} days`;
  return {
    subject: "You've been given ForexTestLab Pro",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `The ForexTestLab team has given you ${length} of Pro, free. It's active now and runs until ${until}.`,
      "",
      "Now unlocked:",
      ...PRO_FEATURES.map((feature) => `- ${feature}`),
      "",
      `Open ForexTestLab: ${siteUrl()}/app`,
    ].join("\n"),
    options: {
      preheader: `${length} of Pro, on us. Active now.`,
      eyebrow: "A gift from the team",
      title: `${length[0]!.toUpperCase()}${length.slice(1)} of Pro, on us`,
      intro: `Hi ${firstName(input.name)}, the ForexTestLab team has given you Pro access. It's active now; there's nothing to pay and nothing to set up.`,
      contentHtml: `${rows([["Pro access until", until]])}<div style="height:22px"></div>${checklist(PRO_FEATURES)}${note("It doesn't renew automatically; we'll remind you a few days before it ends.")}`,
      action: { label: "Open ForexTestLab", href: `${siteUrl()}/app` },
      closing: "The ForexTestLab team",
    },
  };
}

export function accessRevokedEmail(name: string | null | undefined): LifecycleEmail {
  return {
    subject: "Your complimentary ForexTestLab Pro has ended",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "The Pro access the team gave you has ended. Your saved sessions and results are still in your account.",
      `To keep using Pro, choose a plan: ${siteUrl()}/account/billing`,
      "Questions? Just reply to this email.",
    ].join("\n"),
    options: {
      preheader: "Your saved sessions are still in your account.",
      eyebrow: "Access update",
      title: "Your complimentary Pro has ended",
      intro: "The Pro access the team gave you has ended. Your saved sessions and results are still in your account.",
      contentHtml: note("Questions about this? Just reply to this email."),
      action: { label: "See Pro plans", href: `${siteUrl()}/account/billing` },
      closing: "ForexTestLab Support",
    },
  };
}

const ROLE_DETAILS: Record<string, { label: string; can: string[] }> = {
  viewer: { label: "Viewer", can: ["Read every customer conversation", "See customer context and history"] },
  agent: { label: "Agent", can: ["Reply to customers by chat and email", "Assign, snooze, tag and resolve conversations", "Add internal notes for the team"] },
  supervisor: { label: "Supervisor", can: ["Everything an agent can do", "Start conversations with customers", "Add teammates and change their roles"] },
};

export function supportTeamAddedEmail(input: { name: string | null | undefined; role: string; changed: boolean }): LifecycleEmail {
  const role = ROLE_DETAILS[input.role] ?? { label: input.role, can: [] };
  return {
    subject: input.changed ? `Your ForexTestLab support role is now ${role.label}` : "You've been added to the ForexTestLab support team",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      input.changed ? `Your support team role is now ${role.label}.` : `You've been added to the ForexTestLab support team as ${role.label}.`,
      "",
      "You can:",
      ...role.can.map((item) => `- ${item}`),
      "",
      `Open the support inbox (sign in with this email): ${siteUrl()}/support-team`,
    ].join("\n"),
    options: {
      preheader: input.changed ? `Your support role is now ${role.label}.` : `You're on the support team as ${role.label}.`,
      eyebrow: "Support team",
      title: input.changed ? `You're now a ${role.label}` : "Welcome to the support team",
      intro: input.changed
        ? `Your role on the ForexTestLab support team has changed to ${role.label}.`
        : `You've been added to the ForexTestLab support team as ${role.label}. Sign in with this email address to open the team inbox.`,
      contentHtml: `${rows([["Your role", role.label]])}<div style="height:22px"></div>${checklist(role.can)}${note("Customer conversations are private: please only open the ones you are helping with.")}`,
      action: { label: "Open the support inbox", href: `${siteUrl()}/support-team` },
      closing: "The ForexTestLab team",
    },
  };
}

export function conversationResolvedEmail(input: { name: string | null | undefined; subject: string }): LifecycleEmail {
  return {
    // "Re:" so a reply threads back into the same conversation in the inbox.
    subject: `Re: ${input.subject}`,
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `We've marked your request "${input.subject}" as resolved.`,
      "Something still not right? Just reply to this email and we'll pick it up.",
    ].join("\n"),
    options: {
      preheader: "Reply to this email if anything is still not right.",
      eyebrow: "Request resolved",
      title: "We've resolved your request",
      intro: `Your conversation about “${input.subject}” is marked as resolved. Thanks for getting in touch.`,
      contentHtml: note("Something still not right? Just reply to this email and we'll pick it up."),
      closing: "ForexTestLab Support",
    },
  };
}

export function passwordChangedEmail(input: { name: string | null | undefined; email: string; at: Date }): LifecycleEmail {
  const when = `${emailDate(input.at)} at ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(input.at)} UTC`;
  return {
    subject: "Your ForexTestLab password was changed",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `The password for ${input.email} was changed on ${when}. If this was you, there's nothing to do.`,
      `Wasn't you? Reset your password now: ${siteUrl()}/forgot-password and reply to this email so we can help.`,
    ].join("\n"),
    options: {
      preheader: "If this was you, there's nothing to do.",
      eyebrow: "Security",
      title: "Your password was changed",
      intro: `The password for ${input.email} was changed. If this was you, there's nothing to do.`,
      contentHtml: `${rows([["Changed", when]])}${note("<strong>Wasn't you?</strong> Reset your password straight away and reply to this email so we can help secure your account.")}`,
      action: { label: "Reset password", href: `${siteUrl()}/forgot-password` },
      closing: "ForexTestLab Support",
    },
  };
}

/**
 * `subscription`: what happened to a live subscription when the account went:
 * "none" without one, "cancelled" when it was stopped, "failed" when the
 * provider refused (the team is alerted and cancels it by hand).
 */
export function accountDeletedEmail(name: string | null | undefined, subscription: "none" | "cancelled" | "failed" = "none"): LifecycleEmail {
  const billing = subscription === "cancelled"
    ? "Your Pro subscription was cancelled too, so you won't be charged again."
    : subscription === "failed"
      ? "We couldn't cancel your Pro subscription automatically. We've been alerted and will cancel it for you; you won't be charged for time after today."
      : null;
  return {
    subject: "Your ForexTestLab account has been deleted",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "As you asked, your ForexTestLab account has been deleted, along with your sessions, trades and results.",
      billing ?? "",
      "Didn't ask for this? Reply to this email straight away.",
    ].filter(Boolean).join("\n"),
    options: {
      preheader: "Your account and its data have been removed.",
      eyebrow: "Account deleted",
      title: "Your account has been deleted",
      intro: "As you asked, your ForexTestLab account has been deleted, along with your sessions, trades and results. Thanks for backtesting with us.",
      contentHtml: `${billing ? note(billing) : ""}${note("<strong>Didn't ask for this?</strong> Reply to this email straight away.")}`,
      closing: "The ForexTestLab team",
    },
  };
}
