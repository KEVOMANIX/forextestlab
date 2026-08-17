import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What an unauthorised visit does.
 *
 * Both gates used to answer `notFound()` once a visitor was signed in without
 * access, which is indistinguishable from a broken link: a support agent whose
 * account had not been activated could not tell that apart from being signed in
 * as the wrong person. These pin the redirects that replaced it.
 */

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const getCurrentUser = vi.fn();
const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("next/navigation", () => ({ redirect, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser }));
vi.mock("@/lib/db", () => ({
  prisma: { supportAgent: { findUnique, upsert } },
}));

const { requireAdmin } = await import("./admin");
const { requireSupportAgent } = await import("./support");

/** The thrown redirect, as a path. */
async function destinationOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    return message;
  }
  return "no redirect";
}

beforeEach(() => {
  redirect.mockClear();
  getCurrentUser.mockReset();
  findUnique.mockReset();
  upsert.mockReset();
  vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
  vi.stubEnv("ADMIN_USER_IDS", "");
});

describe("the admin gate", () => {
  // The gate honours whatever destination it is handed. The layout passes the
  // area root today, since a React layout cannot see the requested path.
  it("sends a signed-out visitor to the admin sign-in, keeping their destination", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await destinationOf(() => requireAdmin("/admin/operations"))).toBe(
      "/admin/sign-in?next=%2Fadmin%2Foperations",
    );
  });

  it("explains itself to a signed-in visitor with no access", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "customer@example.com" });
    expect(await destinationOf(() => requireAdmin())).toBe("/admin/sign-in?denied=1");
  });

  it("lets a configured administrator through", async () => {
    getCurrentUser.mockResolvedValue({ id: "u2", email: "boss@example.com" });
    await expect(requireAdmin()).resolves.toMatchObject({ email: "boss@example.com" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("the support gate", () => {
  it("sends a signed-out agent to the support sign-in", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await destinationOf(() => requireSupportAgent())).toBe(
      "/support-team/sign-in?next=%2Fsupport-team",
    );
  });

  it("explains itself to an account that is not an agent", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "customer@example.com" });
    findUnique.mockResolvedValue(null);
    expect(await destinationOf(() => requireSupportAgent())).toBe(
      "/support-team/sign-in?denied=1",
    );
  });

  it("treats a deactivated agent as no access rather than letting them in", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "former@example.com" });
    findUnique.mockResolvedValue({ id: "a1", active: false, role: "agent" });
    expect(await destinationOf(() => requireSupportAgent())).toBe(
      "/support-team/sign-in?denied=1",
    );
  });

  it("lets an active agent through", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "agent@example.com" });
    findUnique.mockResolvedValue({ id: "a1", active: true, role: "agent" });
    await expect(requireSupportAgent()).resolves.toMatchObject({
      agent: { id: "a1" },
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
