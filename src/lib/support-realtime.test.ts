import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  issueSupportRealtimeCapability,
  publishSupportConversationChanged,
  setSupportTyping,
  subscribeSupportRealtime,
  supportPresenceFor,
  supportRealtimeCapability,
} from "./support-realtime";

describe("support realtime", () => {
  it("shares only the other side's ephemeral typing presence", () => {
    const conversationId = `typing-${crypto.randomUUID()}`;
    const customerToken = issueSupportRealtimeCapability({
      actorId: "customer-1",
      conversationId,
      name: "Kelvin",
      role: "customer",
    });
    const agentToken = issueSupportRealtimeCapability({
      actorId: "agent-1",
      conversationId,
      name: "Support",
      role: "agent",
    });
    const customer = supportRealtimeCapability(customerToken)!;
    const agent = supportRealtimeCapability(agentToken)!;

    setSupportTyping(customer, true);
    expect(supportPresenceFor(agent)).toEqual([
      { actorId: "customer-1", name: "Kelvin", role: "customer" },
    ]);
    expect(supportPresenceFor(customer)).toEqual([]);

    setSupportTyping(customer, false);
    expect(supportPresenceFor(agent)).toEqual([]);
  });

  it("notifies both the selected conversation and the team inbox", () => {
    const conversationId = `conversation-${crypto.randomUUID()}`;
    const selected = vi.fn();
    const team = vi.fn();
    const unsubscribeSelected = subscribeSupportRealtime(
      conversationId,
      selected,
    );
    const unsubscribeTeam = subscribeSupportRealtime("*", team);

    publishSupportConversationChanged(conversationId);

    expect(selected).toHaveBeenCalledWith({
      type: "conversation",
      conversationId,
    });
    expect(team).toHaveBeenCalledWith({
      type: "conversation",
      conversationId,
    });
    unsubscribeSelected();
    unsubscribeTeam();
  });
});
