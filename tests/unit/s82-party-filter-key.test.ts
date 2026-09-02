import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PARTY_FILTER_TOKEN_PATTERN,
  createPartyFilterResolver,
  derivePartyFilterToken,
  readPartyFilterKeyConfig,
  type PartyFilterKeyConfig,
} from "@/lib/lease-renewal/party-filter-key";

const KEY_A = randomBytes(32).toString("base64url");
const KEY_B = randomBytes(32).toString("base64url");

function readyConfig(active = KEY_A, previous?: string): PartyFilterKeyConfig {
  return readPartyFilterKeyConfig({
    RENEWAL_DESK_PARTY_FILTER_KEY: active,
    ...(previous ? { RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY: previous } : {}),
  });
}

describe("S82 party-filter key configuration", () => {
  it("accepts exactly one canonical 32-byte active key with an optional distinct previous key", () => {
    expect(readyConfig().status).toBe("ready");
    expect(readyConfig(KEY_A, KEY_B).status).toBe("ready");
  });

  it.each([
    ["missing", {}],
    ["empty", { RENEWAL_DESK_PARTY_FILTER_KEY: "" }],
    ["short", { RENEWAL_DESK_PARTY_FILTER_KEY: KEY_A.slice(0, 42) }],
    ["padded", { RENEWAL_DESK_PARTY_FILTER_KEY: `${KEY_A}=` }],
    ["non-base64url", { RENEWAL_DESK_PARTY_FILTER_KEY: `${KEY_A.slice(0, 42)}+` }],
    [
      "non-canonical final character",
      // 43 base64url chars whose last char carries truncated bits that do not re-encode
      // byte-identically (e.g. 'B' -> decodes then re-encodes as 'A').
      { RENEWAL_DESK_PARTY_FILTER_KEY: `${"A".repeat(42)}B` },
    ],
    [
      "duplicate previous key",
      {
        RENEWAL_DESK_PARTY_FILTER_KEY: KEY_A,
        RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY: KEY_A,
      },
    ],
    [
      "malformed previous key",
      {
        RENEWAL_DESK_PARTY_FILTER_KEY: KEY_A,
        RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY: "not-a-key",
      },
    ],
  ])("fails the whole feature closed for a %s key", (_label, env) => {
    expect(readPartyFilterKeyConfig(env).status).toBe("unavailable");
  });
});

describe("S82 party-filter token derivation", () => {
  const key = Buffer.from(KEY_A, "base64url");

  it("emits deterministic p1_ tokens of exactly 43 unpadded base64url characters", () => {
    const token = derivePartyFilterToken(key, {
      spaceId: "renewals",
      partyKind: "owner",
      normalizedLabel: "owner alpha",
    });
    expect(token).toMatch(PARTY_FILTER_TOKEN_PATTERN);
    expect(
      derivePartyFilterToken(key, {
        spaceId: "renewals",
        partyKind: "owner",
        normalizedLabel: "owner alpha",
      }),
    ).toBe(token);
  });

  it("binds space, party kind, label, and key into distinct tokens", () => {
    const base = {
      spaceId: "renewals",
      partyKind: "owner" as const,
      normalizedLabel: "owner alpha",
    };
    const token = derivePartyFilterToken(key, base);
    expect(derivePartyFilterToken(key, { ...base, partyKind: "tenant" })).not.toBe(token);
    expect(derivePartyFilterToken(key, { ...base, spaceId: "maintenance" })).not.toBe(
      token,
    );
    expect(
      derivePartyFilterToken(key, { ...base, normalizedLabel: "owner beta" }),
    ).not.toBe(token);
    expect(derivePartyFilterToken(Buffer.from(KEY_B, "base64url"), base)).not.toBe(token);
  });
});

describe("S82 party-filter resolver", () => {
  it("matches an active-key token only against a present party of the same kind", () => {
    const resolver = createPartyFilterResolver(readyConfig(), "renewals");
    const token = resolver.tokenFor("owner", "owner alpha");
    if (!token) throw new Error("Expected an active-key token.");

    expect(resolver.matches(token, "owner", ["owner alpha", "owner beta"])).toBe(true);
    expect(resolver.matches(token, "owner", ["owner beta"])).toBe(false);
    expect(resolver.matches(token, "tenant", ["owner alpha"])).toBe(false);
    expect(resolver.resolves(token, "owner", ["owner alpha"])).toBe(true);
    expect(resolver.resolves(token, "owner", [])).toBe(false);
  });

  it("accepts a previous-key token during rotation and drops it once rotation completes", () => {
    const oldResolver = createPartyFilterResolver(readyConfig(KEY_B), "renewals");
    const oldToken = oldResolver.tokenFor("tenant", "tenant alpha");
    if (!oldToken) throw new Error("Expected a token under the old key.");

    const rotating = createPartyFilterResolver(readyConfig(KEY_A, KEY_B), "renewals");
    expect(rotating.matches(oldToken, "tenant", ["tenant alpha"])).toBe(true);

    const completed = createPartyFilterResolver(readyConfig(KEY_A), "renewals");
    expect(completed.matches(oldToken, "tenant", ["tenant alpha"])).toBe(false);
  });

  it("rejects malformed tokens and never emits a token for an empty label", () => {
    const resolver = createPartyFilterResolver(readyConfig(), "renewals");
    expect(resolver.tokenFor("owner", "")).toBeNull();
    for (const bad of ["", "p1_", "p1_short", `p2_${"a".repeat(43)}`, "owner alpha"]) {
      expect(resolver.matches(bad, "owner", ["owner alpha"])).toBe(false);
    }
  });

  it("fails closed when configuration is unavailable", () => {
    const resolver = createPartyFilterResolver({ status: "unavailable" }, "renewals");
    expect(resolver.available).toBe(false);
    expect(resolver.tokenFor("owner", "owner alpha")).toBeNull();
    expect(resolver.matches(`p1_${"a".repeat(43)}`, "owner", ["owner alpha"])).toBe(
      false,
    );
  });
});
