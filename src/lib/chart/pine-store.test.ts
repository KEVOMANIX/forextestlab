import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const events: string[] = [];
vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) });
vi.stubGlobal("window", { dispatchEvent: (event: Event) => void events.push(event.type), addEventListener: () => {} });

describe("Pine scripts in the account", () => {
  it("moves browser scripts into the account, then reads and saves there", async () => {
    store.set("forextestlab:pine-scripts:v1", JSON.stringify([{ id: "old", name: "Old", code: "//", updatedAt: 1 }]));
    const server = [{ id: "old", name: "Old", code: "//", updatedAt: 5 }];
    const calls: { method: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined });
      return new Response(JSON.stringify({ ok: true, scripts: server, results: {} }));
    }));
    const { loadPineScripts, readPineScripts, savePineScript, deletePineScript, pineScriptsLoaded } = await import("./pine-scripts");
    expect(await loadPineScripts()).toEqual(server);
    expect(pineScriptsLoaded()).toBe(true);
    expect(calls.map(call => call.method)).toEqual(["GET", "PUT", "GET"]);
    expect(calls[1]!.body).toMatchObject({ action: "import", scripts: [{ id: "old" }] });
    expect(store.has("forextestlab:pine-scripts:v1")).toBe(false);

    expect(await savePineScript({ id: "new", name: "New", code: "x", updatedAt: 9 })).toBe(true);
    expect(readPineScripts().map(script => script.id)).toEqual(["new", "old"]);
    expect(calls.at(-1)).toEqual({ method: "PUT", body: { action: "save", script: { id: "new", name: "New", code: "x" } } });
    await deletePineScript("old");
    expect(readPineScripts().map(script => script.id)).toEqual(["new"]);
    expect(calls.at(-1)!.method).toBe("DELETE");
    expect(store.size).toBe(0);
  });
});
