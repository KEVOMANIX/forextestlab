import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/LegalPage";
import { PageShell } from "@/components/PageShell";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The terms that govern your use of ForexTestLab.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PageShell>
      <LegalPage
        title="Terms of Use"
        lastUpdated="15 July 2026"
        showDraftNotice={false}
        intro={
          <p>
            These Terms of Use govern your access to and use of the{" "}
            {siteConfig.name} website at {siteConfig.domain}. By using the site,
            you agree to these terms. If you do not agree, please do not use the
            site.
          </p>
        }
      >
        <LegalSection heading="1. Acceptance of terms">
          <p>
            By accessing or using this website, you confirm that you have read,
            understood, and agree to be bound by these terms and by our Privacy
            Policy and Risk Disclosure.
          </p>
        </LegalSection>

        <LegalSection heading="2. Permitted website use">
          <p>
            You may use this website for lawful, personal, and informational
            purposes only, including strategy research and simulated trading.
            You agree not to misuse the service or interfere with its operation.
          </p>
        </LegalSection>

        <LegalSection heading="3. Intellectual property">
          <p>
            The website and its content — including text, design, graphics,
            logos, and the {siteConfig.name} name — are owned by us or our
            licensors and are protected by intellectual-property laws. You may
            not copy, reproduce, or redistribute them without permission.
          </p>
        </LegalSection>

        <LegalSection heading="4. No financial advice">
          <p>
            Nothing on this website constitutes investment, trading, tax, or
            financial advice, or a recommendation to buy, sell, or hold any
            financial instrument. You are solely responsible for your own
            decisions.
          </p>
        </LegalSection>

        <LegalSection heading="5. No brokerage services">
          <p>
            {siteConfig.name} is not a broker or dealer. We do not hold client
            funds, execute real orders, or provide access to live markets. The
            platform is intended for simulated practice and analysis only.
          </p>
        </LegalSection>

        <LegalSection heading="6. No guaranteed results">
          <p>
            Historical and simulated results do not guarantee future
            performance. We make no representation that using ForexTestLab will
            lead to profitable trading or any particular outcome.
          </p>
        </LegalSection>

        <LegalSection heading="7. User responsibilities">
          <p>
            You are responsible for the accuracy of the information you submit,
            for keeping your account credentials secure, and for complying
            with all laws that apply to you.
          </p>
        </LegalSection>

        <LegalSection heading="8. Prohibited use">
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Use the site for any unlawful or fraudulent purpose.</li>
            <li>
              Attempt to gain unauthorised access to the site or its systems.
            </li>
            <li>
              Introduce malware, scrape at scale, or disrupt the service or
              other users.
            </li>
            <li>
              Misrepresent your affiliation with {siteConfig.name} or any third
              party.
            </li>
          </ul>
        </LegalSection>

        <LegalSection heading="9. Third-party services">
          <p>
            The site may link to or rely on third-party services. We are not
            responsible for the content, policies, or practices of those third
            parties, and their terms apply to your use of them.
          </p>
        </LegalSection>

        <LegalSection heading="10. Limitation of liability">
          <p>
            To the maximum extent permitted by law, {siteConfig.name} and its
            team will not be liable for any indirect, incidental, or
            consequential damages, or for any trading or financial losses,
            arising from your use of this website or the platform.
          </p>
        </LegalSection>

        <LegalSection heading="11. Changes to the service">
          <p>
            We may change, suspend, or discontinue parts of the service and may
            update these terms. Continued use after changes means you accept the
            revised terms.
          </p>
        </LegalSection>

        <LegalSection heading="12. Contact">
          <p>
            Questions about these terms? Email us at{" "}
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
