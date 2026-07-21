/**
 * A purely decorative candlestick chart drawn with SVG. Data is static and
 * illustrative — it is NOT real market data and implies no price forecast.
 */

interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

// Deterministic, hand-picked sample candles (illustrative only).
const CANDLES: Candle[] = [
  { o: 40, h: 52, l: 36, c: 48 },
  { o: 48, h: 55, l: 44, c: 46 },
  { o: 46, h: 50, l: 38, c: 42 },
  { o: 42, h: 47, l: 40, c: 45 },
  { o: 45, h: 58, l: 43, c: 56 },
  { o: 56, h: 62, l: 52, c: 54 },
  { o: 54, h: 57, l: 46, c: 49 },
  { o: 49, h: 53, l: 41, c: 44 },
  { o: 44, h: 60, l: 42, c: 58 },
  { o: 58, h: 68, l: 55, c: 65 },
  { o: 65, h: 70, l: 60, c: 62 },
  { o: 62, h: 66, l: 54, c: 57 },
  { o: 57, h: 63, l: 50, c: 61 },
  { o: 61, h: 72, l: 59, c: 70 },
  { o: 70, h: 74, l: 64, c: 66 },
  { o: 66, h: 69, l: 58, c: 60 },
  { o: 60, h: 64, l: 52, c: 55 },
  { o: 55, h: 67, l: 53, c: 64 },
  { o: 64, h: 78, l: 62, c: 75 },
  { o: 75, h: 80, l: 70, c: 72 },
];

export function CandlestickChart({ className = "" }: { className?: string }) {
  const width = 640;
  const height = 260;
  const padding = 12;
  const min = Math.min(...CANDLES.map((c) => c.l));
  const max = Math.max(...CANDLES.map((c) => c.h));
  const range = max - min || 1;
  const slot = (width - padding * 2) / CANDLES.length;
  const bodyW = slot * 0.55;

  const y = (v: number) =>
    padding + (1 - (v - min) / range) * (height - padding * 2);

  // Smooth close-price line overlay.
  const linePath = CANDLES.map((c, i) => {
    const cx = padding + slot * i + slot / 2;
    return `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${y(c.c).toFixed(1)}`;
  }).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="Forex market replay chart"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="ftl-line" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4fd8ba" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#4fd8ba" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <line
          key={f}
          x1={padding}
          x2={width - padding}
          y1={padding + f * (height - padding * 2)}
          y2={padding + f * (height - padding * 2)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}

      {/* Close-price area + line */}
      <path
        d={`${linePath} L${(width - padding).toFixed(1)},${height - padding} L${padding},${height - padding} Z`}
        fill="url(#ftl-line)"
      />
      <path
        d={linePath}
        fill="none"
        stroke="#4fd8ba"
        strokeWidth="1.5"
        strokeOpacity="0.7"
      />

      {/* Candles */}
      {CANDLES.map((c, i) => {
        const cx = padding + slot * i + slot / 2;
        const bullish = c.c >= c.o;
        const color = bullish ? "#22c3a0" : "#f4646c";
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyBottom = y(Math.min(c.o, c.c));
        return (
          <g key={i}>
            <line
              x1={cx}
              x2={cx}
              y1={y(c.h)}
              y2={y(c.l)}
              stroke={color}
              strokeWidth="1.2"
            />
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={Math.max(bodyBottom - bodyTop, 1.5)}
              rx="1"
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}
