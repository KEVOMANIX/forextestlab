/**
 * Saved AI Analyst conversations: their shape, titles and grouping. They are
 * stored in the database (see lib/ai/chats); early versions kept them in the
 * browser, and parseThreads reads those once so they can be moved across.
 */

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

/** A chat as the chats list shows it; its messages load when it is opened. */
export interface ChatSummary {
  id: string;
  title: string;
  /** The session the conversation is about; null for all sessions. */
  sessionId: string | null;
  pinned: boolean;
  updatedAt: number;
}

export interface AnalystThread extends ChatSummary {
  messages: ChatMessage[];
}

/** Where the first version of the page kept chats, read once to move them to the account. */
export const THREADS_STORAGE_KEY = "ftl.ai.analyst.threads";
export const MAX_CHAT_MESSAGES = 60;
export const MAX_MESSAGE_LENGTH = 12_000;
const TITLE_LENGTH = 60;
const DAY = 86_400_000;

export function threadTitle(question: string): string {
  const line = question.trim().split("\n")[0]!.trim();
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
}

/** Reviews of one session, started from a card on the welcome screen. */
export function isReviewTitle(title: string): boolean {
  return /^review( ·| my ")/i.test(title.trim());
}

/** A title as the list shows it: a capital first letter, and early review titles in the current "Review · session" form. */
export function displayTitle(title: string): string {
  const legacy = /^Review my "(.+?)" session/i.exec(title.trim());
  const text = legacy ? `Review · ${legacy[1]}` : title.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isMessage(value: unknown): value is ChatMessage {
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

export interface ThreadGroups<T extends ChatSummary> {
  pinned: T[];
  today: T[];
  week: T[];
  earlier: T[];
}

export function groupThreads<T extends ChatSummary>(threads: T[], query: string, now: number): ThreadGroups<T> {
  const needle = query.trim().toLowerCase();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const groups: ThreadGroups<T> = { pinned: [], today: [], week: [], earlier: [] };
  for (const thread of [...threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (needle && !thread.title.toLowerCase().includes(needle)) continue;
    if (thread.pinned) groups.pinned.push(thread);
    else if (thread.updatedAt >= startOfToday) groups.today.push(thread);
    else if (thread.updatedAt >= startOfToday - 6 * DAY) groups.week.push(thread);
    else groups.earlier.push(thread);
  }
  return groups;
}
