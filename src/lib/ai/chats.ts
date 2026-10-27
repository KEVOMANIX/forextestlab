import "server-only";

import { prisma } from "@/lib/db";
import {
  MAX_CHAT_MESSAGES,
  MAX_MESSAGE_LENGTH,
  isMessage,
  threadTitle,
  type AnalystThread,
  type ChatMessage,
  type ChatSummary,
} from "@/lib/ai/analyst-threads";

/** Beyond this, the oldest unpinned chats are removed as new ones start. */
export const MAX_CHATS_PER_USER = 200;
const MAX_PLAN_LENGTH = 4000;

function parseMessages(json: string): ChatMessage[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter(isMessage) : [];
  } catch {
    return [];
  }
}

function clip(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_CHAT_MESSAGES).map((message) => ({ role: message.role, text: message.text.slice(0, MAX_MESSAGE_LENGTH) }));
}

const SUMMARY = { id: true, title: true, sessionId: true, pinned: true, updatedAt: true } as const;

function summary(row: { id: string; title: string; sessionId: string | null; pinned: boolean; updatedAt: Date }): ChatSummary {
  return { id: row.id, title: row.title, sessionId: row.sessionId, pinned: row.pinned, updatedAt: row.updatedAt.getTime() };
}

export async function listChats(userId: string): Promise<ChatSummary[]> {
  const rows = await prisma.aiChat.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: MAX_CHATS_PER_USER, select: SUMMARY });
  return rows.map(summary);
}

export async function getChat(userId: string, id: string): Promise<AnalystThread | null> {
  const row = await prisma.aiChat.findFirst({ where: { id, userId }, select: { ...SUMMARY, messagesJson: true } });
  return row ? { ...summary(row), messages: parseMessages(row.messagesJson) } : null;
}

/** A session can only be attached to a chat by its owner. */
async function ownedSessionId(userId: string, sessionId: string | null | undefined): Promise<string | null | false> {
  if (!sessionId) return null;
  const session = await prisma.backtestSession.findFirst({ where: { id: sessionId, userId, anonymous: false }, select: { id: true } });
  return session ? session.id : false;
}

async function trimOldChats(userId: string) {
  const stale = await prisma.aiChat.findMany({
    where: { userId, pinned: false },
    orderBy: { updatedAt: "desc" },
    skip: MAX_CHATS_PER_USER,
    select: { id: true },
  });
  if (stale.length) await prisma.aiChat.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
}

export async function createChat(userId: string, input: { title: string; sessionId?: string | null }): Promise<ChatSummary | null> {
  const sessionId = await ownedSessionId(userId, input.sessionId);
  if (sessionId === false) return null;
  const row = await prisma.aiChat.create({ data: { userId, sessionId, title: threadTitle(input.title) || "New chat" }, select: SUMMARY });
  await trimOldChats(userId);
  return summary(row);
}

export async function updateChat(userId: string, id: string, input: { title?: string; pinned?: boolean }): Promise<ChatSummary | null> {
  const data = {
    ...(typeof input.title === "string" && input.title.trim() ? { title: threadTitle(input.title) } : {}),
    ...(typeof input.pinned === "boolean" ? { pinned: input.pinned } : {}),
  };
  const { count } = await prisma.aiChat.updateMany({ where: { id, userId }, data });
  if (!count) return null;
  const row = await prisma.aiChat.findUnique({ where: { id }, select: SUMMARY });
  return row ? summary(row) : null;
}

export async function deleteChat(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.aiChat.deleteMany({ where: { id, userId } });
  return count > 0;
}

/** Called by the AI route once an answer has finished (or was stopped), so the reply is kept even if the tab closed. */
export async function appendExchange(userId: string, id: string, exchange: ChatMessage[]): Promise<void> {
  const chat = await prisma.aiChat.findFirst({ where: { id, userId }, select: { messagesJson: true } });
  if (!chat) return;
  const messages = clip([...parseMessages(chat.messagesJson), ...exchange.filter((message) => message.text.trim())]);
  await prisma.aiChat.update({ where: { id }, data: { messagesJson: JSON.stringify(messages) } });
}

/** Moves chats the first version of the page kept in the browser onto the account. */
export async function importChats(userId: string, threads: AnalystThread[]): Promise<number> {
  const sessionIds = [...new Set(threads.map((thread) => thread.sessionId).filter((id): id is string => Boolean(id)))];
  const owned = new Set((await prisma.backtestSession.findMany({ where: { userId, id: { in: sessionIds } }, select: { id: true } })).map((row) => row.id));
  const rows = threads
    .filter((thread) => thread.messages.length)
    .slice(0, 50)
    .map((thread) => ({
      userId,
      title: threadTitle(thread.title) || "Imported chat",
      sessionId: thread.sessionId && owned.has(thread.sessionId) ? thread.sessionId : null,
      pinned: thread.pinned,
      messagesJson: JSON.stringify(clip(thread.messages)),
      createdAt: new Date(thread.updatedAt),
      updatedAt: new Date(thread.updatedAt),
    }));
  if (!rows.length) return 0;
  const { count } = await prisma.aiChat.createMany({ data: rows });
  await trimOldChats(userId);
  return count;
}

export async function getTradingPlan(userId: string): Promise<string> {
  const plan = await prisma.tradingPlan.findUnique({ where: { userId }, select: { rules: true } });
  return plan?.rules ?? "";
}

export async function saveTradingPlan(userId: string, rules: string): Promise<string> {
  const text = rules.trim().slice(0, MAX_PLAN_LENGTH);
  if (!text) {
    await prisma.tradingPlan.deleteMany({ where: { userId } });
    return "";
  }
  await prisma.tradingPlan.upsert({ where: { userId }, create: { userId, rules: text }, update: { rules: text } });
  return text;
}

export { MAX_PLAN_LENGTH };
