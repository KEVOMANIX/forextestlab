import { ContactSection } from "@/components/ContactSection";
import { PageShell } from "@/components/PageShell";
import { marketingMetadata } from "@/lib/marketing-metadata";

export const metadata = marketingMetadata({
  title: "Contact",
  description:
    "Get in touch with the ForexTestLab team. Questions, feedback, and partnership enquiries welcome.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <PageShell>
      <ContactSection headingLevel={1} />
    </PageShell>
  );
}
