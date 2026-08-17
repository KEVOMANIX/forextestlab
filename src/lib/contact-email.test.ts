import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const send = vi.fn();
  return {
    sendMail: send,
    createTransport: vi.fn(() => ({ sendMail: send })),
  };
});

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

import {
  sendContactEmail,
  sendContactReceipt,
  sendSupportReplyNotification,
} from "./contact-email";

const smtpEnvironment = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USERNAME: "smtp-user",
  SMTP_PASSWORD: "smtp-password",
  CONTACT_FROM_EMAIL: "manixlabs@forextestlab.com",
  CONTACT_TO_EMAIL: "support@forextestlab.com",
  NEXT_PUBLIC_SITE_URL: "https://forextestlab.com",
};

describe("sendContactEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, smtpEnvironment);
    sendMail.mockResolvedValue({ messageId: "message-1" });
  });

  afterEach(() => {
    for (const name of Object.keys(smtpEnvironment)) delete process.env[name];
  });

  it("delivers the enquiry and makes the customer the reply-to recipient", async () => {
    await sendContactEmail({
      name: "Kelvin Mwaniki",
      email: "kelvin@example.com",
      subject: "Partnership enquiry",
      message: "Hello <script>alert('x')</script>\nSecond line",
      consent: true,
    });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        auth: { user: "smtp-user", pass: "smtp-password" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "ForexTestLab Contact <manixlabs@forextestlab.com>",
        to: "support@forextestlab.com",
        replyTo: { name: "Kelvin Mwaniki", address: "kelvin@example.com" },
        subject: "[ForexTestLab] Partnership enquiry",
        html: expect.not.stringContaining("<script>"),
        // The logo used to ride along as a 24KB inline attachment on every
        // send. It is hosted now, so an enquiry carries nothing but what the
        // customer actually attached.
        attachments: [],
      }),
    );
    const message = sendMail.mock.calls[0]?.[0];
    expect(message?.html).not.toContain("cid:");
    expect(message?.html).toContain(
      'src="https://forextestlab.com/logo-full.png"',
    );
    expect(message?.html).toContain("Reply to customer");
    expect(message?.html).toContain("Backtest. Analyze. Improve.");
  });

  it("sends a branded customer receipt with a support-inbox action", async () => {
    await sendContactReceipt({
      name: "Kelvin",
      email: "kelvin@example.com",
      subject: "Replay question",
      message: "Can you help?",
      consent: true,
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "kelvin@example.com",
        subject: "We received your ForexTestLab support request",
        html: expect.stringContaining("Open support inbox"),
      }),
    );
  });

  it("escapes support reply previews inside the branded notification", async () => {
    await sendSupportReplyNotification({
      email: "kelvin@example.com",
      name: "Kelvin",
      subject: "Account access",
      preview: "Resolved <script>alert('x')</script>",
    });

    const message = sendMail.mock.calls[0]?.[0];
    expect(message?.html).toContain("Read full reply");
    expect(message?.html).not.toContain("<script>");
    expect(message?.html).toContain("&lt;script&gt;");
  });

  it("fails clearly when SMTP is not configured", async () => {
    delete process.env.SMTP_HOST;

    await expect(
      sendContactEmail({
        name: "Kelvin Mwaniki",
        email: "kelvin@example.com",
        subject: "Hello",
        message: "Test message",
        consent: true,
      }),
    ).rejects.toThrow("Missing required contact email setting: SMTP_HOST");
  });
});

describe("the email shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, smtpEnvironment);
    sendMail.mockResolvedValue({ messageId: "message-1" });
  });

  afterEach(() => {
    for (const name of Object.keys(smtpEnvironment)) delete process.env[name];
  });

  it("carries responsive rules so a phone is not left with a narrow ribbon", async () => {
    await sendSupportReplyNotification({
      email: "trader@example.com",
      name: "Kelvin",
      subject: "Replay stalls",
      preview: "Reproduced and fixed.",
    });
    const html = String(sendMail.mock.calls[0]?.[0]?.html);
    expect(html).toContain("@media only screen and (max-width: 600px)");
    // Every gutter that stacked on a phone needs a hook, or the column stays
    // narrow no matter what the media query says.
    for (const hook of ['class="shell"', 'class="head"', 'class="body"', 'class="foot"', 'class="block"']) {
      expect(html, `${hook} is missing`).toContain(hook);
    }
  });

  it("styles the logo so a blocked image still reads as the brand", async () => {
    await sendSupportReplyNotification({
      email: "trader@example.com",
      name: "Kelvin",
      subject: "Replay stalls",
      preview: "Reproduced and fixed.",
    });
    const html = String(sendMail.mock.calls[0]?.[0]?.html);
    // Hosting the logo means some clients will not fetch it. The alt text is
    // what they show instead, and it only looks deliberate if the img element
    // carries the type styles for it to inherit.
    const logoTag = html.match(/<img[^>]*logo-full\.png[^>]*>/)?.[0] ?? "";
    expect(logoTag).toContain('alt="ForexTestLab');
    expect(logoTag).toContain("color:#ffffff");
    expect(logoTag).toContain("font-weight:700");
  });

  it("points images at the canonical origin, not the environment URL", async () => {
    // A preview or local NEXT_PUBLIC_SITE_URL would make the logo unreachable
    // from a mail client, which is the whole point of not attaching it.
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    await sendSupportReplyNotification({
      email: "trader@example.com",
      name: "Kelvin",
      subject: "Replay stalls",
      preview: "Reproduced and fixed.",
    });
    const html = String(sendMail.mock.calls[0]?.[0]?.html);
    expect(html).toContain('src="https://forextestlab.com/logo-full.png"');
  });
});
