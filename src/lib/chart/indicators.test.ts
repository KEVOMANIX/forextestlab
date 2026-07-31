import { describe, expect, it } from "vitest";

import {
  adx,
  atr,
  bollinger,
  cci,
  cmf,
  donchian,
  ema,
  heikinAshi,
  hma,
  keltner,
  macd,
  mfi,
  obv,
  pickSource,
  regressionChannel,
  rma,
  roc,
  rsi,
  sma,
  stdev,
  stochRsi,
  stochastic,
  supertrend,
  vwap,
  williamsR,
  wma,
  zigzag,
  type OHLCV,
} from "./indicators";

/**
 * Reference values are hand-computed from the definitions, not captured from
 * this implementation — a snapshot of current behaviour would pass just as
 * happily when the maths is wrong.
 */

function candles(
  rows: [high: number, low: number, close: number, volume?: number][],
  open?: number[],
): OHLCV[] {
  return rows.map(([high, low, close, volume], i) => ({
    time: 1_700_000_000 + i * 60,
    open: open?.[i] ?? close,
    high,
    low,
    close,
    ...(volume === undefined ? {} : { volume }),
  }));
}

/** Closes only, with high/low pinned to the close. */
function closes(values: number[]): OHLCV[] {
  return candles(values.map((v) => [v, v, v]));
}

const nearly = (value: number | null, expected: number, digits = 6) => {
  expect(value).not.toBeNull();
  expect(value as number).toBeCloseTo(expected, digits);
};

