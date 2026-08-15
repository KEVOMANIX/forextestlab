import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  issueSupportRealtimeCapability,
  setSupportTyping,
  subscribeSupportRealtime,
  supportPresenceFor,
  supportRealtimeCapability,
  type SupportRealtimeEvent,
  type SupportRealtimeRole,
} from "@/lib/support-realtime";
import {
  canAccessSupportConversation,
  currentSupportAgent,
} from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function realtimeToken(request: Request) {
  return request.headers.get("x-support-realtime-token")?.trim() ?? "";
}

function encodeEvent(event: SupportRealtimeEvent) {
  return encoder.encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid realtime request." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, message: "Invalid realtime request." },
      { status: 400 },
    );
  }
  const input = body as Record<string, unknown>;
  const action = clean(input.action, 20);

  if (action === "typing") {
    const token = realtimeToken(request);
    const capability = supportRealtimeCapability(token);
    if (!capability) {
      return NextResponse.json(
        { ok: false, message: "Realtime session expired." },
        { status: 401 },
      );
    }
    if (!rateLimit(`support-typing:${token.slice(0, 24)}`, 120, 60_000).ok) {
      return new Response(null, { status: 429 });
    }
    setSupportTyping(capability, input.typing === true);
    return new Response(null, { status: 204 });
  }

  if (action !== "connect") {
    return NextResponse.json(
      { ok: false, message: "Unknown realtime action." },
      { status: 422 },
    );
  }
  if (!rateLimit(`support-realtime-connect:${clientIp(request)}`, 30, 60_000).ok) {
    return NextResponse.json(
      { ok: false, message: "Too many realtime connections." },
      { status: 429 },
    );
  }

  const conversationId = clean(input.conversationId, 100);
  const requestedRole = clean(input.role, 20) as SupportRealtimeRole;
  const visitorId = clean(input.visitorId, 120);
  if (!conversationId || !["customer", "agent"].includes(requestedRole)) {
    return NextResponse.json(
      { ok: false, message: "Conversation details are required." },
      { status: 422 },
    );
  }

  if (requestedRole === "agent") {
    const identity = await currentSupportAgent();
    if (!identity) {
      return NextResponse.json(
        { ok: false, message: "Support access is required." },
        { status: 403 },
      );
    }
    if (conversationId !== "*") {
      const conversation = await prisma.supportConversation.findUnique({
        where: { id: conversationId },
        select: { assignedAgentId: true },
      });
      if (
        !conversation ||
        (conversation.assignedAgentId &&
          conversation.assignedAgentId !== identity.agent.id)
      ) {
        return NextResponse.json(
          { ok: false, message: "Another agent owns this conversation." },
          { status: 403 },
        );
      }
    }
    const token = issueSupportRealtimeCapability({
      actorId: `agent:${identity.agent.id}`,
      conversationId,
      name: identity.agent.displayName,
      role: "agent",
    });
    return NextResponse.json({ ok: true, token });
  }

  if (conversationId === "*") {
    return NextResponse.json(
      { ok: false, message: "Conversation details are required." },
      { status: 422 },
    );
  }
  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userId: true,
      visitorId: true,
      accessTokenHash: true,
      customerName: true,
      customerEmail: true,
    },
  });
  if (
    !conversation ||
    !(await canAccessSupportConversation(request, conversation, visitorId))
  ) {
    return NextResponse.json(
      { ok: false, message: "Conversation not found." },
      { status: 404 },
    );
  }
  const token = issueSupportRealtimeCapability({
    actorId: conversation.userId
      ? `customer:${conversation.userId}`
      : `visitor:${conversation.visitorId ?? conversation.id}`,
    conversationId,
    name:
      conversation.customerName ||
      conversation.customerEmail?.split("@")[0] ||
      "Customer",
    role: "customer",
  });
  return NextResponse.json({ ok: true, token });
}

export async function GET(request: Request) {
  const capability = supportRealtimeCapability(realtimeToken(request));
  if (!capability) {
    return NextResponse.json(
      { ok: false, message: "Realtime session expired." },
      { status: 401 },
    );
  }

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: SupportRealtimeEvent) => {
        if (closed) return;
        if (event.type === "presence") {
          controller.enqueue(
            encodeEvent({
              ...event,
              participants: event.participants.filter(
                (participant) => participant.role !== capability.role,
              ),
            }),
          );
          return;
        }
        controller.enqueue(encodeEvent(event));
      };
      send({
        type: "presence",
        participants: supportPresenceFor(capability),
      });
      const unsubscribe = subscribeSupportRealtime(
        capability.conversationId,
        send,
      );
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_MS);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // The browser or proxy may already have closed the stream.
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
      cleanup = close;
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
