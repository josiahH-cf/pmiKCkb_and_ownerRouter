// Server-only: a shared unit type-ahead index for maintenance (slice 2a). It wraps the already-approved
// read-only RentVine /leases/export read (loadLiveUnitCandidates) in a ~10-minute in-process TTL cache,
// mirroring lib/connections/verification.ts, so the type-ahead never fans out a live read per keystroke.
// The whole outcome (ok or failure) is cached for the TTL. searchUnits is a pure deterministic
// substring/token filter, NOT the fuzzy join matcher and NOT an LLM. Demo-aware: under config.localDemoAuth
// (NODE_ENV-fenced) it short-circuits to synthetic DEMO_UNIT_CANDIDATES so the picker is exercisable with a
// plain `npm run dev`. Read-only; no write, no send, no system-of-record update.

import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import {
  loadLiveUnitCandidates,
  type UnitSourceOutcome,
} from "@/lib/maintenance/live-unit-source";
import type { UnitCandidate } from "@/lib/maintenance/unit-matcher";

/** The RentVine unit list is re-read at most once per this window per process (mirrors VERIFICATION_TTL_MS). */
export const UNIT_INDEX_TTL_MS = 10 * 60 * 1000;

export type UnitIndexOutcome =
  | { status: "ok"; candidates: UnitCandidate[] }
  | { status: "not_configured" | "account_mismatch" | "auth_error" | "read_error" };

/** Synthetic candidates served under localDemoAuth so the type-ahead works with a plain `npm run dev`. */
export const DEMO_UNIT_CANDIDATES: readonly UnitCandidate[] = [
  { unitId: "unit:demo-100", label: "100 Birchwood Ln Unit A" },
  { unitId: "unit:demo-220", label: "2200 Elmgrove Ave Unit 4" },
  { unitId: "unit:demo-512", label: "512 Rosewood Ct" },
  { unitId: "unit:demo-88", label: "88 Maple Terrace Unit 12" },
];

/** Default results returned by the type-ahead search (keeps the suggestion list short). */
const DEFAULT_SEARCH_LIMIT = 8;

interface UnitIndexDeps {
  /** Live loader (default reads process.env RentVine config); injected in tests to avoid module mocking. */
  load: () => Promise<UnitSourceOutcome>;
  /** Only localDemoAuth is read; injected in tests to avoid module mocking. */
  config: Pick<ServerConfig, "localDemoAuth">;
  now: number;
}

let cache: { outcome: UnitIndexOutcome; expiresAt: number } | null = null;

/** Test seam: drop the in-process cache. */
export function clearUnitIndexCache(): void {
  cache = null;
}

/**
 * The cached unit index, refreshed at most once per UNIT_INDEX_TTL_MS per process. Caches the WHOLE
 * outcome (ok or failure) so a transient RentVine failure is not retried on every keystroke. Under
 * localDemoAuth it short-circuits to synthetic candidates (free + deterministic, never cached, never a
 * network read). Never throws — a failed read surfaces as a discriminated status.
 */
export async function getUnitIndex(
  deps: Partial<UnitIndexDeps> = {},
): Promise<UnitIndexOutcome> {
  const config = deps.config ?? readServerConfig();
  if (config.localDemoAuth) {
    return { status: "ok", candidates: [...DEMO_UNIT_CANDIDATES] };
  }

  const now = deps.now ?? Date.now();
  if (cache && cache.expiresAt > now) return cache.outcome;

  const load = deps.load ?? loadLiveUnitCandidates;
  const source = await load();
  const outcome: UnitIndexOutcome =
    source.status === "ok"
      ? { status: "ok", candidates: source.candidates }
      : { status: source.status };
  cache = { outcome, expiresAt: now + UNIT_INDEX_TTL_MS };
  return outcome;
}

/**
 * Pure deterministic filter over the cached candidates: an empty query returns nothing; otherwise a
 * candidate matches only when EVERY whitespace/punctuation-delimited query token is a substring of its
 * "label unitId" haystack (case-insensitive). Input order is preserved and the result is capped at `limit`.
 * No fuzzy scoring, no LLM.
 */
export function searchUnits(
  candidates: readonly UnitCandidate[],
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): UnitCandidate[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const matches: UnitCandidate[] = [];
  for (const candidate of candidates) {
    const haystack = `${candidate.label} ${candidate.unitId}`.toLowerCase();
    if (tokens.every((token) => haystack.includes(token))) {
      matches.push(candidate);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
