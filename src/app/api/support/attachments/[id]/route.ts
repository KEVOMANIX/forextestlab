import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  canAccessSupportConversation,
  currentSupportAgent,
} from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const attachment = await prisma.supportAttachment.findUnique({
    where: { id: params.id },
    include: {
      message: {
        include: { conversation: true },
      },
    },
  });
  if (!attachment) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }
  const agent = await currentSupportAgent();
  const visitorId = new URL(request.url).searchParams.get("visitorId") ?? "";
  if (
    !agent &&
    !(await canAccessSupportConversation(
      request,
      attachment.message.conversation,
      visitorId,
    ))
  ) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `attachment; filename="${attachment.fileName.replaceAll('"', "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
