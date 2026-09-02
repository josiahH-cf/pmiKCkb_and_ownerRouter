// S82 `renewal-party-filter-key/v1` — server-issued opaque owner/tenant filter tokens.
//
// A v2 desk URL never carries a displayed party name. Each owner/tenant shortcut applies an HMAC
// token derived from the party's existing normalized label under a Secret Manager-bound key. The
// parser accepts a token only when it resolves against a party already present in the current
// authorized projection, so a token is never an identity lookup or authority signal. Key material
// and normalized labels are never logged and never leave this module's return values.

import { createHmac, timingSafeEqual } from "node:crypto";

import { PARTY_FILTER_TOKEN_PATTERN } from "@/lib/lease-renewal/desk-query-v2";

export const PARTY_FILTER_KEY_VERSION = "renewal-party-filter-key/v1";
export { PARTY_FILTER_TOKEN_PATTERN };

const KEY_ENV = "RENEWAL_DESK_PARTY_FILTER_KEY";
const PREVIOUS_KEY_ENV = "RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY";
const CANONICAL_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type PartyKind = "owner" | "tenant";

export type PartyFilterKeyConfig =
  | { status: "ready"; activeKey: Buffer; previousKey: Buffer | null }
  | { status: "unavailable" };

function decodeCanonicalKey(value: string | undefined): Buffer | null | "invalid" {
  if (value === undefined || value === "") return null;
  // Canonical unpadded base64url for exactly 32 random bytes is exactly 43 characters whose final
  // character re-encodes byte-identically (no truncated-bit aliasing).
  if (!CANONICAL_KEY_PATTERN.test(value)) return "invalid";
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32) return "invalid";
  if (bytes.toString("base64url") !== value) return "invalid";
  return bytes;
}

/**
 * Read the party-filter key binding. Any malformed, non-canonical, duplicate, or missing-active
 * configuration fails the whole feature closed; the previous key is rotation-only and optional.
 */
export function readPartyFilterKeyConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PartyFilterKeyConfig {
  const active = decodeCanonicalKey(env[KEY_ENV]);
  if (active === null || active === "invalid") return { status: "unavailable" };
  const previous = decodeCanonicalKey(env[PREVIOUS_KEY_ENV]);
  if (previous === "invalid") return { status: "unavailable" };
  if (previous && timingSafeEqual(active, previous)) return { status: "unavailable" };
  return { status: "ready", activeKey: active, previousKey: previous };
}

export interface PartyFilterDerivationInput {
  readonly spaceId: string;
  readonly partyKind: PartyKind;
  readonly normalizedLabel: string;
}

/**
 * Derive one token: literal `p1_` plus unpadded base64url of all 32 HMAC-SHA-256 digest bytes over
 * the UTF-8 ECMAScript `JSON.stringify` of the fixed-key-order derivation object.
 */
export function derivePartyFilterToken(
  key: Buffer,
  input: PartyFilterDerivationInput,
): string {
  const canonical = JSON.stringify({
    v: PARTY_FILTER_KEY_VERSION,
    space_id: input.spaceId,
    party_kind: input.partyKind,
    normalized_label: input.normalizedLabel,
  });
  const digest = createHmac("sha256", key).update(canonical, "utf8").digest();
  return `p1_${digest.toString("base64url")}`;
}

export interface PartyFilterResolver {
  readonly available: boolean;
  /** Active-key token for one present party; used to build shortcut URLs. */
  tokenFor(partyKind: PartyKind, normalizedLabel: string): string | null;
  /** True when the URL token resolves to any of this row's present parties (active or previous key). */
  matches(
    token: string,
    partyKind: PartyKind,
    normalizedLabels: readonly string[],
  ): boolean;
  /** True when the token resolves against at least one party in the current authorized projection. */
  resolves(
    token: string,
    partyKind: PartyKind,
    presentNormalizedLabels: readonly string[],
  ): boolean;
}

const UNAVAILABLE_RESOLVER: PartyFilterResolver = {
  available: false,
  tokenFor: () => null,
  matches: () => false,
  resolves: () => false,
};

function tokenEquals(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(candidate, "utf8");
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

/**
 * Build the per-request resolver for one Space. It exposes only derived tokens and membership
 * answers; the key never leaves the closure and no label is echoed back.
 */
export function createPartyFilterResolver(
  config: PartyFilterKeyConfig,
  spaceId: string,
): PartyFilterResolver {
  if (config.status !== "ready") return UNAVAILABLE_RESOLVER;
  const { activeKey, previousKey } = config;
  const derive = (key: Buffer, partyKind: PartyKind, normalizedLabel: string) =>
    derivePartyFilterToken(key, { spaceId, partyKind, normalizedLabel });

  const matches = (
    token: string,
    partyKind: PartyKind,
    normalizedLabels: readonly string[],
  ): boolean => {
    if (!PARTY_FILTER_TOKEN_PATTERN.test(token)) return false;
    return normalizedLabels.some(
      (label) =>
        label !== "" &&
        (tokenEquals(derive(activeKey, partyKind, label), token) ||
          (previousKey !== null &&
            tokenEquals(derive(previousKey, partyKind, label), token))),
    );
  };

  return {
    available: true,
    tokenFor: (partyKind, normalizedLabel) =>
      normalizedLabel === "" ? null : derive(activeKey, partyKind, normalizedLabel),
    matches,
    resolves: matches,
  };
}
