/** Pages that use the whole screen: the menu shrinks to icons and the footer is left out. */
const FULL_SCREEN_PATHS = ["/app/ai"];

export function isFullScreenPath(pathname: string): boolean {
  return FULL_SCREEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
