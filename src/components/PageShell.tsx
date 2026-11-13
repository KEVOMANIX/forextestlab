import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { TrialSpotlight } from "@/components/TrialSpotlight";

/** Wraps a route with the fixed navbar and footer, offsetting the fixed nav. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-site marketing-light min-h-screen">
      <Navbar />
      <main id="main" className="pt-16">
        {children}
        <TrialSpotlight />
      </main>
      <Footer />
    </div>
  );
}