describe("moving averages", () => {
  it("holds back an SMA until the window is full", () => {
    expect(sma([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });

  it("seeds an EMA from the simple average of the first window", () => {
    // Seed = (1+2+3)/3 = 2. k = 2/4 = 0.5 → 4*0.5 + 2*0.5 = 3.
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    nearly(out[2]!, 2);
    nearly(out[3]!, 3);
    nearly(out[4]!, 4);
  });

  it("weights a WMA towards the most recent bar", () => {
    // (3·3 + 2·2 + 1·1) / 6 = 14/6.
    nearly(wma([1, 2, 3], 3)[2]!, 14 / 6);
  });

  it("uses Wilder smoothing for RMA", () => {
    // Seed 2, then (2·2 + 4)/3 = 8/3.
    const out = rma([1, 2, 3, 4], 3);
    nearly(out[2]!, 2);
    nearly(out[3]!, 8 / 3);
  });

  it("tracks a straight line exactly with the Hull average", () => {
    // Every MA of a perfect ramp is the ramp itself, so HMA must sit on it.
    const ramp = Array.from({ length: 40 }, (_, i) => i + 1);
    nearly(hma(ramp, 9)[39]!, 40, 6);
  });

  it("reads the requested price source", () => {
    const bar = candles([[10, 4, 8]], [6]);
    expect(pickSource(bar, "hl2")).toEqual([7]);
    expect(pickSource(bar, "hlc3")).toEqual([(10 + 4 + 8) / 3]);
    expect(pickSource(bar, "ohlc4")).toEqual([(6 + 10 + 4 + 8) / 4]);
  });
});

describe("bands and channels", () => {
  it("puts Bollinger bands a population sigma either side", () => {
    // [2,4,6]: mean 4, population sd = sqrt(8/3).
    const sd = Math.sqrt(8 / 3);
    nearly(stdev([2, 4, 6], 3)[2]!, sd);
    const band = bollinger([2, 4, 6], 3, 2)[2]!;
    nearly(band.middle, 4);
    nearly(band.upper, 4 + 2 * sd);
    nearly(band.lower, 4 - 2 * sd);
  });

  it("centres Donchian between the window extremes", () => {
    const band = donchian(candles([[5, 1, 3], [7, 2, 6], [6, 3, 4]]), 3)[2]!;
    expect(band.upper).toBe(7);
    expect(band.lower).toBe(1);
    expect(band.middle).toBe(4);
  });

  it("builds Keltner from an EMA and an ATR", () => {
    const bars = candles(Array.from({ length: 30 }, (_, i) => [i + 2, i, i + 1] as [number, number, number]));
    const band = keltner(bars, 20, 10, 2)[29]!;
    const mid = ema(bars.map((c) => c.close), 20)[29]!;
    const range = atr(bars, 10)[29]!;
    nearly(band.middle, mid);
    nearly(band.upper, mid + 2 * range);
    nearly(band.lower, mid - 2 * range);
  });
});

describe("volatility", () => {
  it("takes the true range from the widest of the three measures", () => {
    // Gap down: |low − prevClose| = 6 beats the 2-wide bar.
    const bars = candles([[10, 8, 9], [5, 3, 4]]);
    const out = atr(bars, 1);
    expect(out[0]).toBe(2);
    nearly(out[1]!, 6);
  });
});

describe("momentum", () => {
  it("pegs RSI at 100 when every bar closes up", () => {
    const out = rsi(Array.from({ length: 20 }, (_, i) => i + 1), 14);
    expect(out[13]).toBe(null);
    expect(out[14]).toBe(100);
  });

  it("oscillates tightly around 50 for alternating equal gains and losses", () => {
    // Wilder smoothing weights the newest bar, so the reading alternates a
    // couple of points either side of neutral rather than sitting exactly on it.
    const values = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : 0));
    const out = rsi(values, 14);
    for (const value of out.slice(20)) {
      expect(value).not.toBeNull();
      expect(Math.abs((value as number) - 50)).toBeLessThan(3);
    }
    // Consecutive bars straddle 50, so a pair averages out to about it.
    const pair = ((out[58] as number) + (out[59] as number)) / 2;
    expect(Math.abs(pair - 50)).toBeLessThan(0.2);
  });

  it("derives the MACD histogram from its own line and signal", () => {
    const values = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 5);
    const point = macd(values, 12, 26, 9)[79]!;
    const fast = ema(values, 12)[79]!;
    const slow = ema(values, 26)[79]!;
    nearly(point.macd, fast - slow);
    nearly(point.hist, (point.macd as number) - (point.signal as number));
  });

  it("puts %K at the top of the range on a new high", () => {
    const bars = candles([[10, 0, 5], [10, 0, 5], [10, 0, 10]]);
    const point = stochastic(bars, 3, 1, 1)[2]!;
    expect(point.k).toBe(100);
  });

  it("does not let the warm-up gap drag %D towards zero", () => {
    // %D is an average of %K, so with %K flat at 100 it must also be 100 the
    // moment it appears. Treating the leading nulls as zeros used to halve it.
    const flat = candles(Array.from({ length: 20 }, () => [10, 0, 10] as [number, number, number]));
    const point = stochastic(flat, 5, 3, 3)[19]!;
    expect(point.k).toBe(100);
    expect(point.d).toBe(100);
    for (const p of stochastic(flat, 5, 3, 3)) {
      if (p.d != null) expect(p.d).toBe(100);
    }
  });

  it("keeps Stochastic RSI inside 0–100 and free of the same gap bias", () => {
    const values = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 7) * 3);
    for (const point of stochRsi(values, 14, 14, 3, 3)) {
      if (point.k != null) {
        expect(point.k).toBeGreaterThanOrEqual(0);
        expect(point.k).toBeLessThanOrEqual(100);
      }
      if (point.d != null) {
        expect(point.d).toBeGreaterThanOrEqual(0);
        expect(point.d).toBeLessThanOrEqual(100);
      }
    }
    // A monotonic ramp keeps RSI pinned, so %K and %D sit at the top together.
    const ramp = Array.from({ length: 120 }, (_, i) => 100 + i);
    const last = stochRsi(ramp, 14, 14, 3, 3)[119]!;
    nearly(last.k!, 100);
    nearly(last.d!, 100);
  });

  it("reports Williams %R as zero at the high and −100 at the low", () => {
    const atHigh = candles([[10, 0, 5], [10, 0, 10]]);
    expect(williamsR(atHigh, 2)[1]).toBe(0);
    const atLow = candles([[10, 0, 5], [10, 0, 0]]);
    expect(williamsR(atLow, 2)[1]).toBe(-100);
  });

  it("measures rate of change as a percentage of the earlier bar", () => {
    expect(roc([100, 0, 0, 110], 3)[3]).toBe(10);
    expect(roc([100, 110], 3)[1]).toBe(null);
  });

  it("scales CCI by the mean absolute deviation", () => {
    const bars = candles([[2, 2, 2], [4, 4, 4], [9, 9, 9]]);
    // TP = [2,4,9]; SMA = 5; mean deviation = (3+1+4)/3 = 8/3.
    nearly(cci(bars, 3)[2]!, (9 - 5) / (0.015 * (8 / 3)));
  });

  it("drives ADX towards its ceiling in a one-way market", () => {
    const bars = candles(Array.from({ length: 80 }, (_, i) => [100 + i * 2, 99 + i * 2, 100 + i * 2] as [number, number, number]));
    const point = adx(bars, 14, 14)[79]!;
    expect(point.plusDI).toBeGreaterThan(point.minusDI as number);
    expect(point.adx).toBeGreaterThan(50);
  });
});

