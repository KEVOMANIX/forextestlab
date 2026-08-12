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
        attachments: [
          expect.objectContaining({
            filename: "forextestlab-logo.png",
            cid: "forextestlab-logo",
            contentDisposition: "inline",
          }),
        ],
      }),
    );
    const message = sendMail.mock.calls[0]?.[0];
    expect(message?.html).toContain("cid:forextestlab-logo");
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
