export function renderedLivePrice(
  renderedClose: number | undefined,
  fallbackPrice: number | null,
): number | null {
  return renderedClose ?? fallbackPrice;
}
