/**
 * Central site configuration. Kept in one place so metadata, navigation,
 * structured data, and the footer stay consistent.
 */

export const siteConfig = {
  name: "ForexTestLab",
  domain: "forextestlab.com",
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://forextestlab.com",
  title: "ForexTestLab | Forex Backtesting and Market Replay",
  description:
    "ForexTestLab is a forex backtesting and historical market-replay platform in development, designed for structured strategy testing, simulated execution, and performance review.",
  tagline: "Test forex strategies before risking real capital.",
  emails: {
    hello: "hello@forextestlab.com",
    support: "support@forextestlab.com",
  },
  ogImage: "/og-image.png",
} as const;

/** Primary landing-page navigation (anchor links + routes). */
export const mainNav = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Product Preview", href: "/#product-preview" },
  { label: "FAQ", href: "/#faq" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export const footerNav = {
  product: [
    { label: "Features", href: "/#features" },
    { label: "How It Works", href: "/#how-it-works" },
    { label: "Product Preview", href: "/#product-preview" },
    { label: "Roadmap", href: "/#development-status" },
    { label: "Join the Waitlist", href: "/waitlist" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "FAQ", href: "/#faq" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Use", href: "/terms" },
    { label: "Risk Disclosure", href: "/risk-disclosure" },
  ],
} as const;

/** Social placeholders — replace `href` values before launch. */
export const socialLinks = [
  { label: "X (Twitter)", href: "#", handle: "@forextestlab" },
  { label: "LinkedIn", href: "#", handle: "ForexTestLab" },
  { label: "YouTube", href: "#", handle: "ForexTestLab" },
] as const;

export const RISK_WARNING =
  "Forex and leveraged trading involve substantial risk and may not be suitable for every person. Historical or simulated results do not guarantee future performance. ForexTestLab is an educational and analytical software platform and does not provide investment, brokerage, or financial-advisory services.";
