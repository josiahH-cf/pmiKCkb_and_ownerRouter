// Fuzzy join-key derivation for the renewal sheet connector (Phase-1, read-only).
//
// The sheet has no stable IDs: properties join on address strings and the lease lifecycle joins on
// tenant/lease names, both with inconsistent formatting (map §5). This module derives a canonical
// join key per value and scores two keys, but it NEVER auto-merges (design §1.1.4, §3.4): a strong
// match is a *candidate* a human can accept; anything ambiguous routes to review; anything weak is
// rejected. Pure and deterministic; no I/O, no external system.

import type { NormalizedConfidence } from "@/lib/lease-renewal/normalized-value";

export type JoinKind = "address" | "name";

export interface JoinKey {
  raw: string;
  key: string;
  tokens: string[];
  confidence: NormalizedConfidence;
}

export type JoinStatus = "match" | "ambiguous" | "no_match";

export interface JoinProposal {
  kind: JoinKind;
  left: JoinKey;
  right: JoinKey;
  /** Token Jaccard similarity in [0, 1]. */
  score: number;
  status: JoinStatus;
  /** Invariant: the connector never auto-merges. A match is only ever a candidate. */
  autoMerge: false;
  recommendation: "use_as_candidate" | "send_to_review" | "reject";
}

export const JOIN_MATCH_THRESHOLD = 0.85;
export const JOIN_AMBIGUOUS_THRESHOLD = 0.4;

// Street-suffix and unit-designator canonicalization so "Ln" / "Lane" / "Ln." collapse to one key.
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  ln: "lane",
  st: "street",
  ave: "avenue",
  av: "avenue",
  rd: "road",
  dr: "drive",
  blvd: "boulevard",
  ct: "court",
  cir: "circle",
  pl: "place",
  ter: "terrace",
  apt: "unit",
  ste: "unit",
  unit: "unit",
};

function tokenize(key: string): string[] {
  return key.split(" ").filter((token) => token !== "");
}

/** Canonicalize an address string into a join key (deterministic). */
export function deriveAddressKey(raw: string): JoinKey {
  const normalized = raw
    .toLowerCase()
    .replace(/#/g, " unit ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const key = tokenize(normalized)
    .map((token) => ADDRESS_ABBREVIATIONS[token] ?? token)
    .join(" ");
  return { raw, key, tokens: tokenize(key), confidence: "Verified" };
}

/** Canonicalize a person/lease name into a join key, reordering the "LAST, FIRST" form. */
export function deriveNameKey(raw: string): JoinKey {
  let working = raw.trim();
  const comma = working.indexOf(",");
  if (comma !== -1) {
    const last = working.slice(0, comma);
    const rest = working.slice(comma + 1);
    working = `${rest} ${last}`;
  }
  const key = working
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Names are inherently unreliable to match (map §5), so never better than Likely.
  return { raw, key, tokens: tokenize(key), confidence: "Likely" };
}

export function deriveJoinKey(raw: string, kind: JoinKind): JoinKey {
  return kind === "address" ? deriveAddressKey(raw) : deriveNameKey(raw);
}

/** Token Jaccard similarity. Empty-vs-empty is 0 (nothing to join on). */
export function joinScore(a: JoinKey, b: JoinKey): number {
  const setA = new Set(a.tokens);
  const setB = new Set(b.tokens);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function classify(score: number): {
  status: JoinStatus;
  recommendation: JoinProposal["recommendation"];
} {
  if (score >= JOIN_MATCH_THRESHOLD)
    return { status: "match", recommendation: "use_as_candidate" };
  if (score >= JOIN_AMBIGUOUS_THRESHOLD)
    return { status: "ambiguous", recommendation: "send_to_review" };
  return { status: "no_match", recommendation: "reject" };
}

/**
 * Propose (never execute) a join between two raw values of the same kind. Always returns
 * autoMerge: false — a "match" is a candidate for a human to accept, an "ambiguous" routes to
 * review, and a "no_match" is rejected.
 */
export function proposeJoin(
  leftRaw: string,
  rightRaw: string,
  kind: JoinKind,
): JoinProposal {
  const left = deriveJoinKey(leftRaw, kind);
  const right = deriveJoinKey(rightRaw, kind);
  const score = joinScore(left, right);
  const { status, recommendation } = classify(score);
  return { kind, left, right, score, status, autoMerge: false, recommendation };
}
