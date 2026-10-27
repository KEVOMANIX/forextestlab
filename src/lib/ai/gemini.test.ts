import { afterEach, describe, expect, it, vi } from "vitest";

import { TRUNCATED_NOTE, streamGemini } from "./gemini";

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

describe("Gemini streaming", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("gives thinking its own budget and leaves room for a long answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
    const fetchMock = vi.fn().mockResolvedValue(sse([{ candidates: [{ content: { parts: [{ text: "Hi" }] }, finishReason: "STOP" }] }]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await collect(streamGemini({ systemInstruction: "s", history: [{ role: "user", text: "q" }] }))).toBe("Hi");
    const config = JSON.parse(fetchMock.mock.calls[0]![1].body).generationConfig;
    expect(config.maxOutputTokens).toBeGreaterThanOrEqual(8192);
    expect(config.thinkingConfig.thinkingBudget).toBeLessThan(config.maxOutputTokens / 4);
  });

  it("skips thought summaries and says so when the answer is cut short", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([
      { candidates: [{ content: { parts: [{ text: "planning…", thought: true }, { text: "Part one" }] } }] },
      { candidates: [{ content: { parts: [{ text: ", part two" }] }, finishReason: "MAX_TOKENS" }] },
    ])));
    expect(await collect(streamGemini({ systemInstruction: "s", history: [] }))).toBe(`Part one, part two${TRUNCATED_NOTE}`);
  });
});
