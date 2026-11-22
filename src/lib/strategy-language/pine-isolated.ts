import "server-only";

import { createConnection } from "node:net";

/** Runs one Pine request in the sandboxed runner (deploy/forextestlab-pine@.service). */
const PINE_SOCKET = "/run/forextestlab-pine.sock";

export function runIsolated(input: unknown, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(PINE_SOCKET);
    let output = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      socket.destroy();
      if (error) reject(error);
      else { try { resolve(JSON.parse(output)); } catch { reject(new Error("The Pine engine returned an invalid result.")); } }
    };
    const abort = () => finish(new Error("Test canceled."));
    const timer = setTimeout(() => finish(new Error("Pine test exceeded the 30-second limit.")), 30_000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.end(JSON.stringify(input)));
    socket.on("data", (chunk: string) => { output += chunk; if (output.length > 48_000_000) finish(new Error("Pine result exceeded the size limit.")); });
    socket.on("end", () => finish());
    socket.on("error", (error: NodeJS.ErrnoException) => {
      console.error("Isolated Pine socket error", { code: error.code, syscall: error.syscall });
      finish(new Error("The isolated Pine runner is unavailable."));
    });
    socket.on("close", () => { if (!settled) finish(new Error("The isolated Pine runner closed unexpectedly.")); });
  });
}
