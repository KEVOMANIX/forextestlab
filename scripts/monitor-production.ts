import "dotenv/config";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { sendOperationalAlert } from "../src/lib/contact-email";
import { prisma } from "../src/lib/db";
import { decideAlert, parseMonitorState, type MonitorState } from "../src/lib/operations/alerting";
import { collectOperationsSnapshot } from "../src/lib/operations/health";
import { saveOperationsSnapshot } from "../src/lib/operations/snapshot-store";

const statePath = path.resolve("data/.operations-monitor.json");

async function readState(now: Date): Promise<MonitorState | null> {
  return parseMonitorState(JSON.parse(await readFile(statePath, "utf8")), now);
}

async function saveState(state: MonitorState) {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporary, statePath);
}

async function main() {
  const snapshot = await collectOperationsSnapshot({ checkWebsite: true });
  // The operations page shows this instead of listing R2 on every visit.
  await saveOperationsSnapshot(snapshot).catch((error) => console.error("Could not store the operations snapshot:", error));
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

  const now = new Date();
  const previous = await readState(now).catch(() => null);
  const { send, next } = decideAlert(previous, snapshot.status, now);

  if (send) {
    const unhealthy = snapshot.checks.filter((check) => check.status !== "healthy");
    await sendOperationalAlert({
      status: send,
      summary: send === "recovered" ? "Production services recovered" : `${unhealthy.length} production check${unhealthy.length === 1 ? "" : "s"} need attention`,
      details: (send === "recovered" ? snapshot.checks : unhealthy).map((check) => `${check.component}: ${check.message}`),
    });
  }
  await saveState(next);
  console.log(`${snapshot.status}: ${snapshot.checks.map((check) => `${check.component}=${check.status}`).join(" ")}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
