import { prisma } from "@/lib/db";

const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" };
function page(message: string, form = false, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>ForexTestLab email preferences</title><body style="font:16px system-ui;max-width:540px;margin:80px auto;padding:24px"><h1>ForexTestLab</h1><p>${message}</p>${form ? '<form method="post"><button style="padding:12px 20px">Unsubscribe from feedback emails</button></form>' : ''}</body></html>`, { status, headers });
}
type Context = { params: Promise<{ token: string }> };
async function recipient(context: Context) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return prisma.feedbackRecipient.findUnique({ where: { token }, select: { email: true } });
}
export async function GET(_request: Request, context: Context) {
  if (!await recipient(context)) return page("This unsubscribe link is not valid.", false, 404);
  return page("Stop receiving optional feedback requests. Your account and essential service emails will not be affected.", true);
}
export async function POST(_request: Request, context: Context) {
  const row = await recipient(context);
  if (!row) return page("This unsubscribe link is not valid.", false, 404);
  await prisma.feedbackEmailOptOut.upsert({ where: { email: row.email }, create: { email: row.email }, update: {} });
  return page("You have unsubscribed from feedback requests. Your account and essential service emails will not be affected.");
}
