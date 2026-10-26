import { expect, it } from "vitest";
import { analyticsPdfFilename, createAnalyticsPdf } from "./pdf-report";
import { pdfFixtureModel } from "./pdf-report.fixture";
import { DEMO_ANALYTICS_TRADES } from "./demo-data";
import { analyticsTrades } from "./trade-scope";

it("exports a valid paginated PDF including an empty session", () => {
  const model = { ...pdfFixtureModel, equity: [], drawdown: [], closedTrades: 0, maxDrawdown: null, maxDrawdownPercent: null };
  const pdf = createAnalyticsPdf({ name: "Empty session", symbols: ["EURUSD"], period: "October 2026", model, trades: [], excludedTrades: 0, realisedOnly: true });
  expect(pdf.output().startsWith("%PDF-")).toBe(true);
  expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(4);
});
it("paginates a long trade ledger", () => {
  const trades = Array.from({ length: 150 }, (_, i) => ({ ...DEMO_ANALYTICS_TRADES[0]!, id: String(i), exitTime: DEMO_ANALYTICS_TRADES[0]!.exitTime + i * 60_000 }));
  const scoped = analyticsTrades(trades);
  const model = { ...pdfFixtureModel, closedTrades: scoped.length };
  const pdf = createAnalyticsPdf({ name: "Long session", symbols: ["EURUSD"], period: "October 2026", model, trades: scoped, excludedTrades: 0, realisedOnly: true });
  expect(pdf.getNumberOfPages()).toBeGreaterThan(8);
  expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(1000);
});
it("creates safe filenames", () => {
  expect(analyticsPdfFilename("EUR/USD: October")).toBe("EUR-USD-October-analytics.pdf");
  expect(analyticsPdfFilename("///")).toBe("session-analytics.pdf");
});
