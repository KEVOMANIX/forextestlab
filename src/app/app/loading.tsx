import { PageLoader } from "@/components/PageLoader";

/**
 * Every page in the workspace is dynamic and reads the database before it can
 * render — the dashboard alone loads a hundred sessions, their metadata, and
 * the selected session's trades and equity curve.
 *
 * The segment had no fallback, so the layout streamed its nav and footer around
 * an empty slot for the length of that read and the workspace looked broken
 * rather than busy. This is the same loader the root boundary uses, so arriving
 * from sign-in is one continuous screen instead of a sequence of flashes.
 */
export default function Loading() {
  return <PageLoader message="Loading your workspace…" />;
}