describe("trend", () => {
  it("keeps Supertrend below price in an uptrend and flips on a reversal", () => {
    const up = candles(Array.from({ length: 40 }, (_, i) => [100 + i, 99 + i, 100 + i] as [number, number, number]));
    const rising = supertrend(up, 10, 3)[39]!;
    expect(rising.up).toBe(true);
    expect(rising.value).toBeLessThan(up[39]!.close);

    const reversal = [
      ...up,
      ...Array.from({ length: 20 }, (_, i) => ({
        time: 1_700_000_000 + (40 + i) * 60,
        open: 140 - i * 6,
        high: 141 - i * 6,
        low: 138 - i * 6,
        close: 139 - i * 6,
      })),
    ];
    const flipped = supertrend(reversal, 10, 3).at(-1)!;
    expect(flipped.up).toBe(false);
    expect(flipped.value).toBeGreaterThan(reversal.at(-1)!.close);
  });
});

describe("volume-based indicators", () => {
  const withVolume = candles([
    [10, 8, 9, 100],
    [11, 9, 10, 200],
    [10, 8, 9, 150],
  ]);

  it("adds volume on an up close and subtracts it on a down close", () => {
    expect(obv(withVolume)).toEqual([0, 200, 50]);
  });

  it("plots nothing at all when the feed carries no volume", () => {
    // Spot FX often has none. A flat zero line reads as a measurement; an empty
    // plot correctly says there was nothing to measure.
    const noVolume = closes([1, 2, 3, 2, 1]);
    expect(obv(noVolume).every((v) => v === null)).toBe(true);

    const longEnough = candles(
      Array.from({ length: 40 }, (_, i) => [101 + (i % 3), 99 + (i % 3), 100 + (i % 3)] as [number, number, number]),
    );
    expect(mfi(longEnough, 14).every((v) => v === null)).toBe(true);
    expect(cmf(longEnough, 20).every((v) => v === null)).toBe(true);
  });

  it("still reports money flow when volume is present", () => {
    const bars = candles(
      Array.from({ length: 40 }, (_, i) => [101 + (i % 3), 99 + (i % 3), 100 + (i % 3), 500] as [number, number, number, number]),
    );
    expect(mfi(bars, 14).some((v) => v != null)).toBe(true);
    expect(cmf(bars, 20).some((v) => v != null)).toBe(true);
  });

  it("weights VWAP towards the heavier bars", () => {
    const bars = candles([[10, 10, 10, 1], [20, 20, 20, 3]]);
    // (10·1 + 20·3) / 4 = 17.5.
    nearly(vwap(bars)[1]!, 17.5);
  });
});

