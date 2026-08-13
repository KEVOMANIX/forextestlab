import "dotenv/config";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { sendOperationalAlert } from "../src/lib/contact-email";
import { prisma } from "../src/lib/db";
import { collectOperationsSnapshot, type HealthStatus } from "../src/lib/operations/health";

const statePath = path.resolve("data/.operations-monitor.json");
const ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;

interface MonitorState { status: HealthStatus; lastAlertAt: string | null }

async function readState(): Promise<MonitorState | null> {
  return JSON.parse(await readFile(statePath, "utf8")) as MonitorState;
}

async function saveState(state: MonitorState) {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporary, statePath);
}

async function main() {
  const snapshot = await collectOperationsSnapshot({ checkWebsite: true });
  await prisma.operationalCheck.createMany({
    data: snapshot.checks.map((check) => ({
      component: check.component,
      status: check.status,
      latencyMs: check.latencyMs,
      message: check.message.slice(0, 500),
      metadataJson: check.metadata ? JSON.stringify(check.metadata) : null,
      checkedAt: new Date(snapshot.checkedAt),
    })),
  });
  await prisma.operationalCheck.deleteMany({
    where: { checkedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
  });
  await prisma.productEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } },
  });

  const previous = await readState().catch(() => null);
  const lastAlert = previous?.lastAlertAt ? new Date(previous.lastAlertAt).getTime() : 0;
  const shouldAlert = snapshot.status !== "healthy" && (
    previous?.status !== snapshot.status || Date.now() - lastAlert >= ALERT_REPEAT_MS
  );
  const recovered = snapshot.status === "healthy" && previous && previous.status !== "healthy";

  if (shouldAlert || recovered) {
    const unhealthy = snapshot.checks.filter((check) => check.status !== "healthy");
    const alertStatus: "failed" | "degraded" | "recovered" = recovered
      ? "recovered"
      : snapshot.status === "failed"
        ? "failed"
        : "degraded";
    await sendOperationalAlert({
      status: alertStatus,
      summary: recovered ? "Production services recovered" : `${unhealthy.length} production check${unhealthy.length === 1 ? "" : "s"} need attention`,
      details: (recovered ? snapshot.checks : unhealthy).map((check) => `${check.component}: ${check.message}`),
    });
  }
  await saveState({
    status: snapshot.status,
    lastAlertAt: shouldAlert || recovered ? new Date().toISOString() : previous?.lastAlertAt ?? null,
  });
  console.log(`${snapshot.status}: ${snapshot.checks.map((check) => `${check.component}=${check.status}`).join(" ")}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
