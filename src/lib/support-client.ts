/**
 * Browser-side identity for support chat. Anonymous visitors are recognised by
 * a generated visitor id plus a per-conversation access token, both kept in
 * localStorage so a conversation survives a reload without an account.
 */
const VISITOR_KEY = "forextestlab_support_visitor";
export const SUPPORT_ACTIVE_KEY = "forextestlab_support_conversation";
const TOKENS_KEY = "forextestlab_support_tokens";

export function supportVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_KEY, created);
  return created;
}

/** Reads the visitor id without minting one, so a visitor who has never
 * contacted support leaves no trace and triggers no unread lookup. */
export function existingSupportVisitorId() {
  return window.localStorage.getItem(VISITOR_KEY);
}

function tokenMap(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(TOKENS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveSupportToken(conversationId: string, token: string) {
  const tokens = tokenMap();
  tokens[conversationId] = token;
  window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function supportHeaders(conversationId: string, json = false) {
  const token = tokenMap()[conversationId];
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "x-support-token": token } : {}),
  };
}

export type SupportAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type SupportChatMessage = {
  id: string;
  senderType: string;
  senderName: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
  attachments: SupportAttachment[];
};

export type SupportChatConversation = {
  id: string;
  subject: string;
  status: string;
  assignedAgentName?: string | null;
  customerUnreadCount: number;
  satisfactionScore?: number | null;
  messages: SupportChatMessage[];
};

export type SupportChatSummary = {
  id: string;
  subject: string;
  status: string;
  customerUnreadCount: number;
  messages: Array<{ body: string }>;
};
