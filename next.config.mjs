const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const buildVersion =
  process.env.NEXT_PUBLIC_BUILD_VERSION ??
  process.env.npm_package_version ??
  "local-development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // API responses should never be cached by shared caches.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          ...securityHeaders,
        ],
      },
      {
        // Calendar releases are public and import-driven. This rule follows
        // the generic API rule so its cache policy wins for this one endpoint.
        source: "/api/calendar/events",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
          ...securityHeaders,
        ],
      },
      {
        // App HTML contains account entitlements and must always point at the
        // JavaScript chunks from the currently deployed build.
        source: "/app/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, max-age=0, must-revalidate",
          },
          { key: "CDN-Cache-Control", value: "no-store" },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
