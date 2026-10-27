/**
 * Saved AI Analyst conversations. They live in the trader's browser, like the
 * AI panels elsewhere in the app, so this module only shapes and sorts them;
 * the page does the reading and writing.
 */

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface AnalystThread {
  id: string;
  title: string;
  /** The session the conversation is about; null for all sessions. */
  sessionId: string | null;
  pinned: boolean;
  updatedAt: number;
  messages: ChatMessage[];
}

export const THREADS_STORAGE_KEY = "ftl.ai.analyst.threads";
const MAX_THREADS = 50;
const MAX_MESSAGES = 40;
const TITLE_LENGTH = 60;
const DAY = 86_400_000;

export function threadTitle(question: string): string {
  const line = question.trim().split("\n")[0]!.trim();
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
}

function isMessage(value: unknown): value is ChatMessage {
  const message = value as ChatMessage;
  return Boolean(message) && (message.role === "user" || message.role === "model") && typeof message.text === "string";
}

/** Whatever survived in storage, keeping only well-formed threads. */
export function parseThreads(raw: string | null): AnalystThread[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((thread): thread is AnalystThread =>
      Boolean(thread) && typeof thread.id === "string" && typeof thread.title === "string" &&
      (thread.sessionId === null || typeof thread.sessionId === "string") && typeof thread.updatedAt === "number" &&
      Array.isArray(thread.messages) && thread.messages.every(isMessage),
    ).map((thread) => ({ ...thread, pinned: thread.pinned === true }));
  } catch {
    return [];
  }
}

/** Adds or replaces a thread; the oldest unpinned ones go first when the list is full. */
export function upsertThread(threads: AnalystThread[], thread: AnalystThread): AnalystThread[] {
  const next = [{ ...thread, messages: thread.messages.slice(-MAX_MESSAGES) }, ...threads.filter((item) => item.id !== thread.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt);
  while (next.length > MAX_THREADS) {
    const oldest = next.findLastIndex((item) => !item.pinned);
    next.splice(oldest === -1 ? next.length - 1 : oldest, 1);
  }
  return next;
}

export interface ThreadGroups {
  pinned: AnalystThread[];
  today: AnalystThread[];
  week: AnalystThread[];
  earlier: AnalystThread[];
}

export function groupThreads(threads: AnalystThread[], query: string, now: number): ThreadGroups {
  const needle = query.trim().toLowerCase();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const groups: ThreadGroups = { pinned: [], today: [], week: [], earlier: [] };
  for (const thread of [...threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (needle && !thread.title.toLowerCase().includes(needle)) continue;
    if (thread.pinned) groups.pinned.push(thread);
    else if (thread.updatedAt >= startOfToday) groups.today.push(thread);
    else if (thread.updatedAt >= startOfToday - 6 * DAY) groups.week.push(thread);
    else groups.earlier.push(thread);
  }
  return groups;
}
