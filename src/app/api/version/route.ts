import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? "development" },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}
