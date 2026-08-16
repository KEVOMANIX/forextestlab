import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark fintech surface palette
        surface: {
          950: "#070a12",
          900: "#0b0f1a",
          800: "#111725",
          700: "#1a2234",
          600: "#232d43",
        },
        brand: {
          50: "#e8fbf6",
          100: "#c6f4e8",
          200: "#8fe9d3",
          300: "#4fd8ba",
          400: "#22c3a0",
          500: "#12a888",
          600: "#0c866d",
          700: "#0d6a58",
          800: "#0f5447",
          900: "#0f453b",
        },
        accent: {
          400: "#5b8bff",
          500: "#3b6bff",
          600: "#2a52e0",
        },
        bull: "#22c3a0",
        bear: "#f4646c",
        // Tailwind's stock slate-500 (#64748b) is the site's muted-text token,
        // but on these surfaces it lands at ~4.0:1 — under the 4.5:1 WCAG AA
        // threshold, and it carries real content (the risk warning, price
        // intervals, the trial qualifier). Lifted just far enough to clear it
        // with margin on every panel shade, dark through surface-700.
        slate: { 500: "#8593a6" },
      },
      fontFamily: {
        // Do not put an undefined custom property first here. When --font-sans
        // is absent, the whole font-family declaration becomes invalid and the
        // browser falls back to Times New Roman.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Cascadia Code",
          "Roboto Mono",
          "monospace",
        ],
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
        "radial-brand":
          "radial-gradient(60% 60% at 50% 0%, rgba(34,195,160,0.16) 0%, rgba(34,195,160,0) 70%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,195,160,0.18), 0 20px 60px -20px rgba(34,195,160,0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(0,0,0,0.8)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        // Support launcher. It is never completely still, but only its
        // contents move: animating the button itself would drag the hit target
        // out from under a cursor or thumb mid-tap.
        "launcher-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2.5px)" },
        },
        // The fill is a tall vertical gradient that drifts upwards, so the
        // colour appears to well up through the pill.
        "wave-drift": {
          "0%, 100%": { backgroundPosition: "50% 0%" },
          "50%": { backgroundPosition: "50% 100%" },
        },
        // One crisp ring leaving the launcher's edge, like sonar. The scale is
        // capped so the ring stays inside the viewport: at 1.65 it reached
        // ~24px past the pill and was cut flat by the right screen edge.
        sonar: {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "80%, 100%": { transform: "scale(1.45)", opacity: "0" },
        },
        "typing-dot": {
          "0%, 60%, 100%": { opacity: "0.3", transform: "translateY(0)" },
          "30%": { opacity: "1", transform: "translateY(-2px)" },
        },
        nudge: {
          "0%, 88%, 100%": { transform: "rotate(0deg)" },
          "91%": { transform: "rotate(-11deg)" },
          "94%": { transform: "rotate(9deg)" },
          "97%": { transform: "rotate(-5deg)" },
        },
        "launcher-in": {
          "0%": { transform: "translateY(14px) scale(0.9)", opacity: "0" },
          "60%": { transform: "translateY(-2px) scale(1.02)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "panel-in": {
          "0%": { transform: "translateY(16px) scale(0.97)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "message-in": {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "badge-pop": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "70%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        nudge: "nudge 5s ease-in-out infinite",
        "launcher-float": "launcher-float 3.6s ease-in-out infinite",
        "typing-dot": "typing-dot 1s ease-in-out infinite",
        "wave-drift": "wave-drift 6s ease-in-out infinite",
        sonar: "sonar 4s cubic-bezier(0, 0, 0.2, 1) infinite",
        "launcher-in": "launcher-in 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both",
        "panel-in": "panel-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) both",
        "message-in": "message-in 0.25s ease-out both",
        "badge-pop": "badge-pop 0.35s cubic-bezier(0.22, 1.4, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
