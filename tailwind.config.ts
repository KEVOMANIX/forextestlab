import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep Forest + Mint: shared by the marketing site and app workspace.
        surface: {
          950: "#101a17",
          900: "#16241f",
          800: "#1e302a",
          700: "#294038",
          600: "#3c5b50",
        },
        brand: {
          50: "#ecfdf7",
          100: "#d2faeb",
          200: "#bdf6e3",
          300: "#9af0d4",
          400: "#7be8c4",
          500: "#45d6a8",
          600: "#27aa82",
          700: "#178064",
          800: "#11664f",
          900: "#0f4f40",
        },
        accent: {
          400: "#9af0d4",
          500: "#7be8c4",
          600: "#45d6a8",
        },
        profit: "rgb(var(--trade-profit-rgb) / <alpha-value>)",
        loss: "rgb(var(--trade-loss-rgb) / <alpha-value>)",
        entry: "rgb(var(--trade-entry-rgb) / <alpha-value>)",
        exit: "rgb(var(--trade-exit-rgb) / <alpha-value>)",
        bull: "rgb(var(--trade-profit-rgb) / <alpha-value>)",
        bear: "rgb(var(--trade-loss-rgb) / <alpha-value>)",
        // Tailwind's stock slate-500 (#64748b) is the site's muted-text token,
        // but on these surfaces it lands at ~4.0:1 — under the 4.5:1 WCAG AA
        // threshold, and it carries real content (the risk warning, price
        // intervals, the trial qualifier). Lifted just far enough to clear it
        // with margin on every panel shade, dark through surface-700.
        slate: { 500: "#91a89f" },
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
          "radial-gradient(60% 60% at 50% 0%, rgba(69,214,168,0.16) 0%, rgba(69,214,168,0) 70%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(69,214,168,0.2), 0 20px 60px -20px rgba(69,214,168,0.32)",
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
