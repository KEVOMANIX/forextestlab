import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SupportCustomerInbox } from "@/components/support/SupportCustomerInbox";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Support inbox",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SupportInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Fapp%2Fsupport");
  const conversations = await prisma.supportConversation.findMany({
    where: { userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      category: true,
      priority: true,
      status: true,
      customerUnreadCount: true,
      assignedAgentName: true,
      lastMessageAt: true,
      messages: {
        where: { visibility: "customer", deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
    },
  });
  const displayName =
    String(
      user.user_metadata?.display_name ??
        user.user_metadata?.full_name ??
        user.email?.split("@")[0] ??
        "Customer",
    ).slice(0, 120);
  return (
    <SupportCustomerInbox
      initialConversations={conversations.map((item) => ({
        ...item,
        lastMessageAt: item.lastMessageAt.toISOString(),
      }))}
      customerName={displayName}
      customerEmail={user.email ?? ""}
    />
  );
}
