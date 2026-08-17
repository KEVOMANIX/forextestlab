import "server-only";


import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";

import type { ContactSubmission } from "@/lib/types";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  to: string;
};

type EmailAction = {
  label: string;
  href: string;
};

type BrandEmailOptions = {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  contentHtml: string;
  action?: EmailAction;
  closing?: string;
};

/**
 * Images in email have to resolve from the public internet, so they use the
 * canonical origin rather than NEXT_PUBLIC_SITE_URL — which is a localhost or
 * preview address in every environment that is not production. Links still use
 * siteUrl(), because a link should point at the environment that sent it.
 */
const EMAIL_ASSET_ORIGIN = "https://forextestlab.com";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required contact email setting: ${name}`);
  return value;
}

function getSmtpConfig(): SmtpConfig {
  const rawPort = process.env.SMTP_PORT?.trim() || "587";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }

  return {
    host: required("SMTP_HOST"),
    port,
    secure:
      process.env.SMTP_SECURE?.trim().toLowerCase() === "true" || port === 465,
    username: required("SMTP_USERNAME"),
    password: required("SMTP_PASSWORD"),
    from: required("CONTACT_FROM_EMAIL"),
    to: required("CONTACT_TO_EMAIL"),
  };
}

function smtpTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character] ?? character;
  });
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "https://forextestlab.com"
  );
}


function renderBrandEmail({
  preheader,
  eyebrow,
  title,
  intro,
  contentHtml,
  action,
  closing = "ForexTestLab Support",
}: BrandEmailOptions): string {
  const baseUrl = siteUrl();
  const safeBaseUrl = escapeHtml(baseUrl);
  const actionHtml = action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" class="cta" style="margin:28px 0 4px"><tr><td bgcolor="#16c784" style="border-radius:10px"><a href="${escapeHtml(action.href)}" style="display:inline-block;padding:14px 22px;font-family:Arial,sans-serif;font-size:14px;line-height:18px;font-weight:700;color:#04130e;text-decoration:none;border-radius:10px">${escapeHtml(action.label)} &nbsp;→</a></td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
  <style>
    /*
     * On a 390px phone the old fixed padding spent 74px a side once the outer
     * gutter, the card padding and a content block's own padding had stacked —
     * leaving a 242px column, so every line broke after a few words and the
     * mail read as a narrow ribbon. Clients that honour a head style block
     * (Gmail app, Apple Mail, Outlook for iOS) get a wider column; the ones
     * that ignore classes keep the inline desktop values unchanged.
     */
    @media only screen and (max-width: 600px) {
      .shell { padding: 14px 6px !important; }
      .card { border-radius: 12px !important; }
      .head { padding: 20px 20px !important; }
      .logo { width: 190px !important; }
      .body { padding: 28px 20px 26px !important; }
      .foot { padding: 20px 20px !important; }
      .title { font-size: 23px !important; line-height: 30px !important; }
      .intro { font-size: 15px !important; line-height: 24px !important; }
      .block { padding: 14px 14px !important; }
      .list { padding: 14px 14px 8px 30px !important; }
      .cta a { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#eef3f7;color:#142433">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef3f7">
    <tr>
      <td align="center" class="shell" style="padding:28px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="card" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dbe5ec;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(15,35,50,.08)">
          <tr>
            <td bgcolor="#071925" class="head" style="padding:28px 34px;border-bottom:3px solid #16c784">
              <a href="${safeBaseUrl}" style="display:inline-block;text-decoration:none">
                <img src="${EMAIL_ASSET_ORIGIN}/logo-full.png" width="240" alt="ForexTestLab — Backtest. Analyze. Improve." class="logo" style="display:block;width:240px;max-width:100%;height:auto;border:0;font-family:Arial,sans-serif;font-size:19px;line-height:26px;font-weight:700;color:#ffffff;text-decoration:none">
              </a>
            </td>
          </tr>
          <tr>
            <td class="body" style="padding:42px 40px 36px">
              <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#079669">${escapeHtml(eyebrow)}</p>
              <h1 class="title" style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:30px;line-height:38px;font-weight:750;color:#071925">${escapeHtml(title)}</h1>
              <p class="intro" style="margin:0 0 26px;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#526574">${escapeHtml(intro)}</p>
              ${contentHtml}
              ${actionHtml}
              <p style="margin:30px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:#526574">Kind regards,<br><strong style="color:#142433">${escapeHtml(closing)}</strong></p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f7fafc" class="foot" style="padding:24px 40px;border-top:1px solid #e2eaf0">
              <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#718391">ForexTestLab is educational backtesting and market-replay software. It does not provide financial advice or execute live trades.</p>
              <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:20px;color:#718391">
                <a href="${safeBaseUrl}" style="color:#079669;text-decoration:none;font-weight:700">forextestlab.com</a>
                &nbsp;·&nbsp;
                <a href="${safeBaseUrl}/support" style="color:#526574;text-decoration:none">Support</a>
                &nbsp;·&nbsp;
                <a href="${safeBaseUrl}/privacy" style="color:#526574;text-decoration:none">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:11px;line-height:17px;color:#8a9aa6">© ${new Date().getUTCFullYear()} ForexTestLab. Backtest. Analyze. Improve.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function deliver(
  config: SmtpConfig,
  message: SendMailOptions,
): Promise<void> {
  await smtpTransport(config).sendMail({
    ...message,
    attachments: message.attachments ?? [],
  });
}

export async function sendContactEmail(
  submission: ContactSubmission,
): Promise<void> {
  const config = getSmtpConfig();
  const safeName = escapeHtml(submission.name);
  const safeEmail = escapeHtml(submission.email);
  const safeMessage = escapeHtml(submission.message).replace(/\r?\n/g, "<br>");
  const replyHref = `mailto:${encodeURIComponent(submission.email)}?subject=${encodeURIComponent(`Re: ${submission.subject}`)}`;

  await deliver(config, {
    from: `ForexTestLab Contact <${config.from}>`,
    to: config.to,
    replyTo: { name: submission.name, address: submission.email },
    subject: `[ForexTestLab] ${submission.subject}`,
    text: [
      "New ForexTestLab enquiry",
      "",
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Subject: ${submission.subject}`,
      "",
      submission.message,
    ].join("\n"),
    html: renderBrandEmail({
      preheader: `${submission.name} sent a new ForexTestLab enquiry.`,
      eyebrow: "New customer enquiry",
      title: submission.subject,
      intro: "A new message was submitted through ForexTestLab.",
      contentHtml: `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafc;border:1px solid #e1e9ef;border-radius:12px">
          <tr><td class="block" style="padding:20px 22px">
            <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:1px;color:#7a8b98">From</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:23px;font-weight:700;color:#142433">${safeName}</p>
            <p style="margin:2px 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:21px"><a href="mailto:${safeEmail}" style="color:#079669;text-decoration:none">${safeEmail}</a></p>
            <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:1px;color:#7a8b98">Message</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:25px;color:#344a5a">${safeMessage}</p>
          </td></tr>
        </table>`,
      action: { label: "Reply to customer", href: replyHref },
    }),
  });
}

