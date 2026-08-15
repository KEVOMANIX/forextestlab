import "server-only";

import { randomBytes } from "crypto";

export type SupportRealtimeRole = "customer" | "agent";

export type SupportRealtimeParticipant = {
  actorId: string;
  conversationId: string;
  name: string;
  role: SupportRealtimeRole;
};

export type SupportPresence = Pick<
  SupportRealtimeParticipant,
  "actorId" | "name" | "role"
>;

export type SupportRealtimeEvent =
  | { type: "presence"; participants: SupportPresence[] }
  | { type: "conversation"; conversationId: string };

type Capability = SupportRealtimeParticipant & { expiresAt: number };
type TypingEntry = SupportPresence & {
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};
type Subscriber = (event: SupportRealtimeEvent) => void;

type SupportRealtimeStore = {
  capabilities: Map<string, Capability>;
  typing: Map<string, Map<string, TypingEntry>>;
  subscribers: Map<string, Set<Subscriber>>;
};

const CAPABILITY_TTL_MS = 4 * 60 * 60_000;
const TYPING_TTL_MS = 3_500;

declare global {
  // eslint-disable-next-line no-var
  var __forexTestLabSupportRealtime: SupportRealtimeStore | undefined;
}

const store =
  globalThis.__forexTestLabSupportRealtime ??
  (globalThis.__forexTestLabSupportRealtime = {
    capabilities: new Map(),
    typing: new Map(),
    subscribers: new Map(),
  });

function emit(channel: string, event: SupportRealtimeEvent) {
  for (const subscriber of store.subscribers.get(channel) ?? []) {
    try {
      subscriber(event);
    } catch {
      // A disconnected stream is cleaned up by its request abort handler. One
      // stale listener must not prevent the remaining viewers from updating.
    }
  }
}

function emitPresence(conversationId: string) {
  const now = Date.now();
  const entries = store.typing.get(conversationId);
  if (entries) {
    for (const [actorId, entry] of entries) {
      if (entry.expiresAt <= now) {
        clearTimeout(entry.timer);
        entries.delete(actorId);
      }
    }
    if (!entries.size) store.typing.delete(conversationId);
  }
  emit(conversationId, {
    type: "presence",
    participants: [...(entries?.values() ?? [])].map(
      ({ actorId, name, role }) => ({ actorId, name, role }),
    ),
  });
}

function pruneCapabilities() {
  const now = Date.now();
  for (const [token, capability] of store.capabilities) {
    if (capability.expiresAt <= now) store.capabilities.delete(token);
  }
}

export function issueSupportRealtimeCapability(
  participant: SupportRealtimeParticipant,
) {
  pruneCapabilities();
  const token = randomBytes(32).toString("base64url");
  store.capabilities.set(token, {
    ...participant,
    expiresAt: Date.now() + CAPABILITY_TTL_MS,
  });
  return token;
}

export function supportRealtimeCapability(token: string) {
  const capability = store.capabilities.get(token);
  if (!capability) return null;
  if (capability.expiresAt <= Date.now()) {
    store.capabilities.delete(token);
    return null;
  }
  return capability;
}

export function supportPresenceFor(capability: Capability) {
  if (capability.conversationId === "*") return [];
  const now = Date.now();
  return [...(store.typing.get(capability.conversationId)?.values() ?? [])]
    .filter(
      (entry) => entry.expiresAt > now && entry.role !== capability.role,
    )
    .map(({ actorId, name, role }) => ({ actorId, name, role }));
}

export function setSupportTyping(capability: Capability, typing: boolean) {
  if (capability.conversationId === "*") return;
  const entries =
    store.typing.get(capability.conversationId) ??
    new Map<string, TypingEntry>();
  store.typing.set(capability.conversationId, entries);

  const previous = entries.get(capability.actorId);
  if (previous) clearTimeout(previous.timer);
  if (!typing) {
    entries.delete(capability.actorId);
    if (!entries.size) store.typing.delete(capability.conversationId);
    emitPresence(capability.conversationId);
    return;
  }

  const expiresAt = Date.now() + TYPING_TTL_MS;
  const timer = setTimeout(() => {
    const current = store.typing
      .get(capability.conversationId)
      ?.get(capability.actorId);
    if (!current || current.expiresAt !== expiresAt) return;
    store.typing.get(capability.conversationId)?.delete(capability.actorId);
    emitPresence(capability.conversationId);
  }, TYPING_TTL_MS + 50);
  timer.unref?.();
  entries.set(capability.actorId, {
    actorId: capability.actorId,
    name: capability.name,
    role: capability.role,
    expiresAt,
    timer,
  });
  emitPresence(capability.conversationId);
}

export function subscribeSupportRealtime(
  channel: string,
  subscriber: Subscriber,
) {
  const subscribers = store.subscribers.get(channel) ?? new Set<Subscriber>();
  subscribers.add(subscriber);
  store.subscribers.set(channel, subscribers);
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) store.subscribers.delete(channel);
  };
}

export function publishSupportConversationChanged(conversationId: string) {
  const event: SupportRealtimeEvent = { type: "conversation", conversationId };
  emit(conversationId, event);
  emit("*", event);
}
