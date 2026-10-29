import type { ExitOptimizerReport } from "./exit-optimizer";

export type OptimizerProgress = {
  stage: "preparing" | "loading" | "replaying" | "validating";
  message: string;
  completed?: number;
  total?: number;
  symbol?: string;
  rule?: string;
  tradeNumber?: number;
};
export type OptimizerStreamEvent =
  | { type: "progress"; progress: OptimizerProgress }
  | { type: "result"; optimizer: ExitOptimizerReport }
  | { type: "error"; error: string };

/** Handles arbitrary transport chunks, including split UTF-8 characters/lines. */
export async function readOptimizerStream(response: Response, onProgress: (progress: OptimizerProgress) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The progress connection could not be opened.");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ExitOptimizerReport | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as OptimizerStreamEvent;
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "progress") onProgress(event.progress);
    if (event.type === "result") result = event.optimizer;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    consume(buffer);
    if (!result) throw new Error("The progress connection ended before the analysis completed. Please try again.");
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
