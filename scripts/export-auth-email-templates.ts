/**
 * Writes the Supabase Auth email templates in the house email design.
 *
 * Supabase sends sign-up, password-reset and other account emails itself, so
 * their HTML lives in the Supabase dashboard (Authentication → Email
 * Templates), not in this app. This renders each one with the same layout as
 * the site's own mail and saves it under docs/email-templates/supabase, ready
 * to paste. `{{ .ConfirmationURL }}` and friends are Supabase template
 * variables and are left for Supabase to fill in.
 *
 * Run: NODE_OPTIONS=--conditions=react-server npx tsx scripts/export-auth-email-templates.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

process.env.NEXT_PUBLIC_SITE_URL = "https://forextestlab.com";

import { renderBrandEmail, type BrandEmailOptions } from "../src/lib/contact-email";

const box = "background:#f7fafc;border:1px solid #e1e9ef;border-radius:12px";
const small = "margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:21px;color:#526574";

/** "Button not working?" with the raw link, and what to do if it was not them. */
function fallback(link: string, notYou: string): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${box}">
      <tr><td class="block" style="padding:16px 20px">
        <p style="${small}">Button not working? Paste this link into your browser:</p>
        <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:13px;line-height:20px;word-break:break-all"><a href="${link}" style="color:#079669">${link}</a></p>
      </td></tr>
    </table>
    <p style="${small};margin-top:18px">${notYou}</p>`;
}

const templates: Array<{ file: string; name: string; subject: string; options: BrandEmailOptions }> = [
  {
    file: "confirm-signup.html",
    name: "Confirm sign up",
    subject: "Confirm your ForexTestLab account",
    options: {
      preheader: "One click to confirm your email and start backtesting.",
      eyebrow: "Welcome to ForexTestLab",
      title: "Confirm your email",
      intro: "Thanks for signing up. Confirm this is your email address and you can start replaying the markets right away.",
      contentHtml: fallback("{{ .ConfirmationURL }}", "Didn't sign up for ForexTestLab? You can ignore this email; no account is created until the address is confirmed."),
      action: { label: "Confirm my email", href: "{{ .ConfirmationURL }}" },
      closing: "The ForexTestLab team",
    },
  },
  {
    file: "invite-user.html",
    name: "Invite user",
    subject: "You've been invited to ForexTestLab",
    options: {
      preheader: "Accept your invitation to ForexTestLab.",
      eyebrow: "You're invited",
      title: "Join ForexTestLab",
      intro: "You've been invited to create a ForexTestLab account. Accept the invitation to set your password and get started.",
      contentHtml: fallback("{{ .ConfirmationURL }}", "Weren't expecting this? You can ignore this email."),
      action: { label: "Accept invitation", href: "{{ .ConfirmationURL }}" },
      closing: "The ForexTestLab team",
    },
  },
  {
    file: "magic-link.html",
    name: "Magic link",
    subject: "Your ForexTestLab sign-in link",
    options: {
      preheader: "Your one-time link to sign in to ForexTestLab.",
      eyebrow: "Sign in",
      title: "Your sign-in link",
      intro: "Use the button below to sign in to ForexTestLab. The link works once and expires soon.",
      contentHtml: fallback("{{ .ConfirmationURL }}", "Didn't ask to sign in? You can ignore this email; your account stays as it is."),
      action: { label: "Sign in to ForexTestLab", href: "{{ .ConfirmationURL }}" },
      closing: "The ForexTestLab team",
    },
  },
  {
    file: "change-email.html",
    name: "Change email address",
    subject: "Confirm your new ForexTestLab email",
    options: {
      preheader: "Confirm the change to your ForexTestLab email address.",
      eyebrow: "Account change",
      title: "Confirm your new email",
      intro: "You asked to change your ForexTestLab email from {{ .Email }} to {{ .NewEmail }}. Confirm to finish the change.",
      contentHtml: fallback("{{ .ConfirmationURL }}", "Didn't ask for this? Don't click the link, and change your password from your account page."),
      action: { label: "Confirm new email", href: "{{ .ConfirmationURL }}" },
      closing: "ForexTestLab Support",
    },
  },
  {
    file: "reset-password.html",
    name: "Reset password",
    subject: "Reset your ForexTestLab password",
    options: {
      preheader: "Choose a new password for your ForexTestLab account.",
      eyebrow: "Password reset",
      title: "Reset your password",
      intro: "We received a request to reset the password for {{ .Email }}. Choose a new one below; the link works once and expires soon.",
      contentHtml: fallback("{{ .ConfirmationURL }}", "Didn't ask for a reset? You can ignore this email; your password stays the same."),
      action: { label: "Choose a new password", href: "{{ .ConfirmationURL }}" },
      closing: "ForexTestLab Support",
    },
  },
  {
    file: "reauthentication.html",
    name: "Reauthentication",
    subject: "Your ForexTestLab verification code",
    options: {
      preheader: "Your ForexTestLab verification code is inside.",
      eyebrow: "Verification",
      title: "Confirm it's you",
      intro: "Enter this code in ForexTestLab to continue. It works once and expires soon.",
      contentHtml: `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${box}">
          <tr><td align="center" class="block" style="padding:22px 20px">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:#071925">{{ .Token }}</p>
          </td></tr>
        </table>
        <p style="${small};margin-top:18px">Didn't try to change anything? Change your password from your account page.</p>`,
      closing: "ForexTestLab Support",
    },
  },
];

async function main() {
  const directory = path.resolve("docs/email-templates/supabase");
  await mkdir(directory, { recursive: true });
  const index: string[] = [
    "# Supabase Auth email templates",
    "",
    "Generated by `scripts/export-auth-email-templates.ts` from the site's email layout.",
    "Paste each into Supabase → Authentication → Email Templates.",
    "",
    "| Supabase template | Subject | File |",
    "|---|---|---|",
  ];
  for (const template of templates) {
    await writeFile(path.join(directory, template.file), renderBrandEmail(template.options), "utf8");
    index.push(`| ${template.name} | ${template.subject} | \`${template.file}\` |`);
  }
  await writeFile(path.join(directory, "README.md"), `${index.join("\n")}\n`, "utf8");
  console.log(`Wrote ${templates.length} templates to ${directory}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
