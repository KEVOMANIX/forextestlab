import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/LegalPage";
import { PageShell } from "@/components/PageShell";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How ForexTestLab collects, uses, and protects personal information submitted through this website.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PageShell>
      <LegalPage
        title="Privacy Policy"
        lastUpdated="15 July 2026"
        intro={
          <p>
            This Privacy Policy explains how {siteConfig.name} (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;, or &ldquo;our&rdquo;) handles information collected
            through {siteConfig.domain}. Because ForexTestLab is still in
            development, this policy covers our website and pre-launch waitlist
            and contact activities only.
          </p>
        }
      >
        <LegalSection heading="1. Information we collect">
          <p>We collect only the information you choose to provide, including:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your name and email address.</li>
            <li>
              Your stated trading experience level and preferred currency pairs.
            </li>
            <li>The contents of any message you send us.</li>
            <li>
              Basic technical data (such as your IP address and browser type)
              that is automatically generated when you visit the site.
            </li>
          </ul>
        </LegalSection>

        <LegalSection heading="2. Waitlist and contact-form data">
          <p>
            When you join the waitlist or use the contact form, we use your
            details to respond to you, to send you updates about ForexTestLab
            that you have asked for, and to plan early-access invitations. We do
            not sell your personal information.
          </p>
        </LegalSection>

        <LegalSection heading="3. Cookies">
          <p>
            This website aims to use only essential cookies required for the
            site to function. If we introduce optional cookies (for example, for
            analytics), we will update this policy and, where required, request
            your consent.
          </p>
        </LegalSection>

        <LegalSection heading="4. Analytics">
          <p>
            We may use privacy-respecting analytics to understand aggregate,
            non-identifying usage patterns and improve the site. Any analytics
            provider we adopt will be listed here before it is enabled.
          </p>
        </LegalSection>

        <LegalSection heading="5. Data retention">
          <p>
            We keep waitlist and contact information only for as long as needed
            for the purposes described above, or until you ask us to remove it.
            You may request deletion at any time using the contact details
            below.
          </p>
        </LegalSection>

        <LegalSection heading="6. Third-party services">
          <p>
            We may rely on third-party providers for hosting, email delivery,
            and storage of submissions (for example, a hosting platform, an
            email provider, or a database service). These providers process data
            on our behalf under their own terms and security practices.
          </p>
        </LegalSection>

        <LegalSection heading="7. Security">
          <p>
            We take reasonable technical and organisational measures to protect
            your information. However, no method of transmission or storage is
            completely secure, and we cannot guarantee absolute security.
          </p>
        </LegalSection>

        <LegalSection heading="8. Your rights">
          <p>
            Depending on where you live, you may have rights to access, correct,
            export, or delete your personal information, and to object to or
            restrict certain processing. To exercise these rights, contact us
            using the details below.
          </p>
        </LegalSection>

        <LegalSection heading="9. Contact">
          <p>
            For any privacy questions or requests, email us at{" "}
            <a
              href={`mailto:${siteConfig.emails.hello}`}
              className="text-brand-300 underline"
            >
              {siteConfig.emails.hello}
            </a>
            .
          </p>
        </LegalSection>
      </LegalPage>
    </PageShell>
  );
}
