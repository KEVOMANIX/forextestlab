import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/LegalPage";
import { PageShell } from "@/components/PageShell";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy",
  description: "How ForexTestLab subscription cancellations and refund requests are handled.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <PageShell>
      <LegalPage
        title="Refund and Cancellation Policy"
        lastUpdated="21 July 2026"
        intro={<p>This policy applies to subscriptions sold by Manixlabs under the {siteConfig.name} brand and billed by Paddle, our merchant of record.</p>}
      >
        <LegalSection heading="1. Subscription renewals">
          <p>Monthly and yearly subscriptions renew automatically at the price and interval shown at checkout until canceled. Paddle sends billing documents and may send renewal or payment notices.</p>
        </LegalSection>
        <LegalSection heading="2. Canceling a subscription">
          <p>You may cancel at any time from the billing section of your account or by contacting {siteConfig.emails.support}. Unless the checkout or applicable law says otherwise, cancellation takes effect at the end of the current paid billing period. You retain paid access until that date and will not be charged for the next term.</p>
        </LegalSection>
        <LegalSection heading="3. Refund requests">
          <p>If the service does not work as described, contact us within 14 days of your first purchase. Include the account email, purchase date, and a description of the issue. We will review the request promptly and may ask you to complete reasonable troubleshooting.</p>
          <p>Renewal charges and partially used billing periods are generally non-refundable, except where required by law or where we confirm a material service failure. Nothing in this policy limits mandatory consumer rights that apply in your country.</p>
        </LegalSection>
        <LegalSection heading="4. How refunds are issued">
          <p>Approved refunds are processed through Paddle to the original payment method. Bank processing times vary. Canceling a subscription does not automatically create a refund request.</p>
        </LegalSection>
        <LegalSection heading="5. Contact">
          <p>Send cancellation or refund questions to <a href={`mailto:${siteConfig.emails.support}`} className="text-brand-300 underline">{siteConfig.emails.support}</a>.</p>
        </LegalSection>
      </LegalPage>
    </PageShell>
  );
}