describe("structural", () => {
  it("marks a Zig Zag pivot only after the deviation is retraced", () => {
    const rally = Array.from({ length: 20 }, (_, i) => [100 + i, 99 + i, 100 + i] as [number, number, number]);
    const drop = Array.from({ length: 20 }, (_, i) => [119 - i * 2, 118 - i * 2, 118 - i * 2] as [number, number, number]);
    const pivots = zigzag(candles([...rally, ...drop]), 5, 3);
    expect(pivots.length).toBeGreaterThanOrEqual(2);
    // The swing high is the top of the rally, not a bar part-way down it.
    expect(Math.max(...pivots.map((p) => p.price))).toBe(119);
  });

  it("fits a regression channel through the window with symmetric bands", () => {
    const ramp = Array.from({ length: 10 }, (_, i) => i * 2);
    const channel = regressionChannel(ramp, 10, 2);
    // A perfect line has zero residual, so all three lines coincide.
    nearly(channel.mid[9]!, 18);
    nearly(channel.upper[9]!, 18);
    nearly(channel.lower[9]!, 18);
    nearly(channel.mid[0]!, 0);
  });

  it("leaves bars before the regression window empty", () => {
    const values = Array.from({ length: 20 }, (_, i) => i);
    const channel = regressionChannel(values, 5, 2);
    expect(channel.mid.slice(0, 15).every((v) => v === null)).toBe(true);
    expect(channel.mid[15]).not.toBeNull();
  });

  it("derives Heikin-Ashi bars from the raw candles", () => {
    const bars = candles([[10, 6, 8], [12, 7, 11]], [7, 8]);
    const ha = heikinAshi(bars);
    // First HA close is the plain average of the bar.
    nearly(ha[0]!.close, (7 + 10 + 6 + 8) / 4);
    // The next open is the midpoint of the previous HA bar.
    nearly(ha[1]!.open, (ha[0]!.open + ha[0]!.close) / 2);
    nearly(ha[1]!.close, (8 + 12 + 7 + 11) / 4);
    expect(ha[1]!.high).toBeGreaterThanOrEqual(ha[1]!.close);
    expect(ha[1]!.low).toBeLessThanOrEqual(ha[1]!.close);
  });
});

describe("alignment", () => {
  it("returns one value per candle for every indicator", () => {
    const bars = candles(
      Array.from({ length: 120 }, (_, i) => [
        101 + Math.sin(i / 6) * 4,
        99 + Math.sin(i / 6) * 4,
        100 + Math.sin(i / 6) * 4,
        1000 + i,
      ] as [number, number, number, number]),
    );
    const values = bars.map((c) => c.close);
    const n = bars.length;
    expect(sma(values, 20)).toHaveLength(n);
    expect(rsi(values, 14)).toHaveLength(n);
    expect(macd(values)).toHaveLength(n);
    expect(atr(bars, 14)).toHaveLength(n);
    expect(bollinger(values, 20, 2)).toHaveLength(n);
    expect(stochastic(bars)).toHaveLength(n);
    expect(stochRsi(values)).toHaveLength(n);
    expect(adx(bars)).toHaveLength(n);
    expect(cci(bars)).toHaveLength(n);
    expect(williamsR(bars)).toHaveLength(n);
    expect(mfi(bars)).toHaveLength(n);
    expect(cmf(bars)).toHaveLength(n);
    expect(obv(bars)).toHaveLength(n);
    expect(supertrend(bars)).toHaveLength(n);
    expect(heikinAshi(bars)).toHaveLength(n);
  });

  it("survives a series shorter than the lookback without throwing", () => {
    const tiny = candles([[2, 1, 1.5, 10]]);
    expect(() => {
      sma([1.5], 20);
      rsi([1.5], 14);
      macd([1.5]);
      atr(tiny, 14);
      stochastic(tiny);
      stochRsi([1.5]);
      adx(tiny);
      supertrend(tiny);
      zigzag(tiny);
      regressionChannel([1.5], 20);
    }).not.toThrow();
    expect(atr(tiny, 14)[0]).toBe(null);
  });
});
