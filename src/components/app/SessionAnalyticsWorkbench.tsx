"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, BarChart3, Clock3, Filter, LockKeyhole, Search, ShieldAlert, Target, TrendingDown, TrendingUp } from "lucide-react";

import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";
import { formatNewYorkDateTime, getNewYorkDateParts, getTradingSession, newYorkMonthKey } from "@/lib/date-time";
import { TradesTable } from "./TradesTable";

type TradeFilter = "all" | "long" | "short" | "winners" | "losers";
type AnalyticsTab = "overview" | "risk" | "timing" | "trades";

const W = 760;
const H = 220;
const PAD = 18;
const COLORS = { green: "#22c3a0", red: "#f4646c", blue: "#60a5fa", amber: "#fbbf24" };

function money(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(value);
}

function durationLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function linePath(values: number[], width = W, height = H, pad = PAD): { path: string; x: (index: number) => number; y: (value: number) => number; min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const x = (index: number) => pad + index * ((width - pad * 2) / Math.max(1, values.length - 1));
  const y = (value: number) => pad + (1 - (value - min) / spread) * (height - pad * 2);
  return { path: values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" "), x, y, min, max };
}

function EmptyChart({ text = "Not enough trades to build this chart yet." }: { text?: string }) {
  return <div className="grid min-h-44 place-items-center rounded-xl border border-dashed app-border bg-[var(--app-panel-2)]/35 p-6 text-center text-sm app-muted">{text}</div>;
}

