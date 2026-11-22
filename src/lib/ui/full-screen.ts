/** Pages that use the whole screen: the menu shrinks to icons and the footer is left out. */
const FULL_SCREEN_PATHS = ["/app/ai"];

export function isFullScreenPath(pathname: string, search?: { has(name: string): boolean } | null): boolean {
  // An open strategy in Strategy Lab is a workspace; the strategy list is not.
  if (pathname === "/app/strategies" && search?.has("script")) return true;
  return FULL_SCREEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
