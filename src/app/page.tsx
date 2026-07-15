import { Benefits } from "@/components/Benefits";
import { ContactSection } from "@/components/ContactSection";
import { DevelopmentStatus } from "@/components/DevelopmentStatus";
import { FAQ } from "@/components/FAQ";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Navbar } from "@/components/Navbar";
import { ProductPreview } from "@/components/ProductPreview";
import { TrustStatement } from "@/components/TrustStatement";
import { WaitlistSection } from "@/components/WaitlistSection";

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
        <DevelopmentStatus />
        <WaitlistSection />
        <FAQ />
        <ContactSection id="contact" />
      </main>
      <Footer />
    </>
  );
}