function ChartFrame({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <article className={`panel min-w-0 p-5 ${className}`}>
      <div><h3 className="font-semibold">{title}</h3>{subtitle && <p className="mt-1 text-xs app-muted">{subtitle}</p>}</div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function EquityDrawdownChart({ points, trades }: { points: EquityPoint[]; trades: ClosedTrade[] }) {
  const [range, setRange] = useState<"all" | "500" | "100">("all");
  const [hovered, setHovered] = useState<number | null>(null);
  const sampled = useMemo(() => {
    const limit = range === "all" ? points.length : Number(range);
    const source = points.slice(-limit);
    const stride = Math.max(1, Math.ceil(source.length / 360));
    const result = source.filter((_, index) => index % stride === 0);
    const final = source.at(-1);
    if (final && result.at(-1)?.time !== final.time) result.push(final);
    return result;
  }, [points, range]);
  if (sampled.length < 2) return <EmptyChart text="Replay this session further to build equity and drawdown history." />;

  const equity = sampled.map((point) => Number(point.equity));
  const balance = sampled.map((point) => Number(point.balance));
  let peak = equity[0]!;
  const drawdowns = equity.map((value) => { peak = Math.max(peak, value); return peak - value; });
  const minValue = Math.min(...equity, ...balance);
  const maxValue = Math.max(...equity, ...balance);
  const valueSpread = maxValue - minValue || 1;
  const x = (index: number) => PAD + index * ((W - PAD * 2) / Math.max(1, sampled.length - 1));
  const y = (value: number) => PAD + (1 - (value - minValue) / valueSpread) * (H - PAD * 2);
  const eqPath = equity.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const balPath = balance.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const dd = linePath(drawdowns, W, 90, 12);
  const activeIndex = hovered ?? sampled.length - 1;
  const active = sampled[activeIndex]!;
  const markerIndexes = trades.slice(-80).map((trade) => {
    let closest = 0;
    let distance = Infinity;
    sampled.forEach((point, index) => { const next = Math.abs(point.time - trade.exitTime); if (next < distance) { distance = next; closest = index; } });
    return { trade, index: closest };
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-xs"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-400" />Equity</span><span className="flex items-center gap-1.5 app-muted"><i className="h-2 w-2 rounded-full bg-blue-400" />Balance</span></div>
        <div className="inline-flex rounded-lg border app-border bg-[var(--app-panel-2)] p-1">{([['all','All'],['500','Recent 500'],['100','Recent 100']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => { setRange(id); setHovered(null); }} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${range === id ? "bg-white/[0.08]" : "app-muted"}`}>{label}</button>)}</div>
      </div>
      <div className="relative overflow-hidden rounded-xl border app-border bg-[var(--app-panel-2)]/50">
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border app-border bg-[var(--app-panel)]/95 px-3 py-2 text-[11px] shadow-lg"><p className="app-muted">{formatNewYorkDateTime(active.time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 flex gap-3 font-mono font-semibold"><span className="text-brand-300">E ${Number(active.equity).toFixed(2)}</span><span className="text-blue-300">B ${Number(active.balance).toFixed(2)}</span><span className="text-bear">DD ${drawdowns[activeIndex]!.toFixed(2)}</span></p></div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full touch-none" preserveAspectRatio="none" onPointerMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); setHovered(Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (sampled.length - 1))); }} onPointerLeave={() => setHovered(null)} role="img" aria-label="Interactive equity and balance with trade markers">
          <defs><linearGradient id="analytics-equity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={COLORS.green} stopOpacity=".24"/><stop offset="1" stopColor={COLORS.green} stopOpacity="0"/></linearGradient></defs>
          <path d={`${eqPath} L${W-PAD},${H-PAD} L${PAD},${H-PAD} Z`} fill="url(#analytics-equity-fill)"/><path d={balPath} fill="none" stroke={COLORS.blue} strokeWidth="2" vectorEffect="non-scaling-stroke"/><path d={eqPath} fill="none" stroke={COLORS.green} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
          {markerIndexes.map(({trade,index}) => <circle key={trade.id} cx={x(index)} cy={y(equity[index]!)} r="3" fill={Number(trade.pnl) >= 0 ? COLORS.green : COLORS.red}><title>{`${trade.direction} ${money(Number(trade.pnl))}`}</title></circle>)}
          <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PAD} y2={H-PAD} stroke="currentColor" strokeOpacity=".25" strokeDasharray="4 4"/><circle cx={x(activeIndex)} cy={y(equity[activeIndex]!)} r="4" fill={COLORS.green} stroke="white" strokeWidth="1"/>
        </svg>
        <div className="border-t app-border px-3 pt-2"><p className="text-[10px] font-semibold uppercase tracking-wider app-muted">Drawdown underwater</p><svg viewBox="0 0 760 90" className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Drawdown chart"><path d={`${dd.path} L748,78 L12,78 Z`} fill="rgba(244,100,108,.18)"/><path d={dd.path} fill="none" stroke={COLORS.red} strokeWidth="2" vectorEffect="non-scaling-stroke"/><line x1={dd.x(activeIndex)} x2={dd.x(activeIndex)} y1="12" y2="78" stroke="currentColor" strokeOpacity=".2" strokeDasharray="4 4"/></svg></div>
      </div>
    </div>
  );
}

function CumulativePnlChart({ trades, hovered, onHover }: { trades: ClosedTrade[]; hovered: number | null; onHover: (index: number | null) => void }) {
  if (!trades.length) return <EmptyChart />;
  let total = 0;
  const values = [0, ...trades.map((trade) => (total += Number(trade.pnl)))];
  const chart = linePath(values);
  const active = hovered == null ? values.length - 1 : Math.min(values.length - 1, hovered + 1);
  const positive = values.at(-1)! >= 0;
  return <div className="relative"><div className="absolute right-2 top-2 z-10 rounded-md bg-[var(--app-panel-2)] px-2 py-1 font-mono text-xs font-semibold">{money(values[active]!)}</div><svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full touch-none" preserveAspectRatio="none" onPointerMove={(event) => { const box=event.currentTarget.getBoundingClientRect(); onHover(Math.max(0,Math.min(trades.length-1,Math.round(((event.clientX-box.left)/box.width)*(trades.length-1))))); }} onPointerLeave={() => onHover(null)} role="img" aria-label="Cumulative profit and loss by trade"><line x1={PAD} x2={W-PAD} y1={chart.y(0)} y2={chart.y(0)} stroke="currentColor" strokeOpacity=".18"/><path d={chart.path} fill="none" stroke={positive ? COLORS.green : COLORS.red} strokeWidth="3" vectorEffect="non-scaling-stroke"/><line x1={chart.x(active)} x2={chart.x(active)} y1={PAD} y2={H-PAD} stroke="currentColor" strokeOpacity=".22" strokeDasharray="4 4"/><circle cx={chart.x(active)} cy={chart.y(values[active]!)} r="4" fill={positive ? COLORS.green : COLORS.red}/></svg></div>;
}

function PnlHistogram({ trades }: { trades: ClosedTrade[] }) {
  if (trades.length < 2) return <EmptyChart />;
  const values = trades.map((trade) => Number(trade.pnl));
  const min = Math.min(...values); const max = Math.max(...values); const bins = 10; const size = (max-min || 1)/bins;
  const counts = Array.from({length:bins},()=>0); values.forEach((value)=>{ counts[Math.min(bins-1,Math.floor((value-min)/size))]! += 1; });
  const peak = Math.max(...counts,1);
  return <div><div className="flex h-48 items-end gap-1.5">{counts.map((count,index)=>{const start=min+index*size; return <div key={index} className="group relative flex-1"><div className={`w-full rounded-t ${start+size/2>=0 ? "bg-brand-500/75" : "bg-bear/75"}`} style={{height:`${Math.max(4,(count/peak)*180)}px`}}/><span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--app-panel-2)] px-2 py-1 text-[10px] group-hover:block">{count} trades · {money(start)} to {money(start+size)}</span></div>;})}</div><div className="mt-2 flex justify-between font-mono text-[10px] app-muted"><span>{money(min)}</span><span>{money(max)}</span></div></div>;
}

function ExitDonut({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const labels: { key: ClosedTrade["exitReason"]; label: string; color: string }[] = [{key:"take-profit",label:"Take profit",color:COLORS.green},{key:"stop-loss",label:"Stop loss",color:COLORS.red},{key:"manual",label:"Manual",color:COLORS.blue},{key:"session-end",label:"Session end",color:COLORS.amber}];
  let offset=0;
  return <div className="grid items-center gap-4 sm:grid-cols-[150px_1fr]"><svg viewBox="0 0 120 120" className="mx-auto h-36 w-36 -rotate-90" role="img" aria-label="Exit reason distribution">{labels.map(item=>{const count=trades.filter(t=>t.exitReason===item.key).length; const pct=count/trades.length; const dash=`${pct*276.46} ${276.46-pct*276.46}`; const node=<circle key={item.key} cx="60" cy="60" r="44" fill="none" stroke={item.color} strokeWidth="14" strokeDasharray={dash} strokeDashoffset={-offset}/>; offset+=pct*276.46; return node;})}<circle cx="60" cy="60" r="29" fill="var(--app-panel)"/></svg><div className="space-y-2">{labels.map(item=>{const count=trades.filter(t=>t.exitReason===item.key).length; return <div key={item.key} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 app-muted"><i className="h-2.5 w-2.5 rounded-full" style={{background:item.color}}/>{item.label}</span><strong className="font-mono">{count} · {((count/trades.length)*100).toFixed(0)}%</strong></div>;})}</div></div>;
}

function DirectionComparison({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  return <div className="grid gap-3 sm:grid-cols-2">{([['long','Buy',COLORS.green],['short','Sell',COLORS.red]] as const).map(([direction,label,color])=>{const group=trades.filter(t=>t.direction===direction); const wins=group.filter(t=>Number(t.pnl)>0).length; const net=group.reduce((sum,t)=>sum+Number(t.pnl),0); const grossWin=group.reduce((sum,t)=>sum+Math.max(0,Number(t.pnl)),0); const grossLoss=Math.abs(group.reduce((sum,t)=>sum+Math.min(0,Number(t.pnl)),0)); return <div key={direction} className="rounded-xl border app-border bg-[var(--app-panel-2)]/50 p-4"><div className="flex items-center justify-between"><strong style={{color}}>{label}</strong><span className="font-mono text-sm font-semibold">{money(net)}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="app-muted">Trades</dt><dd className="mt-1 font-mono font-semibold">{group.length}</dd></div><div><dt className="app-muted">Win rate</dt><dd className="mt-1 font-mono font-semibold">{group.length ? ((wins/group.length)*100).toFixed(1) : '0.0'}%</dd></div><div><dt className="app-muted">Average</dt><dd className="mt-1 font-mono font-semibold">{money(group.length?net/group.length:0)}</dd></div><div><dt className="app-muted">Profit factor</dt><dd className="mt-1 font-mono font-semibold">{grossLoss? (grossWin/grossLoss).toFixed(2):'—'}</dd></div></dl></div>;})}</div>;
}

function StreakChart({ trades, hovered, onHover }: { trades: ClosedTrade[]; hovered: number | null; onHover: (index: number | null) => void }) {
  if (!trades.length) return <EmptyChart />;
  return <div><div className="flex flex-wrap gap-1">{trades.map((trade,index)=><button key={trade.id} type="button" onMouseEnter={()=>onHover(index)} onMouseLeave={()=>onHover(null)} className={`h-8 min-w-2 flex-1 rounded-sm transition-transform ${Number(trade.pnl)>0?'bg-brand-500':Number(trade.pnl)<0?'bg-bear':'bg-slate-500'} ${hovered===index?'scale-y-125 ring-1 ring-white':''}`} title={`Trade ${index+1}: ${money(Number(trade.pnl))}`} aria-label={`Trade ${index+1} ${Number(trade.pnl)>=0?'win':'loss'} ${money(Number(trade.pnl))}`}/>)}</div><div className="mt-3 flex justify-between text-xs app-muted"><span>First trade</span><span>Latest trade</span></div></div>;
}

function PeriodBars({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const periods = new Map<string,number>(); trades.forEach(t=>{const key=newYorkMonthKey(t.exitTime); periods.set(key,(periods.get(key)??0)+Number(t.pnl));});
  const rows=[...periods.entries()]; const max=Math.max(...rows.map(([,v])=>Math.abs(v)),1);
  return <div className="space-y-3">{rows.map(([period,value])=><div key={period} className="grid grid-cols-[70px_1fr_85px] items-center gap-3 text-xs"><span className="font-mono app-muted">{period}</span><div className="relative h-3 rounded-full bg-white/[0.05]"><div className={`absolute top-0 h-3 rounded-full ${value>=0?'left-1/2 bg-brand-500':'right-1/2 bg-bear'}`} style={{width:`${Math.max(2,(Math.abs(value)/max)*50)}%`}}/></div><strong className={`text-right font-mono ${value>=0?'text-brand-300':'text-bear'}`}>{money(value)}</strong></div>)}</div>;
}

function CategoryProfitBars({ rows }: { rows: { label: string; value: number; trades: number }[] }) {
  const peak=Math.max(...rows.map(row=>Math.abs(row.value)),1);
  return <div className="flex h-56 items-end gap-2 sm:gap-3">{rows.map(row=>{const height=Math.max(4,(Math.abs(row.value)/peak)*160);return <div key={row.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end"><span className={`mb-2 hidden whitespace-nowrap font-mono text-[10px] font-semibold sm:block ${row.value>=0?'text-brand-300':'text-bear'}`}>{money(row.value)}</span><div className="relative flex h-40 w-full items-center justify-center"><span className={`absolute w-full max-w-14 rounded-t-md ${row.value>=0?'bottom-1/2 bg-brand-500/80':'top-1/2 rounded-b-md rounded-t-none bg-bear/80'}`} style={{height:`${height/2}px`}}/><span className="pointer-events-none absolute bottom-full z-10 mb-2 hidden whitespace-nowrap rounded-lg border app-border bg-[var(--app-panel-2)] px-2 py-1 text-[10px] shadow-lg group-hover:block">{row.trades} trades · {money(row.value)}</span></div><span className="mt-2 truncate text-[10px] font-semibold app-muted sm:text-xs">{row.label}</span></div>;})}</div>;
}

function WeekdayProfitChart({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const labels=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const rows=labels.map(label=>({label,value:0,trades:0}));
  trades.forEach(trade=>{const row=rows[getNewYorkDateParts(trade.entryTime).weekday]!;row.value+=Number(trade.pnl);row.trades+=1;});
  return <CategoryProfitBars rows={rows}/>;
}

function TradingSessionProfitChart({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const labels=["Asia","London","New York","Rollover"] as const;
  const rows=labels.map(label=>({label,value:0,trades:0}));
  trades.forEach(trade=>{const row=rows.find(item=>item.label===getTradingSession(trade.entryTime))!;row.value+=Number(trade.pnl);row.trades+=1;});
  return <CategoryProfitBars rows={rows}/>;
}

function TimingHeatmap({ trades }: { trades: ClosedTrade[] }) {
  if (!trades.length) return <EmptyChart />;
  const cells=Array.from({length:7},()=>Array.from({length:24},()=>({pnl:0,count:0})));
  trades.forEach(t=>{const date=getNewYorkDateParts(t.entryTime); const cell=cells[date.weekday]![date.hour]!; cell.pnl+=Number(t.pnl); cell.count+=1;});
  const max=Math.max(...cells.flat().map(c=>Math.abs(c.pnl)),1); const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[40px_repeat(24,1fr)] gap-1 text-[9px] app-muted"><span/>{Array.from({length:24},(_,h)=><span key={h} className="text-center">{h}</span>)}{cells.map((row,day)=><div key={day} className="contents"><span className="self-center">{days[day]}</span>{row.map((cell,h)=>{const strength=Math.abs(cell.pnl)/max; const bg=cell.count===0?'rgba(255,255,255,.035)':cell.pnl>=0?`rgba(34,195,160,${.18+strength*.72})`:`rgba(244,100,108,${.18+strength*.72})`; return <span key={h} className="h-7 rounded" style={{background:bg}} title={`${days[day]} ${h}:00 New York · ${cell.count} trades · ${money(cell.pnl)}`}/>;})}</div>)}</div><p className="mt-3 text-[10px] app-muted">Entry time in New York · stronger colour means larger net P/L</p></div></div>;
}

function RiskScatter({ trades }: { trades: ClosedTrade[] }) {
  const recorded=trades.filter(t=>Number(t.initialRiskAmount)>0);
  if (!recorded.length) return <EmptyChart text="MAE/MFE and initial-risk tracking is available for trades opened after the analytics upgrade." />;
  const durations=recorded.map(t=>(t.exitTime-t.entryTime)/60000); const multiples=recorded.map(t=>Number(t.pnl)/Number(t.initialRiskAmount)); const maxX=Math.max(...durations,1); const minY=Math.min(...multiples,-1); const maxY=Math.max(...multiples,1); const spread=maxY-minY||1;
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Risk reward and duration scatter plot"><line x1={PAD} x2={W-PAD} y1={PAD+(1-(0-minY)/spread)*(H-PAD*2)} y2={PAD+(1-(0-minY)/spread)*(H-PAD*2)} stroke="currentColor" strokeOpacity=".2"/>{recorded.map((trade,index)=>{const x=PAD+(durations[index]!/maxX)*(W-PAD*2); const y=PAD+(1-(multiples[index]!-minY)/spread)*(H-PAD*2); return <circle key={trade.id} cx={x} cy={y} r={Math.max(4,Math.min(11,3+Number(trade.lots)*3))} fill={trade.direction==='long'?COLORS.green:COLORS.red} fillOpacity=".78"><title>{`${trade.direction} · ${durationLabel(trade.exitTime-trade.entryTime)} · ${multiples[index]!.toFixed(2)}R · ${money(Number(trade.pnl))}`}</title></circle>;})}<text x={W-20} y={H-5} textAnchor="end" fill="currentColor" opacity=".55" fontSize="10">Duration →</text><text x="8" y="14" fill="currentColor" opacity=".55" fontSize="10">R multiple</text></svg>;
}

function ExcursionChart({ trades }: { trades: ClosedTrade[] }) {
  const recorded=trades.filter(t=>t.maxFavorablePnl!==undefined&&t.maxAdversePnl!==undefined);
  if (!recorded.length) return <EmptyChart text="MAE/MFE tracking is available for trades opened after the analytics upgrade." />;
  const max=Math.max(...recorded.flatMap(t=>[Math.abs(Number(t.maxFavorablePnl)),Math.abs(Number(t.maxAdversePnl))]),1);
  return <div className="space-y-2">{recorded.slice(-20).map((trade,index)=><div key={trade.id} className="grid grid-cols-[38px_1fr_1fr] items-center gap-1 text-[10px]"><span className="font-mono app-muted">#{recorded.length-Math.min(20,recorded.length)+index+1}</span><div className="flex justify-end"><span className="h-2.5 rounded-l bg-bear" style={{width:`${Math.max(2,(Math.abs(Number(trade.maxAdversePnl))/max)*100)}%`}} title={`MAE ${money(Number(trade.maxAdversePnl))}`}/></div><div><span className="block h-2.5 rounded-r bg-brand-500" style={{width:`${Math.max(2,(Math.abs(Number(trade.maxFavorablePnl))/max)*100)}%`}} title={`MFE ${money(Number(trade.maxFavorablePnl))}`}/></div></div>)}<div className="grid grid-cols-2 text-[10px] app-muted"><span className="text-right pr-2">← MAE</span><span className="pl-2">MFE →</span></div></div>;
}

export function SessionAnalyticsWorkbench({ trades, equityCurve, startingBalance, fullAccess = true }: { trades: ClosedTrade[]; equityCurve: EquityPoint[]; startingBalance: string; fullAccess?: boolean }) {
  const [tab,setTab]=useState<AnalyticsTab>("overview"); const [filter,setFilter]=useState<TradeFilter>("all"); const [query,setQuery]=useState(""); const [hoveredTrade,setHoveredTrade]=useState<number|null>(null);
  const filtered=useMemo(()=>trades.filter(t=>filter==='all'||filter==='long'&&t.direction==='long'||filter==='short'&&t.direction==='short'||filter==='winners'&&Number(t.pnl)>0||filter==='losers'&&Number(t.pnl)<0),[trades,filter]);
  const searched=useMemo(()=>filtered.filter(t=>`${t.id} ${t.direction} ${t.exitReason} ${t.entryPrice} ${t.exitPrice}`.toLowerCase().includes(query.toLowerCase())),[filtered,query]);
  const wins=filtered.filter(t=>Number(t.pnl)>0); const losses=filtered.filter(t=>Number(t.pnl)<0); const net=filtered.reduce((s,t)=>s+Number(t.pnl),0); const grossWin=wins.reduce((s,t)=>s+Number(t.pnl),0); const grossLoss=Math.abs(losses.reduce((s,t)=>s+Number(t.pnl),0)); const expectancy=filtered.length?net/filtered.length:0;
  let peak=Number(startingBalance), maxDd=0; equityCurve.forEach(p=>{const e=Number(p.equity);peak=Math.max(peak,e);maxDd=Math.max(maxDd,peak-e);});
  const rr=filtered.filter(t=>Number(t.initialRiskAmount)>0).map(t=>Number(t.pnl)/Number(t.initialRiskAmount)); const averageR=rr.length?rr.reduce((a,b)=>a+b,0)/rr.length:null;
  let currentStreak=0; let streakType="Flat"; for(let i=filtered.length-1;i>=0;i--){const pnl=Number(filtered[i]!.pnl);const type=pnl>0?'Win':pnl<0?'Loss':'Flat';if(i===filtered.length-1)streakType=type;if(type!==streakType)break;currentStreak+=1;}
  const kpis=[
    {label:"Net P/L",value:money(net),tone:net>=0?'text-brand-300':'text-bear',icon:net>=0?TrendingUp:TrendingDown},
    {label:"Win rate",value:filtered.length?`${((wins.length/filtered.length)*100).toFixed(1)}%`:'—',tone:"text-brand-300",icon:Target},
    {label:"Profit factor",value:grossLoss?(grossWin/grossLoss).toFixed(2):'—',tone:"",icon:BarChart3},
    {label:"Expectancy",value:filtered.length?money(expectancy):'—',tone:expectancy>=0?'text-brand-300':'text-bear',icon:Activity},
    {label:"Session max drawdown",value:money(-maxDd),tone:"text-bear",icon:ShieldAlert},
    {label:"Average R",value:averageR===null?'Not recorded':`${averageR.toFixed(2)}R`,tone:averageR!==null&&averageR>=0?'text-brand-300':'text-bear',icon:TrendingUp},
    {label:"Best / worst",value:filtered.length?`${compactMoney(Math.max(...filtered.map(t=>Number(t.pnl))))} / ${compactMoney(Math.min(...filtered.map(t=>Number(t.pnl))))}`:'—',tone:"",icon:TrendingDown},
    {label:"Current streak",value:currentStreak?`${currentStreak} ${streakType.toLowerCase()}${currentStreak===1?'':'s'}`:'—',tone:streakType==='Win'?'text-brand-300':streakType==='Loss'?'text-bear':'',icon:Clock3},
  ];

  return <div className="mt-7">
    <div className="sticky top-16 z-30 flex flex-col gap-3 rounded-xl border app-border bg-[var(--app-panel)]/95 p-2 shadow-lg backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <div role="tablist" aria-label="Analytics views" className="flex overflow-x-auto">{([['overview','Overview'],['risk','Risk'],['timing','Timing'],['trades','Trades']] as const).map(([id,label])=>{const locked=!fullAccess&&(id==='risk'||id==='timing');return <button key={id} type="button" role="tab" aria-selected={tab===id} disabled={locked} title={locked?`${label} analytics are included with Pro`:undefined} onClick={()=>setTab(id)} className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold ${tab===id?'bg-brand-500 text-surface-950':'app-muted hover:text-brand-300'} disabled:cursor-not-allowed disabled:opacity-45`}>{locked&&<LockKeyhole size={11} className="mr-1 inline"/>}{label}</button>;})}</div>
      <div className="flex items-center gap-1 overflow-x-auto"><Filter size={13} className="ml-2 shrink-0 app-muted"/>{([['all','All'],['long','Buy'],['short','Sell'],['winners','Winners'],['losers','Losers']] as const).map(([id,label])=><button key={id} type="button" onClick={()=>setFilter(id)} aria-pressed={filter===id} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${filter===id?'border-brand-400/40 bg-brand-400/10 text-brand-300':'app-border app-muted'}`}>{label}</button>)}</div>
    </div>

    {!fullAccess&&<div className="mt-4 flex flex-col gap-3 rounded-xl border border-brand-400/25 bg-brand-400/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Unlock complete session analytics</p><p className="mt-1 text-xs app-muted">Pro adds risk analysis, MAE/MFE, timing heatmaps, and CSV exports.</p></div><Link href="/account/billing" className="btn-primary shrink-0 px-4 py-2 text-xs">View Pro plans</Link></div>}

    <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtered analytics summary">{kpis.map(({label,value,tone,icon:Icon})=><article key={label} className="panel p-4 transition-transform hover:-translate-y-0.5"><div className="flex items-start justify-between"><div><p className="text-xs app-muted">{label}</p><p className={`mt-2 font-mono text-lg font-semibold ${tone}`}>{value}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] app-muted"><Icon size={16}/></span></div></article>)}</section>

    {tab==='overview'&&<div className="mt-4 grid gap-4 lg:grid-cols-2"><ChartFrame title="Equity, balance & drawdown" subtitle="Hover to inspect synchronized account values and trade exits" className="lg:col-span-2"><EquityDrawdownChart points={equityCurve} trades={filtered}/></ChartFrame><ChartFrame title="Profit by day of week" subtitle="Net P/L grouped by entry day in New York"><WeekdayProfitChart trades={filtered}/></ChartFrame><ChartFrame title="Profit by trading session" subtitle="Asia, London, New York, and rollover by New York entry time"><TradingSessionProfitChart trades={filtered}/></ChartFrame><ChartFrame title="Cumulative trade P/L" subtitle="One point for every filtered closed trade"><CumulativePnlChart trades={filtered} hovered={hoveredTrade} onHover={setHoveredTrade}/></ChartFrame><ChartFrame title="Exit reasons" subtitle="How positions were closed"><ExitDonut trades={filtered}/></ChartFrame><ChartFrame title="P/L distribution" subtitle="Frequency of typical wins, losses, and outliers"><PnlHistogram trades={filtered}/></ChartFrame><ChartFrame title="Buy vs Sell" subtitle="Direction-level consistency"><DirectionComparison trades={filtered}/></ChartFrame><ChartFrame title="Trade sequence" subtitle="Hover a result to synchronize it with cumulative P/L" className="lg:col-span-2"><StreakChart trades={filtered} hovered={hoveredTrade} onHover={setHoveredTrade}/></ChartFrame></div>}
    {tab==='risk'&&<div className="mt-4 grid gap-4 lg:grid-cols-2"><ChartFrame title="Drawdown & recovery" subtitle={`Recovery factor ${maxDd? (net/maxDd).toFixed(2):'—'} · Maximum drawdown ${money(-maxDd)}`} className="lg:col-span-2"><EquityDrawdownChart points={equityCurve} trades={filtered}/></ChartFrame><ChartFrame title="Risk multiple vs duration" subtitle="Dot size represents lots; green is Buy and red is Sell"><RiskScatter trades={filtered}/></ChartFrame><ChartFrame title="MAE / MFE by trade" subtitle="Worst and best marked-to-market P/L while each trade was open"><ExcursionChart trades={filtered}/></ChartFrame></div>}
    {tab==='timing'&&<div className="mt-4 grid gap-4 lg:grid-cols-2"><ChartFrame title="Entry-time heatmap" subtitle="Day of week × hour in New York" className="lg:col-span-2"><TimingHeatmap trades={filtered}/></ChartFrame><ChartFrame title="Monthly performance" subtitle="Net realised P/L by New York exit month"><PeriodBars trades={filtered}/></ChartFrame><ChartFrame title="Trade duration & R multiple" subtitle="Find whether longer holds improve outcomes"><RiskScatter trades={filtered}/></ChartFrame></div>}
    {tab==='trades'&&<section className="panel mt-4 overflow-hidden"><div className="flex flex-col gap-3 border-b app-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Trade history</h3><p className="mt-1 text-xs app-muted">{searched.length} of {trades.length} trades shown</p></div><label className="flex h-9 items-center gap-2 rounded-lg border app-border bg-[var(--app-panel-2)] px-3"><Search size={14} className="app-muted"/><input value={query} onChange={e=>setQuery(e.target.value)} className="w-56 bg-transparent text-xs outline-none" placeholder="Search trade, price, or exit…" aria-label="Search trade history"/></label></div><TradesTable trades={searched}/></section>}
  </div>;
}
