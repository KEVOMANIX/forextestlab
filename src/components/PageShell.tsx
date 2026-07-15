import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

/** Wraps a route with the fixed navbar and footer, offsetting the fixed nav. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="main" className="pt-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
