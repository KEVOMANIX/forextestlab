import { describe, expect, it } from "vitest";

import { getPublicRequestOrigin } from "@/lib/request-origin";
import { siteConfig } from "@/lib/site";

describe("getPublicRequestOrigin", () => {
  it("uses the public host forwarded by Nginx", () => {
    const request = new Request("http://localhost:3000/auth/callback", {
      headers: {
        host: "localhost:3000",
        "x-forwarded-host": "www.forextestlab.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(getPublicRequestOrigin(request)).toBe(
      "https://www.forextestlab.com",
    );
  });

  it("keeps a genuine local-development origin", () => {
    const request = new Request("http://localhost:3000/auth/callback", {
      headers: { host: "localhost:3000" },
    });

    expect(getPublicRequestOrigin(request)).toBe("http://localhost:3000");
  });

  it("rejects an untrusted forwarded host", () => {
    const request = new Request("http://localhost:3000/auth/callback", {
      headers: {
        host: "localhost:3000",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(getPublicRequestOrigin(request)).toBe(siteConfig.url);
  });
});
