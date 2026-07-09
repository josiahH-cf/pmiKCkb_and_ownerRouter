import { describe, expect, it } from "vitest";

import { extractClientIp, hashClientIp } from "@/lib/maintenance/intake-client-ip";

function headers(map: Record<string, string>): Headers {
  return new Headers(map);
}

describe("extractClientIp", () => {
  it("takes the RIGHTMOST XFF hop (least forgeable), not the client-controlled leftmost", () => {
    // Attacker prepends a fake client IP; the rightmost is what our trusted proxy observed.
    expect(
      extractClientIp(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then null", () => {
    expect(extractClientIp(headers({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
    expect(extractClientIp(headers({}))).toBeNull();
    expect(extractClientIp(headers({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("hashClientIp", () => {
  it("produces a stable opaque hash for the same ip+salt", () => {
    const a = hashClientIp("203.0.113.9", "salt-1");
    const b = hashClientIp("203.0.113.9", "salt-1");
    expect(a).toBe(b);
    expect(a).not.toContain("203.0.113.9");
    expect(a).toHaveLength(32);
  });

  it("differs by salt (no cross-deployment correlation)", () => {
    expect(hashClientIp("203.0.113.9", "salt-1")).not.toBe(
      hashClientIp("203.0.113.9", "salt-2"),
    );
  });

  it("returns null without an ip or without a salt (no unsalted hashing)", () => {
    expect(hashClientIp(null, "salt-1")).toBeNull();
    expect(hashClientIp("203.0.113.9", undefined)).toBeNull();
    expect(hashClientIp("203.0.113.9", "  ")).toBeNull();
  });
});
