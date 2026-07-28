let timer = null;

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

self.onmessage = (event) => {
  if (event.data?.type === "stop") {
    stop();
    return;
  }
  if (event.data?.type !== "start") return;
  stop();
  const intervalMs = Math.max(4, Number(event.data.intervalMs) || 8);
  self.postMessage({ type: "tick", now: Date.now() });
  timer = setInterval(() => {
    self.postMessage({ type: "tick", now: Date.now() });
  }, intervalMs);
};
