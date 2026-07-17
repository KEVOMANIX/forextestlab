import Image from "next/image";

import logoMark from "../../public/logo-mark.png";

const bars = [
  { height: "h-5", delay: "0ms", tone: "bg-brand-400" },
  { height: "h-8", delay: "120ms", tone: "bg-brand-400" },
  { height: "h-6", delay: "240ms", tone: "bg-bear" },
  { height: "h-10", delay: "360ms", tone: "bg-brand-400" },
  { height: "h-7", delay: "480ms", tone: "bg-bear" },
  { height: "h-9", delay: "600ms", tone: "bg-brand-400" },
];

export function PageLoader() {
  return (
    <main
      className="fixed inset-0 z-[9999] grid min-h-[100dvh] place-items-center overflow-hidden bg-surface-950 p-6 text-slate-100"
      aria-label="Loading page"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-[size:48px_48px] opacity-30" />
      <div className="pointer-events-none absolute inset-0 bg-radial-brand" />

      <div className="relative flex w-full max-w-[16rem] flex-col items-center rounded-3xl border border-white/10 bg-surface-900/75 px-8 py-9 text-center shadow-2xl backdrop-blur-xl">
        <div className="page-loader-mark relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-brand-400/30 bg-surface-800 shadow-glow">
          <span className="absolute -inset-2 rounded-[1.35rem] border border-brand-400/10" />
          <Image
            src={logoMark}
            alt=""
            priority
            className="relative h-10 w-10 object-contain"
          />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-300">
          ForexTestLab
        </p>

        <div className="mt-6 flex h-10 items-center justify-center gap-2" aria-hidden="true">
          {bars.map((bar, index) => (
            <span
              key={index}
              className={`page-loader-candle relative w-1.5 rounded-sm ${bar.height} ${bar.tone}`}
              style={{ animationDelay: bar.delay }}
            >
              <span className="absolute left-1/2 top-[-5px] h-[calc(100%+10px)] w-px -translate-x-1/2 bg-current opacity-70" />
            </span>
          ))}
        </div>

        <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="page-loader-progress h-full w-2/5 rounded-full bg-gradient-to-r from-brand-500 via-brand-300 to-accent-400" />
        </div>
        <p className="mt-3 text-xs font-medium text-slate-400">Loading…</p>
      </div>
    </main>
  );
}
