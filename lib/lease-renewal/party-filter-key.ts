// S82/S196: opaque, Space-bound person filters. New links use verified source contact IDs.
// Legacy label tokens remain usable only when the current projection resolves one real person.
//
// A desk URL carries an opaque HMAC token, never a name or raw contact ID. The production resolver
// accepts only contacts in the current authorized source projection. Tokens are view state, never
// authentication or permission evidence. Key material and source labels are never logged.

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
  tokenFor(
    partyKind: PartyKind,
    normalizedLabel: string,
    sourceId?: string,
  ): string | null;
  /** Active token for an unambiguous current or compatible historical token. */
  canonicalTokenFor(partyKind: PartyKind, token: string): string | null;
  /** True when the URL token resolves to any of this row's present parties (active or previous key). */
  matches(
    token: string,
    partyKind: PartyKind,
    normalizedLabels: readonly string[],
    sourceIds?: readonly string[],
  ): boolean;
  /** True when the token resolves against at least one party in the current authorized projection. */
  resolves(
    token: string,
    partyKind: PartyKind,
    presentNormalizedLabels: readonly string[],
    sourceIds?: readonly string[],
  ): boolean;
}

const UNAVAILABLE_RESOLVER: PartyFilterResolver = {
  available: false,
  tokenFor: () => null,
  canonicalTokenFor: () => null,
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
export interface PartyFilterMember {
  readonly partyKind: PartyKind;
  readonly normalizedLabel: string;
  /** Verified RentVine contact ID. Blank records an unresolved source identity. */
  readonly sourceId: string;
}

function identityResolver(
  config: Extract<PartyFilterKeyConfig, { status: "ready" }>,
  spaceId: string,
  members: readonly PartyFilterMember[],
): PartyFilterResolver {
  const byLabel = new Map<string, Set<string>>();
  const byIdentity = new Map<string, Set<string>>();
  for (const m of members) {
    if (!m.normalizedLabel) continue;
    const id = /^[1-9]\d{0,9}$/.test(m.sourceId) ? m.sourceId : "";
    const labelKey = `${m.partyKind}:${m.normalizedLabel}`;
    const ids = byLabel.get(labelKey) ?? new Set<string>();
    ids.add(id);
    byLabel.set(labelKey, ids);
    if (id) {
      const key = `${m.partyKind}:${id}`;
      const labels = byIdentity.get(key) ?? new Set<string>();
      labels.add(m.normalizedLabel);
      byIdentity.set(key, labels);
    }
  }
  const derive = (key: Buffer, kind: PartyKind, sourceId: string) =>
    `p2_${createHmac("sha256", key)
      .update(
        JSON.stringify({
          v: "renewal-party-filter-key/v2",
          space_id: spaceId,
          party_kind: kind,
          source_contact_id: sourceId,
        }),
        "utf8",
      )
      .digest("base64url")}`;
  // Request-local indexes only: no source or permission decision survives another source load.
  const active = new Map<string, string>();
  const tokens = new Map<string, string>();
  const keys = [config.activeKey, ...(config.previousKey ? [config.previousKey] : [])];
  for (const identity of byIdentity.keys()) {
    const split = identity.indexOf(":");
    const kind = identity.slice(0, split) as PartyKind,
      id = identity.slice(split + 1);
    active.set(identity, derive(config.activeKey, kind, id));
    for (const key of keys) tokens.set(derive(key, kind, id), identity);
  }
  // A previous name token must not select multiple source people, including an unresolved one.
  for (const [labelKey, ids] of byLabel) {
    if (ids.size !== 1 || ids.has("")) continue;
    const split = labelKey.indexOf(":");
    const kind = labelKey.slice(0, split) as PartyKind,
      label = labelKey.slice(split + 1);
    const identity = `${kind}:${[...ids][0]}`;
    for (const key of keys)
      tokens.set(
        derivePartyFilterToken(key, { spaceId, partyKind: kind, normalizedLabel: label }),
        identity,
      );
  }
  const resolve = (kind: PartyKind, token: string) => {
    if (!PARTY_FILTER_TOKEN_PATTERN.test(token)) return null;
    const identity = tokens.get(token);
    return identity?.startsWith(`${kind}:`) ? identity : null;
  };
  const matches = (
    token: string,
    kind: PartyKind,
    _labels: readonly string[],
    sourceIds: readonly string[] = [],
  ) => {
    const identity = resolve(kind, token);
    return identity !== null && sourceIds.includes(identity.slice(kind.length + 1));
  };
  return {
    available: true,
    tokenFor(kind, label, sourceId) {
      const ids = byLabel.get(`${kind}:${label}`);
      const id = sourceId === undefined && ids?.size === 1 ? [...ids][0] : sourceId;
      return id && byIdentity.get(`${kind}:${id}`)?.has(label)
        ? (active.get(`${kind}:${id}`) ?? null)
        : null;
    },
    canonicalTokenFor(kind, token) {
      const identity = resolve(kind, token);
      return identity ? (active.get(identity) ?? null) : null;
    },
    matches,
    resolves: matches,
  };
}

export function createPartyFilterResolver(
  config: PartyFilterKeyConfig,
  spaceId: string,
  members?: readonly PartyFilterMember[],
): PartyFilterResolver {
  if (config.status !== "ready") return UNAVAILABLE_RESOLVER;
  if (members !== undefined) return identityResolver(config, spaceId, members);
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
    canonicalTokenFor: () => null,
    matches,
    resolves: matches,
  };
}
