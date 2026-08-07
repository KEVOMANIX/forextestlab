/**
 * Circular currency flags for calendar badges.
 *
 * Drawn rather than fetched, and deliberately reduced: a badge on the time axis
 * is sixteen pixels across, where a faithful Union Jack is mud. What survives at
 * that size is the field colour and one motif, so that is all each flag carries.
 *
 * Emoji flags were the obvious shortcut and are not usable — Windows ships no
 * flag glyphs, so "🇺🇸" renders there as the letters "US".
 */

const FLAG_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "CNY",
  // No flag, but a mark just as widely read: the metals carry an ingot on their
  // own colour — which is the whole distinction between the two — and bitcoin
  // carries its ₿. Drawn rather than typed, because ₿ (U+20BF) is missing from
  // enough system fonts to render as a box.
  "XAU",
  "XAG",
  "BTC",
]);

export function hasCurrencyFlag(currency: string): boolean {
  return FLAG_CURRENCIES.has(currency.toUpperCase());
}

interface Props {
  currency: string;
  size?: number;
  className?: string;
}

const CIRCLE = "M8 0.5A7.5 7.5 0 1 1 8 15.5A7.5 7.5 0 1 1 8 0.5Z";

/** A five-pointed star. At badge size the smallest ones read as dots. */
function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? r : r * 0.42;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
  return <polygon points={points} fill={fill} />;
}

/**
 * A cast ingot, seen slightly from above: the trapezoid face plus a lighter top.
 * Shared by gold and silver, whose colour is the only thing that separates them.
 */
function Ingot({ dark, light }: { dark: string; light: string }) {
  return (
    <>
      <path d="M3.4 11.4 4.9 7.6h6.2l1.5 3.8Z" fill={dark} />
      <path d="M4.9 7.6h6.2l-.5-1.3H5.4Z" fill={light} />
    </>
  );
}

/** The Commonwealth canton shared by the Australian and New Zealand flags. */
function Canton() {
  return (
    <>
      <rect x="0" y="0" width="7" height="6" fill="#1b3a7d" />
      <path d="M0 0 7 6M7 0 0 6" stroke="#f4f6fb" strokeWidth="1.4" />
      <path d="M3.5 0V6M0 3H7" stroke="#f4f6fb" strokeWidth="2" />
      <path d="M3.5 0V6M0 3H7" stroke="#c8102e" strokeWidth="0.9" />
    </>
  );
}

