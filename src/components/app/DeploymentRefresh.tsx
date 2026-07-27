"use client";

import { useEffect } from "react";

const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "development";
const CHECK_INTERVAL_MS = 60_000;

interface VersionResponse {
  version?: string;
}

export function DeploymentRefresh() {
  useEffect(() => {
    let stopped = false;
    let checking = false;
    const loadedUrl = new URL(window.location.href);
    if (loadedUrl.searchParams.get("_build") === CURRENT_BUILD) {
      loadedUrl.searchParams.delete("_build");
      window.history.replaceState(null, "", loadedUrl.toString());
    }

    const check = async () => {
      if (stopped || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;
        const data = (await response.json()) as VersionResponse;
        if (!data.version || data.version === CURRENT_BUILD) return;

        // A query-string cache buster guarantees the next document request
        // cannot reuse HTML from the previous deployment.
        const next = new URL(window.location.href);
        if (next.searchParams.get("_build") === data.version) return;
        next.searchParams.set("_build", data.version);
        window.location.replace(next.toString());
      } catch {
        // Losing the update check must never interrupt an active replay.
      } finally {
        checking = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    void check();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
