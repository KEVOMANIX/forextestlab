/**
 * Minimal Google Gemini client (server-only).
 *
 * Uses the REST Generative Language API directly via fetch — no SDK dependency —
 * and streams the response as Server-Sent Events, yielding plain text deltas.
 *
 * The API key is read from GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY).
 * The model defaults to gemini-2.5-flash and can be overridden with GEMINI_MODEL.
 */

import "server-only";

const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type ChatRole = "user" | "model";

export interface ChatTurn {
  role: ChatRole;
  text: string;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not configured.");
    this.name = "MissingApiKeyError";
  }
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new MissingApiKeyError();
  return key;
}

function model(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Gemini 2.5 models think before they answer, and that thinking is paid out of
 * maxOutputTokens. Left uncapped it can use the whole allowance and cut the
 * visible answer off mid-sentence, so it gets a budget of its own.
 */
const THINKING_BUDGET = 1024;

/** Shown when the model still runs out of room, so a cut-off answer never looks finished. */
export const TRUNCATED_NOTE = "\n\n**The answer was cut short.** Ask me to continue.";

type Part = Record<string, unknown> & { text?: string; thought?: boolean; functionCall?: { name: string; args?: Record<string, unknown> } };
type Content = { role: ChatRole; parts: Part[] };
type RoundEvent = { text: string } | { part: Part } | { finishReason: string };

function generationConfig(modelName: string, maxOutputTokens: number, temperature: number) {
  return {
    temperature,
    maxOutputTokens,
    topP: 0.95,
    ...(modelName.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: THINKING_BUDGET } } : {}),
  };
}

/** One streamed request. Yields answer text as it arrives, every other part whole, and the finish reason. */
async function* streamRound(modelName: string, body: unknown, signal?: AbortSignal): AsyncGenerator<RoundEvent> {
  const url = `${API_BASE}/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse&key=${apiKey()}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const errorJson = await response.json();
      detail = errorJson?.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new GeminiError(detail || `Gemini request failed (${response.status}).`, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines; each carries one `data:` line.
    let boundary: number;
    while ((boundary = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const candidate = parsed?.candidates?.[0];
        const parts = candidate?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts as Part[]) {
            // Thought summaries are not part of the answer.
            if (!part || part.thought) continue;
            if (typeof part.text === "string") {
              if (part.text) yield { text: part.text };
            } else {
              yield { part };
            }
          }
        }
        if (candidate?.finishReason) yield { finishReason: candidate.finishReason };
      } catch {
        // Partial JSON across chunk boundaries — put it back and wait for more.
        buffer = `${line}\n${buffer}`;
        break;
      }
    }
  }
}

/**
 * Stream a completion from Gemini. Yields incremental text chunks.
 *
 * @param systemInstruction Persona / grounding rules for the assistant.
 * @param history Prior conversation turns (user/model), most-recent last.
 */
export async function* streamGemini(params: {
  systemInstruction: string;
  history: ChatTurn[];
  signal?: AbortSignal;
  maxOutputTokens?: number;
  temperature?: number;
}): AsyncGenerator<string> {
  const { systemInstruction, history, signal, maxOutputTokens = 8192, temperature = 0.4 } = params;
  const modelName = model();
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    generationConfig: generationConfig(modelName, maxOutputTokens, temperature),
  };
  for await (const event of streamRound(modelName, body, signal)) {
    if ("text" in event) yield event.text;
    else if ("finishReason" in event && event.finishReason === "MAX_TOKENS") yield TRUNCATED_NOTE;
  }
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

/** Tool rounds allowed for one answer before the model must answer with what it has. */
const MAX_TOOL_ROUNDS = 6;

/**
 * Like streamGemini, but the model may call tools first. Each round streams any
 * text, runs the calls it asked for and sends the results back, until the
 * model answers without calling anything. The model's own parts go back
 * untouched: Gemini 2.5 attaches a thought signature to a call and expects to
 * see it again with the result.
 */
export async function* streamGeminiWithTools(params: {
  systemInstruction: string;
  history: ChatTurn[];
  tools: readonly ToolDeclaration[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  temperature?: number;
}): AsyncGenerator<string> {
  const { systemInstruction, history, tools, runTool, signal, maxOutputTokens = 8192, temperature = 0.4 } = params;
  const modelName = model();
  const contents: Content[] = history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));

  for (let round = 0; ; round += 1) {
    const lastRound = round >= MAX_TOOL_ROUNDS;
    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: [{ functionDeclarations: tools }],
      toolConfig: { functionCallingConfig: { mode: lastRound ? "NONE" : "AUTO" } },
      generationConfig: generationConfig(modelName, maxOutputTokens, temperature),
    };
    const modelParts: Part[] = [];
    let finishReason = "";
    for await (const event of streamRound(modelName, body, signal)) {
      if ("text" in event) {
        modelParts.push({ text: event.text });
        yield event.text;
      } else if ("part" in event) {
        modelParts.push(event.part);
      } else {
        finishReason = event.finishReason;
      }
    }
    const calls = modelParts.filter((part) => part.functionCall);
    if (!calls.length || lastRound) {
      if (finishReason === "MAX_TOKENS") yield TRUNCATED_NOTE;
      return;
    }
    contents.push({ role: "model", parts: modelParts });
    const responses: Part[] = [];
    for (const part of calls) {
      const { name, args = {} } = part.functionCall!;
      let result: unknown;
      try {
        result = await runTool(name, args);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : "The tool failed." };
      }
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
}
