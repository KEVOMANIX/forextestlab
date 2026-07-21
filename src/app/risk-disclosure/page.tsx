import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/LegalPage";
import { PageShell } from "@/components/PageShell";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Forex Risk Disclosure",
  description:
    "Important risk disclosure regarding forex trading, leverage, and the limitations of simulated and historical results.",
  alternates: { canonical: "/risk-disclosure" },
};

export default function RiskDisclosurePage() {
  return (
    <PageShell>
      <LegalPage
        title="Forex Risk Disclosure"
        lastUpdated="21 July 2026"
        intro={
          <p>
            Trading foreign exchange carries a high level of risk. This
            disclosure highlights key risks and the limitations of the practice
            and analysis tools provided by {siteConfig.name}. Please read it
            carefully.
          </p>
        }
      >
        <LegalSection heading="1. Forex trading risk">
          <p>
            Trading currencies involves substantial risk of loss and is not
            suitable for every person. You could lose some or all of your
            invested capital. You should not trade with money you cannot afford
            to lose.
          </p>
        </LegalSection>

        <LegalSection heading="2. Leverage risk">
          <p>
            Leverage can significantly amplify both gains and losses. A small
            adverse move in the market can result in losses that exceed your
            initial deposit with some brokers. Understand how leverage works
            before trading real capital.
          </p>
        </LegalSection>

        <LegalSection heading="3. Simulated-performance limitations">
          <p>
            Simulated or hypothetical results have inherent limitations. Unlike
            a live account, simulated trading does not involve real financial
            risk and cannot fully account for factors such as emotions,
            slippage, liquidity, and execution delays. Simulated results do not
            guarantee future performance.
          </p>
        </LegalSection>

        <LegalSection heading="4. Historical-data limitations">
          <p>
            Backtesting and market replay use historical data. Past market
            behaviour does not predict future results, and a strategy that
            performed well on historical data may perform poorly in live
            conditions.
          </p>
        </LegalSection>

        <LegalSection heading="5. Market-data accuracy">
          <p>
            Historical and reference data may contain gaps, errors, or
            adjustments and may differ from the prices available through any
            particular broker. We do not warrant that any data provided is
            accurate, complete, or suitable for a specific purpose.
          </p>
        </LegalSection>

        <LegalSection heading="6. Technology interruptions">
          <p>
            Software and internet-based services can experience outages, delays,
            or errors. You should not rely on ForexTestLab being available
            without interruption, and you accept the risks associated with
            technology failures.
          </p>
        </LegalSection>

        <LegalSection heading="7. Personal financial responsibility">
          <p>
            Any trading decision you make is your own. You are responsible for
            evaluating your financial situation and, where appropriate, seeking
            advice from an independent, qualified financial professional before
            trading.
          </p>
        </LegalSection>

        <LegalSection heading="8. No guarantee of results">
          <p>
            {siteConfig.name} is an educational and analytical software platform.
            It does not provide investment, brokerage, or financial-advisory
            services, and it does not guarantee any trading outcome or profit.
          </p>
        </LegalSection>
      </LegalPage>
    </PageShell>
  );
}
