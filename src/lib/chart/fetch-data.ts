/** Retry only read-only chart requests; order submissions must never use this. */
export async function fetchChartData<T>(
  url: string,
  options: { headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<T> {
  const delays = [750, 1_500];
  for (let attempt = 0; ; attempt += 1) {
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timeout = globalThis.setTimeout(abort, 45_000);
    let retry = true;
    try {
      const response = await fetch(url, { cache: "no-store", headers: options.headers, signal: controller.signal });
      retry = response.status === 408 || response.status === 429 || response.status >= 500;
      if (retry) throw new Error(`Chart data request failed (${response.status}).`);
      // Retry interrupted/invalid successful payloads, but not permission or validation errors.
      retry = response.status >= 200 && response.status < 300;
      return await response.json() as T;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (!retry || attempt >= delays.length) throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        globalThis.clearTimeout(timer);
        options.signal?.removeEventListener("abort", cancel);
        reject(options.signal?.reason);
      };
      const timer = globalThis.setTimeout(() => {
        options.signal?.removeEventListener("abort", cancel);
        resolve();
      }, delays[attempt]!);
      options.signal?.addEventListener("abort", cancel, { once: true });
      if (options.signal?.aborted) cancel();
    });
  }
}
