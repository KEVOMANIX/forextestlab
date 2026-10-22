"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { refreshOperationsSnapshot } from "@/lib/operations/snapshot-store";

/** Runs every check now instead of waiting for the monitor's next run. */
export async function checkOperationsNow() {
  await requireAdmin("/admin/operations");
  await refreshOperationsSnapshot();
  revalidatePath("/admin/operations");
}
