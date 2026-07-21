import "server-only";

import nodemailer from "nodemailer";

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

export async function sendContactEmail(
  submission: ContactSubmission,
): Promise<void> {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  const safeName = escapeHtml(submission.name);
  const safeEmail = escapeHtml(submission.email);
  const safeSubject = escapeHtml(submission.subject);
  const safeMessage = escapeHtml(submission.message).replace(/\r?\n/g, "<br />");

  await transporter.sendMail({
    from: `ForexTestLab Contact <${config.from}>`,
    to: config.to,
    replyTo: {
      name: submission.name,
      address: submission.email,
    },
    subject: `[ForexTestLab] ${submission.subject}`,
    text: [
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Subject: ${submission.subject}`,
      "",
      submission.message,
    ].join("\n"),
    html: `
      <h2>New ForexTestLab enquiry</h2>
      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
      <p><strong>Subject:</strong> ${safeSubject}</p>
      <hr />
      <p>${safeMessage}</p>
    `,
  });
}
