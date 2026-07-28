import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import type { SavedWorkspace, WorkspacePayload, WorkspaceTemplate } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

async function profile() {
  const user = await getCurrentUser();
  if (!user) return null;
  await ensureUserProfile(user);
  return prisma.userProfile.findUnique({ where: { id: user.id } });
}

export async function GET() {
  const row = await profile();
  if (!row) return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  return NextResponse.json({
    ok: true,
    workspace: parseJson<SavedWorkspace>(row.workspaceJson),
    templates: parseJson<WorkspaceTemplate[]>(row.workspaceTemplatesJson) ?? [],
  });
}

export async function PUT(request: Request) {
  const row = await profile();
  if (!row) return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  const text = await request.text();
  if (text.length > 2_000_000) return NextResponse.json({ ok: false, error: "Workspace is too large." }, { status: 413 });
  let body: { action?: string; payload?: WorkspacePayload; name?: string; templateId?: string };
  try { body = JSON.parse(text) as typeof body; } catch {
    return NextResponse.json({ ok: false, error: "Invalid workspace." }, { status: 400 });
  }
  let templates = parseJson<WorkspaceTemplate[]>(row.workspaceTemplatesJson) ?? [];
  if (body.action === "save" || body.action === "import") {
    if (!body.payload || typeof body.payload !== "object") return NextResponse.json({ ok: false, error: "Workspace payload required." }, { status: 422 });
    const workspace: SavedWorkspace = { payload: body.payload, updatedAt: new Date().toISOString() };
    await prisma.userProfile.update({ where: { id: row.id }, data: { workspaceJson: JSON.stringify(workspace) } });
    return NextResponse.json({ ok: true, workspace, templates });
  }
  if (body.action === "reset") {
    await prisma.userProfile.update({ where: { id: row.id }, data: { workspaceJson: null } });
    return NextResponse.json({ ok: true, workspace: null, templates });
  }
  if (body.action === "save-template") {
    if (!body.payload || !body.name?.trim()) return NextResponse.json({ ok: false, error: "Template name and workspace required." }, { status: 422 });
    const template: WorkspaceTemplate = { id: randomUUID(), name: body.name.trim().slice(0, 60), payload: body.payload, updatedAt: new Date().toISOString() };
    templates = [...templates.slice(-19), template];
  } else if (body.action === "delete-template") {
    templates = templates.filter((item) => item.id !== body.templateId);
  } else {
    return NextResponse.json({ ok: false, error: "Unknown workspace action." }, { status: 400 });
  }
  await prisma.userProfile.update({ where: { id: row.id }, data: { workspaceTemplatesJson: JSON.stringify(templates) } });
  return NextResponse.json({ ok: true, templates });
}