export async function sendContactReceipt(
  submission: ContactSubmission,
): Promise<void> {
  const config = getSmtpConfig();
  const safeSubject = escapeHtml(submission.subject);

  await deliver(config, {
    from: `ForexTestLab Support <${config.from}>`,
    to: submission.email,
    replyTo: config.to,
    subject: "We received your ForexTestLab support request",
    text: [
      `Hi ${submission.name},`,
      "",
      "We received your support request and our team is reviewing it.",
      `Subject: ${submission.subject}`,
      "We will reply as soon as possible.",
      "",
      `Open your support inbox: ${siteUrl()}/app/support`,
      "",
      "ForexTestLab Support",
    ].join("\n"),
    html: renderBrandEmail({
      preheader: "Your ForexTestLab support request has been received.",
      eyebrow: "Request received",
      title: `Thanks, ${submission.name}`,
      intro:
        "Your message has reached our support team. We are reviewing it and will reply as soon as possible.",
      contentHtml: `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#effaf6;border-left:4px solid #16c784;border-radius:10px">
          <tr><td class="block" style="padding:18px 20px">
            <p style="margin:0 0 5px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:1px;color:#528071">Your request</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:23px;font-weight:700;color:#142433">${safeSubject}</p>
          </td></tr>
        </table>`,
      action: {
        label: "Open support inbox",
        href: `${siteUrl()}/app/support`,
      },
    }),
  });
}

export async function sendSupportReplyNotification({
  email,
  name,
  subject,
  preview,
}: {
  email: string;
  name: string;
  subject: string;
  preview: string;
}): Promise<void> {
  const config = getSmtpConfig();
  const safeSubject = escapeHtml(subject);
  const safePreview = escapeHtml(preview).replace(/\r?\n/g, "<br>");

  await deliver(config, {
    from: `ForexTestLab Support <${config.from}>`,
    to: email,
    replyTo: config.to,
    subject: `Support replied: ${subject}`,
    text: [
      `Hi ${name},`,
      "",
      `ForexTestLab Support replied to “${subject}”:`,
      preview,
      "",
      `Open your support inbox: ${siteUrl()}/app/support`,
    ].join("\n"),
    html: renderBrandEmail({
      preheader: `ForexTestLab Support replied to ${subject}.`,
      eyebrow: "New support reply",
      title: `Hi ${name}, we replied`,
      intro: `There is a new response in your conversation about “${subject}”.`,
      contentHtml: `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafc;border:1px solid #e1e9ef;border-radius:12px">
          <tr><td class="block" style="padding:20px 22px">
            <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:1px;color:#7a8b98">${safeSubject}</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:25px;color:#344a5a">${safePreview}</p>
          </td></tr>
        </table>`,
      action: {
        label: "Read full reply",
        href: `${siteUrl()}/app/support`,
      },
    }),
  });
}

export async function sendOperationalAlert({
  status,
  summary,
  details,
}: {
  status: "failed" | "degraded" | "recovered";
  summary: string;
  details: string[];
}): Promise<void> {
  const config = getSmtpConfig();
  const safeDetails = details.map((detail) => `<li style="margin:0 0 8px">${escapeHtml(detail)}</li>`).join("");
  await deliver(config, {
    from: `ForexTestLab Monitor <${config.from}>`,
    to: process.env.OPERATIONS_ALERT_EMAIL?.trim() || config.to,
    replyTo: config.to,
    subject: `[ForexTestLab ${status.toUpperCase()}] ${summary}`,
    text: [summary, "", ...details, "", `${siteUrl()}/admin/operations`].join("\n"),
    html: renderBrandEmail({
      preheader: summary,
      eyebrow: status === "recovered" ? "Service recovered" : "Operations alert",
      title: summary,
      intro: status === "recovered" ? "All monitored services are healthy again." : "ForexTestLab needs operational attention.",
      contentHtml: `<ul class="list" style="margin:0;padding:18px 22px 10px 40px;background:#f7fafc;border:1px solid #e1e9ef;border-radius:12px;font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:#344a5a">${safeDetails}</ul>`,
      action: { label: "Open operations dashboard", href: `${siteUrl()}/admin/operations` },
      closing: "ForexTestLab Monitor",
    }),
  });
}
