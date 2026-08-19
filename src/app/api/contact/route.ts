import { NextResponse } from "next/server";

import { sendContactEmail } from "@/lib/contact-email";
import { prisma } from "@/lib/db";
import type { ApiResult } from "@/lib/types";
import { validateContact } from "@/lib/validation";

// Run on the Node.js runtime — the local storage provider uses the filesystem.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse<ApiResult>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request body." },
      { status: 400 },
    );
  }

  const result = validateContact(payload);
  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Please correct the highlighted fields.",
        errors: result.errors,
      },
      { status: 422 },
    );
  }

  // Keep contact-form email in the same support inbox as widget messages.
  // Anonymous visitors remain email-only; registered users are linked so the
  // team can see their account context without creating a customer chat.
  const profile = await prisma.userProfile.findUnique({
    where: { email: result.data.email },
    select: { id: true, displayName: true },
  });
  const enquiry = await prisma.$transaction(async (tx) => {
    const contact = await tx.contactMessage.create({
      data: {
        name: result.data.name,
        email: result.data.email,
        subject: result.data.subject,
        message: result.data.message,
        consent: result.data.consent,
      },
      select: { id: true },
    });
    const now = new Date();
    await tx.supportConversation.create({
      data: {
        userId: profile?.id,
        customerName: result.data.name || profile?.displayName,
        customerEmail: result.data.email,
        subject: result.data.subject,
        channel: "email",
        status: "open",
        agentUnreadCount: 1,
        lastMessageAt: now,
        messages: {
          create: {
            senderType: "customer",
            senderName: result.data.name || result.data.email,
            body: result.data.message,
            deliveredAt: now,
          },
        },
      },
    });
    return contact;
  });

  try {
    await sendContactEmail(result.data);
    await prisma.contactMessage.update({
      where: { id: enquiry.id },
      data: { deliveryStatus: "delivered" },
    });
  } catch (error) {
    await prisma.contactMessage.update({
      where: { id: enquiry.id },
      data: { deliveryStatus: "failed" },
    });
    console.error("Failed to deliver contact submission:", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Something went wrong on our side. Please try again later.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: "Thanks for reaching out. We'll get back to you soon.",
    },
    { status: 201 },
  );
}
