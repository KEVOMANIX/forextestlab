import { PageLoader } from "@/components/PageLoader";

/**
 * The post-sign-in hop is a redirect, but it is not free: it awaits the user,
 * ensures the profile row, and reads entitlements before it knows whether to
 * send a trader to the workspace or to pricing.
 *
 * Without this fallback the account layout streamed its nav and footer around
 * an empty slot for the length of those reads, so signing in flashed a blank
 * page before the destination's own loader appeared. `PageLoader` is fixed over
 * the viewport, so it covers that chrome and the two loaders read as one.
 */
export default function Loading() {
  return <PageLoader message="Signing you in…" />;
}
