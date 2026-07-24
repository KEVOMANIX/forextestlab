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
  const { systemInstruction, history, signal, maxOutputTokens = 1200, temperature = 0.4 } = params;

  const url = `${API_BASE}/models/${encodeURIComponent(model())}:streamGenerateContent?alt=sse&key=${apiKey()}`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    generationConfig: { temperature, maxOutputTokens, topP: 0.95 },
  };

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
        const parts = parsed?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (typeof part?.text === "string" && part.text) yield part.text;
          }
        }
      } catch {
        // Partial JSON across chunk boundaries — put it back and wait for more.
        buffer = `${line}\n${buffer}`;
        break;
      }
    }
  }
}
