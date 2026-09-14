import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { feedbackRecipient: { findUnique: mocks.find }, feedbackEmailOptOut: { upsert: mocks.save } } }));
import { GET, POST } from "./route";
const context = () => ({ params: Promise.resolve({ token: "a".repeat(48) }) });
beforeEach(() => { vi.resetAllMocks(); mocks.find.mockResolvedValue({ email: "user@example.com" }); });
it("GET confirms without changing preferences, including link scanners", async () => {
  const response = await GET(new Request("https://example.com"), context());
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('method="post"');
  expect(mocks.save).not.toHaveBeenCalled();
});
it("POST persists the opt-out without requiring sign-in", async () => {
  expect((await POST(new Request("https://example.com", { method: "POST" }), context())).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith({ where: { email: "user@example.com" }, create: { email: "user@example.com" }, update: {} });
});
it("rejects invalid tokens without revealing addresses", async () => {
  mocks.find.mockResolvedValue(null);
  const response = await POST(new Request("https://example.com", { method: "POST" }), context());
  expect(response.status).toBe(404);
  expect(mocks.save).not.toHaveBeenCalled();
});
