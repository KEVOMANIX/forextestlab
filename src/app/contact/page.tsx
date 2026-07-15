import type { Metadata } from "next";

import { ContactSection } from "@/components/ContactSection";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the ForexTestLab team. Questions, feedback, and partnership enquiries welcome.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <PageShell>
      <ContactSection />
    </PageShell>
  );
}
