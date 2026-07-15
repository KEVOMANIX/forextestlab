/**
 * DukascopyImportAdapter — manual import ONLY, DISABLED by default.
 *
 * This adapter supports importing files that the PROJECT OWNER has lawfully
 * downloaded themselves. It does NOT download anything automatically and does
 * NOT scrape undocumented endpoints. Dukascopy is not described as, and is not,
 * an authorised ForexTestLab partner.
 *
 * Enable ONLY when DUKASCOPY_DATA_AUTHORIZED=true, which the owner sets after
 * confirming they hold the necessary rights to use the data.
 */

import "server-only";

import { importMarketData, type ImportReport } from "../import";
import type { HeaderMapping } from "../normalizer";
import type { Timeframe } from "../types";

export class DukascopyImportAdapter {
  isAuthorized(): boolean {
    return process.env.DUKASCOPY_DATA_AUTHORIZED === "true";
  }

  /** Import a manually-downloaded Dukascopy CSV export from disk. */
  async importFile(params: {
    filePath: string;
    symbol: string;
    timeframe: Timeframe;
    timezone?: string;
    mapping?: Partial<HeaderMapping>;
  }): Promise<ImportReport> {
    if (!this.isAuthorized()) {
      throw new Error(
        "Dukascopy import is not authorised. Set DUKASCOPY_DATA_AUTHORIZED=true only after confirming you hold the rights to use these files. No automatic download is performed.",
      );
    }
    return importMarketData({
      filePath: params.filePath,
      symbol: params.symbol,
      timeframe: params.timeframe,
      timezone: params.timezone ?? "UTC",
      source: "dukascopy-manual-import",
      mapping: params.mapping,
    });
  }
}
