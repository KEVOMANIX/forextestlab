import type { PracticePerformance } from "@/lib/backtest/practice-performance";
import { Decimal } from "@/lib/decimal";

function formatMoney(value: string | number): string {
  const amount = new Decimal(value);
  const sign = amount.isZero() ? "" : amount.isNegative() ? "−" : "+";
  const [whole, fraction] = amount.abs().toFixed(2).split(".");
  return `${sign}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function unsigned(value: string | number): string {
  return formatMoney(new Decimal(value).abs().toFixed(2)).replace("+", "");
}

function tone(value: string | number): string {
  const amount = Number(value);
  return amount > 0 ? "text-profit" : amount < 0 ? "text-loss" : "app-muted";
}

/** A step of 1, 2 or 5 × 10ⁿ giving about three gridlines across the range. */
function niceStep(range: number): number {
  const raw = range / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

const WIDTH = 600;
const HEIGHT = 220;
const PAD = 12;

function CumulativeChart({ performance }: { performance: PracticePerformance }) {
  const { curve, drawdown } = performance;
  const low = Math.min(0, ...curve);
  const high = Math.max(0, ...curve);
  const step = niceStep(high - low || 1);
  const bottom = Math.floor(low / step) * step;
  const top = Math.ceil(high / step) * step || step;
  const y = (value: number) => PAD + (1 - (value - bottom) / (top - bottom)) * (HEIGHT - PAD * 2);
  const x = (index: number) => (index / Math.max(1, curve.length - 1)) * WIDTH;
  const line = curve.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `${line} L${WIDTH},${y(Math.max(bottom, 0)).toFixed(1)} L0,${y(Math.max(bottom, 0)).toFixed(1)} Z`;
  const ticks: number[] = [];
  for (let value = bottom; value <= top + step / 2; value += step) ticks.push(Math.round(value * 100) / 100);
  const trough = drawdown ? { left: (x(drawdown.troughIndex) / WIDTH) * 100, top: (y(curve[drawdown.troughIndex]!) / HEIGHT) * 100 } : null;

  return (
    <div className="relative mt-4" role="img" aria-label={`Cumulative P/L over the last ${performance.tradeCount} practice trades, ending at ${formatMoney(performance.netPnl)}.${drawdown ? ` The largest drawdown was ${unsigned(performance.maxDrawdown)}.` : ""}`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="block h-56 w-full" aria-hidden>
        {ticks.map((tick) => (
          <line key={tick} x1="0" x2={WIDTH} y1={y(tick)} y2={y(tick)} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={tick === 0 ? undefined : "4 4"} style={{ stroke: tick === 0 ? "var(--app-border)" : "var(--app-panel-2)" }} />
        ))}
        <path d={area} style={{ fill: "var(--app-accent-wash)" }} />
        <path d={line} fill="none" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--app-accent)" }} />
      </svg>
      {ticks.map((tick) => (
        <span key={tick} className="absolute left-0 -translate-y-1/2 rounded bg-[var(--app-panel)] px-1.5 font-mono text-[11px] app-muted" style={{ top: `${(y(tick) / HEIGHT) * 100}%` }}>{tick === 0 ? "$0" : formatMoney(tick).replace(".00", "")}</span>
      ))}
      {trough && (
        <>
          <span aria-hidden className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--app-panel)] bg-loss" style={{ left: `${trough.left}%`, top: `${trough.top}%` }} />
          <span className={`absolute whitespace-nowrap rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-0.5 text-[11px] ${trough.left > 70 ? "-translate-x-[calc(100%+10px)]" : "translate-x-2.5"} ${trough.top > 80 ? "-translate-y-[130%]" : "translate-y-1"}`} style={{ left: `${trough.left}%`, top: `${trough.top}%` }}>Max drawdown <span className="font-mono text-loss">−{unsigned(performance.maxDrawdown)}</span></span>
        </>
      )}
      <div className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-[0.1em] app-muted"><span>Oldest</span><span>Latest</span></div>
    </div>
  );
}

function Tile({ label, value, valueTone = "text-[var(--app-text)]", detail }: { label: string; value: string; valueTone?: string; detail: React.ReactNode }) {
  return (
    <article className="rounded-2xl border app-border bg-[var(--app-panel)] p-4 shadow-card sm:p-5">
      <p className="text-xs font-semibold app-muted">{label}</p>
      <p className={`mt-3 font-mono text-2xl font-semibold leading-none ${valueTone}`}>{value}</p>
      <p className="mt-2.5 text-xs app-muted">{detail}</p>
    </article>
  );
}

/** Headline numbers, cumulative P/L, and why the win rate does or does not pay. */
export function PerformanceOverview({ performance }: { performance: PracticePerformance }) {
  const { averageWin, averageLoss, winLossRatio, breakEvenWinRate } = performance;
  const lossWidth = winLossRatio ? Math.min(100, 100 / winLossRatio) : 100;
  return (
    <section className="mt-7" aria-labelledby="practice-performance">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Performance</p>
      <h2 id="practice-performance" className="mt-1.5 text-xl font-semibold">Last {performance.tradeCount} practice trade{performance.tradeCount === 1 ? "" : "s"}</h2>

      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
        <Tile label="Net P/L" value={formatMoney(performance.netPnl)} valueTone={tone(performance.netPnl)} detail={`Across ${performance.tradeCount} trade${performance.tradeCount === 1 ? "" : "s"}`} />
        <Tile label="Expectancy" value={formatMoney(performance.expectancy)} valueTone={tone(performance.expectancy)} detail="Average per trade" />
        <Tile label="Profit factor" value={performance.profitFactor === null ? "—" : performance.profitFactor.toFixed(2)} detail={`${unsigned(performance.grossProfit)} won · ${unsigned(performance.grossLoss)} lost`} />
        <Tile label="Win rate" value={`${performance.winRate.toFixed(0)}%`} detail={<><span className="text-profit">{performance.wins} W</span> · <span className="text-loss">{performance.losses} L</span></>} />
        <Tile label="Max drawdown" value={new Decimal(performance.maxDrawdown).isZero() ? "$0.00" : `−${unsigned(performance.maxDrawdown)}`} valueTone={new Decimal(performance.maxDrawdown).isZero() ? "app-muted" : "text-loss"} detail="Largest drop from a peak" />
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <article className="min-w-0 flex-[1.8_1_30rem] rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="font-semibold">Cumulative P/L</h3>
            <p className={`font-mono text-lg font-semibold ${tone(performance.netPnl)}`}>{formatMoney(performance.netPnl)}</p>
          </div>
          <CumulativeChart performance={performance} />
        </article>

        <article className="flex min-w-0 flex-[1_1_18rem] flex-col gap-4 rounded-2xl border app-border bg-[var(--app-panel)] p-5 shadow-card">
          <h3 className="font-semibold">Winners vs losers</h3>
          <div>
            <div className="flex justify-between text-sm"><span>Average win</span><span className="font-mono font-semibold text-profit">{averageWin ? formatMoney(averageWin) : "—"}</span></div>
            <div className="mt-2 h-2.5 rounded-full bg-[var(--app-panel-2)]"><div className="h-full rounded-full bg-profit" style={{ width: averageWin ? "100%" : "0%" }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-sm"><span>Average loss</span><span className="font-mono font-semibold text-loss">{averageLoss ? `−${unsigned(averageLoss)}` : "—"}</span></div>
            <div className="mt-2 h-2.5 rounded-full bg-[var(--app-panel-2)]"><div className="h-full rounded-full bg-loss" style={{ width: averageLoss ? `${lossWidth}%` : "0%" }} /></div>
          </div>
          <p className="rounded-xl bg-[var(--app-panel-2)]/60 px-3.5 py-3 text-sm leading-6">
            {winLossRatio !== null && breakEvenWinRate !== null
              ? <>Your average win is <strong>{winLossRatio.toFixed(1)}×</strong> your average loss, so you break even at a <strong>{breakEvenWinRate.toFixed(0)}%</strong> win rate.</>
              : !averageLoss ? "No losing trades in this window yet." : "No winning trades in this window yet."}
          </p>
          <dl className="mt-auto grid grid-cols-2 gap-3">
            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] app-muted">Best trade</dt><dd className={`mt-1 font-mono text-sm font-semibold ${tone(performance.bestTrade)}`}>{formatMoney(performance.bestTrade)}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] app-muted">Worst trade</dt><dd className={`mt-1 font-mono text-sm font-semibold ${tone(performance.worstTrade)}`}>{formatMoney(performance.worstTrade)}</dd></div>
          </dl>
        </article>
      </div>
    </section>
  );
}
