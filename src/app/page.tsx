import { Benefits } from "@/components/Benefits";
import { ContactSection } from "@/components/ContactSection";
import { FAQ } from "@/components/FAQ";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Navbar } from "@/components/Navbar";
import { ProductPreview } from "@/components/ProductPreview";
import { PricingSection } from "@/components/PricingSection";
import { TrustStatement } from "@/components/TrustStatement";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <div className="pt-8">
          <TrustStatement />
        </div>
        <Features />
        <HowItWorks />
        <ProductPreview />
        <Benefits />
        <PricingSection />
        <FAQ />
        <ContactSection id="contact" />
      </main>
      <Footer />
    </>
  );
}
