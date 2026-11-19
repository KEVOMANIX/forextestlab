import { NextResponse } from "next/server";
import { Resend } from "resend";

import { prisma } from "@/lib/db";
import { currentSupportAgent } from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The original HTML of an inbound support email, for the team inbox's
 * Gmail-style reader. Only the plain text is stored, so the HTML is fetched
 * from Resend by the stored email id and kept in a small in-memory cache.
 *
 * The response can never run code: the CSP forbids scripts and sandboxes the
 * document, and the inbox frames it with a sandbox that omits allow-scripts.
 */
const cache = new Map<string, string>();
const CACHE_LIMIT = 200;

const CSP = [
  "default-src 'none'",
  "img-src https: http: data: cid:",
  "style-src 'unsafe-inline' https:",
  "font-src https: data:",
  "script-src 'none'",
  "form-action 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox",
].join("; ");

function notFound() {
  return NextResponse.json({ message: "Not found." }, { status: 404 });
}

function wrap(html: string) {
  const head =
    '<base target="_blank"><meta name="referrer" content="no-referrer">' +
    "<style>html,body{margin:0!important;padding:0;background:#fff;color:#202124}" +
    "body{font-family:Arial,Helvetica,sans-serif;font-size:14px;overflow-x:auto;overflow-y:hidden}" +
    "img{max-width:100%;height:auto}</style>";
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (tag) => tag + head);
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const agent = await currentSupportAgent();
  if (!agent) return notFound();

  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": CSP,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  const cached = cache.get(id);
  if (cached) return new NextResponse(cached, { headers });

  const message = await prisma.supportMessage.findUnique({
    where: { id },
    select: { senderType: true, metadataJson: true, deletedAt: true },
  });
  if (!message || message.deletedAt || message.senderType !== "customer") return notFound();

  let emailId = "";
  try {
    emailId = String((JSON.parse(message.metadataJson ?? "{}") as { resendEmailId?: unknown }).resendEmailId ?? "");
  } catch {
    emailId = "";
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!emailId || !apiKey) return notFound();

  const received = await new Resend(apiKey).emails.receiving.get(emailId).catch(() => null);
  const html = received?.data?.html;
  if (!html || !html.trim()) return notFound();

  const page = wrap(html.slice(0, 2_000_000));
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(id, page);
  return new NextResponse(page, { headers });
}
