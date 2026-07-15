/**
 * Seed script.
 *
 * - Upserts every catalogued instrument (so the architecture supports them).
 * - Generates a deterministic EUR/USD 5-minute demonstration dataset and stores
 *   it in the database, so the public beta has real (labelled synthetic) data to
 *   replay with no external API. This data is generated, never committed.
 */

import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { SYMBOL_DEFINITIONS } from "../src/lib/market-data/symbols";
import {
  DEMO_SOURCE,
  generateDemoSeries,
} from "../src/lib/market-data/demo-generator";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding instruments…");
  for (const def of SYMBOL_DEFINITIONS) {
    await prisma.marketInstrument.upsert({
      where: { symbol: def.symbol },
      update: {
        displayName: def.displayName,
        baseCurrency: def.baseCurrency,
        quoteCurrency: def.quoteCurrency,
        pipSize: def.pipSize,
        pricePrecision: def.pricePrecision,
      },
      create: {
        symbol: def.symbol,
        displayName: def.displayName,
        baseCurrency: def.baseCurrency,
        quoteCurrency: def.quoteCurrency,
        pipSize: def.pipSize,
        pricePrecision: def.pricePrecision,
        enabled: true,
      },
    });
  }

  // Seed EUR/USD 5m demonstration candles.
  const symbol = "EURUSD";
  const timeframe = "5m";
  const instrument = await prisma.marketInstrument.findUniqueOrThrow({
    where: { symbol },
  });

  const existing = await prisma.marketCandle.count({
    where: { instrumentId: instrument.id, timeframe },
  });
  if (existing > 0) {
    console.log(`EUR/USD 5m already has ${existing} candles — skipping.`);
  } else {
    const candles = generateDemoSeries(symbol, timeframe);
    console.log(`Generating ${candles.length} EUR/USD 5m demo candles…`);
    const CHUNK = 1000;
    for (let i = 0; i < candles.length; i += CHUNK) {
      const chunk = candles.slice(i, i + CHUNK);
      await prisma.marketCandle.createMany({
        data: chunk.map((c) => ({
          instrumentId: instrument.id,
          timeframe,
          timestamp: BigInt(c.timestamp),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? null,
          source: DEMO_SOURCE,
        })),
      });
    }
    await prisma.dataImport.create({
      data: {
        instrumentId: instrument.id,
        symbol,
        timeframe,
        source: DEMO_SOURCE,
        fileName: "seed:generateDemoSeries",
        rowsRead: candles.length,
        rowsImported: candles.length,
        rowsRejected: 0,
        gapsDetected: 0,
        report: JSON.stringify({ note: "Deterministic demonstration data." }),
        status: "completed",
      },
    });
    console.log("EUR/USD 5m demonstration data seeded.");
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
