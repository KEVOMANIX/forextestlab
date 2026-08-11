import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Makes Wrangler bindings available while using the normal Next.js dev server.
// A normal Node deployment (for example AWS Lightsail) uses DATABASE_URL and
// R2's S3 API directly, so it must not try to start the local Hyperdrive shim.
if (process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE) {
  initOpenNextCloudflareForDev();
}

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
  // Each Vercel deployment gets a unique generated hostname, even when several
  // production uploads come from the same Git commit. Commit SHA alone left an
  // already-open backtester running stale drawing code after a CLI redeploy.
  process.env.VERCEL_URL ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_BUILD_VERSION ??
  process.env.npm_package_version ??
  "local-development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // Next's tracer follows pg-cloudflare's default (empty) export on Windows,
  // while OpenNext/esbuild selects the real `workerd` export. Keep both in the
  // server trace so the Cloudflare bundle can resolve the Worker socket shim.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pg-cloudflare/dist/**/*", "./node_modules/pg-cloudflare/esm/**/*"],
  },
  webpack(config) {
    // Prisma's Cloudflare runtime imports its query compiler as a static WASM
    // module. OpenNext rewrites the resulting chunk for workerd, but webpack
    // first needs its async WASM parser enabled during `next build`.
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
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
          { key: "Vercel-CDN-Cache-Control", value: "no-store" },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