function Field({ currency }: { currency: string }) {
  switch (currency) {
    case "USD":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#f4f6fb" />
          {[1, 3, 5, 7].map((row) => (
            <rect key={row} x="0" y={row * 2} width="16" height="2" fill="#c8102e" />
          ))}
          <rect x="0" y="0" width="8" height="7" fill="#22325f" />
          <Star cx={4} cy={3.5} r={2.1} fill="#f4f6fb" />
        </>
      );
    case "EUR":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#123a8f" />
          {Array.from({ length: 8 }, (_, index) => {
            const angle = (Math.PI / 4) * index - Math.PI / 2;
            return (
              <circle
                key={index}
                cx={8 + 4.4 * Math.cos(angle)}
                cy={8 + 4.4 * Math.sin(angle)}
                r="1"
                fill="#ffcc00"
              />
            );
          })}
        </>
      );
    case "GBP":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#12285f" />
          <path d="M0 0 16 16M16 0 0 16" stroke="#f4f6fb" strokeWidth="3.4" />
          <path d="M0 0 16 16M16 0 0 16" stroke="#c8102e" strokeWidth="1.6" />
          <path d="M8 0V16M0 8H16" stroke="#f4f6fb" strokeWidth="5" />
          <path d="M8 0V16M0 8H16" stroke="#c8102e" strokeWidth="2.6" />
        </>
      );
    case "JPY":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#f7f8fb" />
          <circle cx="8" cy="8" r="4.2" fill="#bc002d" />
        </>
      );
    case "CHF":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#d52b1e" />
          <path d="M8 3.4V12.6M3.4 8H12.6" stroke="#ffffff" strokeWidth="2.6" />
        </>
      );
    case "CAD":
      return (
        <>
          {/*
            The bands are narrower than the flag's true thirds. Cropped to a
            circle, honest thirds leave white only across the middle band of the
            disc, and the badge reads as a plain red dot.
          */}
          <rect x="0" y="0" width="16" height="16" fill="#f7f8fb" />
          <rect x="0" y="0" width="2.6" height="16" fill="#d52b1e" />
          <rect x="13.4" y="0" width="2.6" height="16" fill="#d52b1e" />
          {/* The maple leaf reduced to a silhouette: three lobes and a stem. */}
          <path
            d="M8 4 8.9 6.3 10.5 5.6 9.9 7.7 11.3 8.4 8.8 9.9 9 12 8 11.4 7 12 7.2 9.9 4.7 8.4 6.1 7.7 5.5 5.6 7.1 6.3Z"
            fill="#d52b1e"
          />
        </>
      );
    case "AUD":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#12285f" />
          <Canton />
          <Star cx={3.4} cy={11.4} r={2.4} fill="#f4f6fb" />
          <Star cx={11.4} cy={4.4} r={1.5} fill="#f4f6fb" />
          <Star cx={13} cy={9} r={1.5} fill="#f4f6fb" />
          <Star cx={10.4} cy={12.4} r={1.3} fill="#f4f6fb" />
        </>
      );
    case "NZD":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#12285f" />
          <Canton />
          <Star cx={12.6} cy={4.6} r={1.7} fill="#c8102e" />
          <Star cx={10.2} cy={8.6} r={1.7} fill="#c8102e" />
          <Star cx={13.4} cy={10.4} r={1.7} fill="#c8102e" />
          <Star cx={11} cy={13.4} r={1.7} fill="#c8102e" />
        </>
      );
    case "XAU":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#8a6a12" />
          <Ingot dark="#e0ab2b" light="#f7dc8a" />
        </>
      );
    case "XAG":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#5c6672" />
          <Ingot dark="#b9c2cc" light="#e8edf2" />
        </>
      );
    case "BTC":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#f7931a" />
          {/* The ₿: two stacked lobes with the pair of stems overshooting them.
              The counters are punched back out in the field colour rather than
              left as gaps in the lobes — filled lobes alone close up into a
              blob well before this gets down to badge size. */}
          <path
            d="M6.7 2.7v1.6M8.9 2.7v1.6M6.7 11.7v1.6M8.9 11.7v1.6"
            stroke="#ffffff"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <path d="M5.1 4.3h4.2a1.95 1.95 0 0 1 0 3.9H5.1Z" fill="#ffffff" />
          <path d="M5.1 7.9h4.6a2 2 0 0 1 0 4H5.1Z" fill="#ffffff" />
          <rect x="6.85" y="5.45" width="2.5" height="1.45" rx="0.72" fill="#f7931a" />
          <rect x="6.85" y="9.1" width="2.9" height="1.55" rx="0.77" fill="#f7931a" />
        </>
      );
    case "CNY":
      return (
        <>
          <rect x="0" y="0" width="16" height="16" fill="#de2910" />
          <Star cx={5} cy={6} r={3.4} fill="#ffde00" />
          <Star cx={9.6} cy={2.6} r={1.15} fill="#ffde00" />
          <Star cx={11.8} cy={5} r={1.15} fill="#ffde00" />
          <Star cx={11.8} cy={8} r={1.15} fill="#ffde00" />
          <Star cx={9.6} cy={10.2} r={1.15} fill="#ffde00" />
        </>
      );
    default:
      return null;
  }
}

/**
 * The flag, or a neutral disc bearing the currency's initial for one with no
 * drawing — Scandinavian currencies, and the euro-area aggregates a calendar
 * files under bodies rather than countries. A guessed flag would be worse than a
 * letter, and the badge names its currency in full on hover and to a screen
 * reader either way.
 */
export function CurrencyFlag({ currency, size = 16, className }: Props) {
  const code = currency.toUpperCase();
  const flagged = FLAG_CURRENCIES.has(code);
  // The clip path is referenced by id, and several badges share a pane; keying
  // it to the currency keeps one definition per flag instead of one per badge.
  const clipId = `currency-flag-${code}`;

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={CIRCLE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {flagged ? (
          <Field currency={code} />
        ) : (
          <>
            <rect x="0" y="0" width="16" height="16" fill="#48566e" />
            <text
              x="8"
              y="11.6"
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#f4f6fb"
            >
              {code.slice(0, 1)}
            </text>
          </>
        )}
      </g>
      <path d={CIRCLE} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
    </svg>
  );
}
