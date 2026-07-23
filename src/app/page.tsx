import { ContactSection } from "@/components/ContactSection";
import { FAQ } from "@/components/FAQ";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Navbar } from "@/components/Navbar";
import { ProductPreview } from "@/components/ProductPreview";
import { PricingSection } from "@/components/PricingSection";
import { WelcomeOfferBanner } from "@/components/WelcomeOffer";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main" className="pt-16">
        <WelcomeOfferBanner />
        <Hero />
        <ProductPreview />
        <Features />
        <HowItWorks />
        <PricingSection />
        <FAQ />
        <ContactSection id="contact" />
      </main>
      <Footer />
    </>
  );
}
