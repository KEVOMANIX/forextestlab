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
        lastUpdated="21 July 2026"
        intro={
          <p>
            This Privacy Policy explains how {siteConfig.name} (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;, or &ldquo;our&rdquo;) handles information collected
            through {siteConfig.domain} and the ForexTestLab application.
          </p>
        }
      >
        <LegalSection heading="1. Information we collect">
          <p>We collect only the information you choose to provide, including:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your name and email address.</li>
            <li>Your saved sessions, simulated trades, strategy notes, and selected markets.</li>
            <li>The contents of any message you send us.</li>
            <li>
              Basic technical data (such as your IP address and browser type)
              that is automatically generated when you visit the site.
            </li>
          </ul>
        </LegalSection>

        <LegalSection heading="2. Account and contact data">
          <p>
            We use your details to operate your account, save your sessions,
            respond to messages, and provide requested service updates. We do
            not sell your personal information.
          </p>
        </LegalSection>

        <LegalSection heading="3. How and why we process information">
          <p>
            We process information to perform our agreement with you, operate
            and secure the service, comply with legal obligations, respond to
            requests, and pursue legitimate interests in maintaining and
            improving ForexTestLab. Where consent is required, you may withdraw
            it at any time without affecting earlier lawful processing.
          </p>
        </LegalSection>

        <LegalSection heading="4. Cookies">
          <p>
            We use essential cookies and similar storage required for secure
            authentication, session continuity, account preferences, and fraud
            prevention. Optional cookies are used only where permitted and, when
            required, after consent.
          </p>
        </LegalSection>

        <LegalSection heading="5. Analytics">
          <p>
            We process limited usage and diagnostic information to maintain
            security, measure service reliability, and improve product
            performance. Analytics information is not sold to third parties.
          </p>
        </LegalSection>

        <LegalSection heading="6. Data retention">
          <p>
            We retain information for as long as necessary to provide the
            service, meet contractual and legal obligations, resolve disputes,
            and maintain security records. Account data is deleted or
            anonymised when it is no longer required.
          </p>
        </LegalSection>

        <LegalSection heading="7. Service providers and payments">
          <p>
            We rely on third-party providers for hosting, authentication, email,
            storage, and payments. Paddle acts as our merchant of record and
            processes checkout, billing, tax, and payment information under its
            own privacy notice. We do not receive or store complete card details.
          </p>
        </LegalSection>

        <LegalSection heading="8. International processing">
          <p>
            Our service providers may process information in countries other
            than your own. Where required, we use contractual and legal
            safeguards designed to protect information transferred across
            borders.
          </p>
        </LegalSection>

        <LegalSection heading="9. Security">
          <p>
            We take reasonable technical and organisational measures to protect
            your information. However, no method of transmission or storage is
            completely secure, and we cannot guarantee absolute security.
          </p>
        </LegalSection>

        <LegalSection heading="10. Your rights">
          <p>
            Depending on where you live, you may have rights to access, correct,
            export, or delete your personal information, and to object to or
            restrict certain processing. To exercise these rights, contact us
            using the details below.
          </p>
        </LegalSection>

        <LegalSection heading="11. Children&apos;s privacy">
          <p>
            ForexTestLab is not directed to children. We do not knowingly
            collect personal information from anyone who is not legally able to
            enter into a binding agreement for the service.
          </p>
        </LegalSection>

        <LegalSection heading="12. Policy updates">
          <p>
            We update this policy when our services or legal obligations
            change. The effective date shown above identifies the current
            version. Material changes will be communicated through the service
            or by email where appropriate.
          </p>
        </LegalSection>

        <LegalSection heading="13. Contact">
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
