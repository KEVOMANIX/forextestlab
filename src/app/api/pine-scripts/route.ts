import { NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth";
import { isPineSummary, type PineTestSummary } from "@/lib/chart/pine-results";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CODE = 100_000;
const MAX_SCRIPTS = 500;

type ScriptInput = { id?: unknown; name?: unknown; code?: unknown };

async function userId() {
  const user = await getCurrentUser();
  if (!user) return null;
  await ensureUserProfile(user);
  return user.id;
}

const unauthorised = () => NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });

function cleanScript(value: ScriptInput | undefined) {
  if (!value || typeof value.id !== "string" || !/^[\w-]{1,64}$/.test(value.id)) return null;
  if (typeof value.name !== "string" || typeof value.code !== "string" || value.code.length > MAX_CODE) return null;
  return { id: value.id, name: value.name.trim().slice(0, 80) || "Untitled script", code: value.code };
}

function parseResult(value: string | null): PineTestSummary | null {
  if (!value) return null;
  try { const result: unknown = JSON.parse(value); return isPineSummary(result) ? result : null; } catch { return null; }
}

export async function GET() {
  const id = await userId();
  if (!id) return unauthorised();
  const rows = await prisma.pineScript.findMany({ where: { userId: id }, orderBy: { updatedAt: "desc" }, take: MAX_SCRIPTS });
  const results: Record<string, PineTestSummary> = {};
  for (const row of rows) { const result = parseResult(row.resultJson); if (result) results[row.id] = result; }
  return NextResponse.json({
    ok: true,
    scripts: rows.map(row => ({ id: row.id, name: row.name, code: row.code, updatedAt: row.updatedAt.getTime() })),
    results,
  });
}

export async function PUT(request: Request) {
  const id = await userId();
  if (!id) return unauthorised();
  const text = await request.text();
  if (text.length > 5_000_000) return NextResponse.json({ ok: false, error: "Too large." }, { status: 413 });
  let body: { action?: string; script?: ScriptInput; scripts?: ScriptInput[]; results?: Record<string, unknown>; id?: string; result?: unknown };
  try { body = JSON.parse(text) as typeof body; } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }

  if (body.action === "save") {
    const script = cleanScript(body.script);
    if (!script) return NextResponse.json({ ok: false, error: "Invalid script." }, { status: 422 });
    const existing = await prisma.pineScript.findUnique({ where: { id: script.id }, select: { userId: true } });
    if (existing && existing.userId !== id) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    if (!existing && await prisma.pineScript.count({ where: { userId: id } }) >= MAX_SCRIPTS) {
      return NextResponse.json({ ok: false, error: `You can keep up to ${MAX_SCRIPTS} scripts.` }, { status: 422 });
    }
    await prisma.pineScript.upsert({ where: { id: script.id }, create: { ...script, userId: id }, update: { name: script.name, code: script.code } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "result") {
    if (typeof body.id !== "string" || !isPineSummary(body.result)) return NextResponse.json({ ok: false, error: "Invalid result." }, { status: 422 });
    // updatedAt is left alone so a test run does not count as an edit.
    const { count } = await prisma.$transaction(async tx => {
      const row = await tx.pineScript.findFirst({ where: { id: body.id, userId: id }, select: { updatedAt: true } });
      if (!row) return { count: 0 };
      return tx.pineScript.updateMany({ where: { id: body.id, userId: id }, data: { resultJson: JSON.stringify(body.result), updatedAt: row.updatedAt } });
    });
    return NextResponse.json({ ok: count > 0 }, { status: count > 0 ? 200 : 404 });
  }

  if (body.action === "import") {
    // Moves scripts kept in this browser by earlier versions into the account. Existing ids are left as they are.
    const scripts = (Array.isArray(body.scripts) ? body.scripts : []).map(cleanScript).filter(script => script !== null).slice(0, MAX_SCRIPTS);
    const results = body.results && typeof body.results === "object" ? body.results : {};
    const have = await prisma.pineScript.count({ where: { userId: id } });
    const fresh = scripts.slice(0, Math.max(0, MAX_SCRIPTS - have)).map(script => {
      const result = results[script.id];
      return { ...script, userId: id, resultJson: isPineSummary(result) ? JSON.stringify(result) : null };
    });
    const { count } = await prisma.pineScript.createMany({ data: fresh, skipDuplicates: true });
    return NextResponse.json({ ok: true, imported: count });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const id = await userId();
  if (!id) return unauthorised();
  const scriptId = new URL(request.url).searchParams.get("id");
  if (!scriptId) return NextResponse.json({ ok: false, error: "Script id required." }, { status: 422 });
  await prisma.pineScript.deleteMany({ where: { id: scriptId, userId: id } });
  return NextResponse.json({ ok: true });
}
