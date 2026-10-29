import { describe, expect, it } from "vitest";
import { readOptimizerStream } from "./optimizer-progress";

function response(parts: string[]) {
  const bytes = new TextEncoder().encode(parts.join(""));
  return new Response(new ReadableStream({ start(controller) {
    // Byte-at-a-time transport exercises split JSON, delimiters and UTF-8.
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }));
}
describe("optimizer progress transport", () => {
  it("reads progress and a final report across arbitrary chunks and heartbeats", async () => {
    const events: unknown[] = [];
    const result = await readOptimizerStream(response([
      '\n', JSON.stringify({ type: "progress", progress: { stage: "loading", message: "EURUSD · loaded", completed: 1, total: 2 } }) + '\n',
      JSON.stringify({ type: "result", optimizer: { eligibleTrades: 12 } }),
    ]), event => events.push(event));
    expect(events).toEqual([{ stage: "loading", message: "EURUSD · loaded", completed: 1, total: 2 }]);
    expect(result).toEqual({ eligibleTrades: 12 });
  });
  it("surfaces server failures and interrupted streams instead of showing success", async () => {
    await expect(readOptimizerStream(response([JSON.stringify({ type: "error", error: "No eligible trades" }) + '\n']), () => {})).rejects.toThrow("No eligible trades");
    await expect(readOptimizerStream(response(['\n']), () => {})).rejects.toThrow("ended before the analysis completed");
  });
});
