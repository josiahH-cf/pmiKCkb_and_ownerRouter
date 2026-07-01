// Read-only location→unit matcher for Maintenance Work Order Intake (M-4, owner 2026-07-01: build the
// matcher FIRST, before any work-order create, so unit confidence is real — not user-typed).
//
// COMPOSES the verified lease-renewal matching spine (deriveAddressKey + joinScore + the join
// thresholds) rather than inventing scoring. Emits the already-fixed MaintenanceUnitMatch contract, so
// buildWorkOrderDraft needs zero change — its "Needs Review" blocker fires automatically for a
// low-confidence match, and a null match drives its "Match the location to a unit." blocker.
//
// GUARDRAILS (binding): read-only (writes nothing); human-overridable (returns the full ordered
// candidate list, the top match is only a SUGGESTION); never blocks (a no-match returns null and defers
// to the human, it does not throw); never invents a unit (a candidate whose source row lacked an
// address carries a `Needs Verification:` label, never a fabricated one); FUZZY NEVER EARNS "Verified"
// (only a structured unit id present verbatim in the location does — a fuzzy address match caps at
// "Likely", mirroring how the renewal join caps names). Pure + deterministic: no I/O, no Date.now().

import {
  JOIN_AMBIGUOUS_THRESHOLD,
  JOIN_MATCH_THRESHOLD,
  deriveAddressKey,
  joinScore,
} from "@/lib/lease-renewal/join";
import type {
  MaintenanceUnitMatch,
  UnitMatchConfidence,
} from "@/lib/maintenance/work-order-draft";

/** A unit the location could resolve to. `label` is a human-facing address, or a Needs-Verification marker. */
export interface UnitCandidate {
  unitId: string;
  label: string;
}

export interface ScoredUnitCandidate {
  unitId: string;
  label: string;
  /** 1 for an exact unit-id hit, else the token-Jaccard address score in [0, 1]. */
  score: number;
  confidence: UnitMatchConfidence;
}

export interface UnitMatchResult {
  /** The single best suggestion (a human may override with any candidate), or null when nothing matches. */
  match: MaintenanceUnitMatch | null;
  /** Every candidate scored + ordered best-first, for human override. Never auto-merges. */
  candidates: ScoredUnitCandidate[];
  /** Invariant, surfaced so a caller cannot treat the suggestion as an executed assignment. */
  autoMerge: false;
}

/** The `Needs Verification:` marker used when a source row carried no usable unit address. */
export const UNIT_ADDRESS_UNVERIFIED = "Needs Verification: unit address";

// A structured id (e.g. "unit:456") present verbatim in the location is a definitive reference and the
// ONLY way to earn "Verified". Bare numeric ids are too collision-prone with street numbers, so an
// exact-id hit requires a colon-structured, sufficiently long id matched as a whole token.
function hasExactId(location: string, unitId: string): boolean {
  const id = unitId.trim().toLowerCase();
  if (id.length < 4 || !id.includes(":")) return false;
  const tokens = location.toLowerCase().split(/[^a-z0-9:]+/);
  return tokens.includes(id);
}

function fuzzyConfidence(score: number): UnitMatchConfidence {
  if (score >= JOIN_MATCH_THRESHOLD) return "Likely";
  return "Needs Review";
}

/**
 * Match a free-text location to the best unit candidate. Two tiers: (1) a structured unit id present
 * verbatim in the location → "Verified" (unique); (2) fuzzy address scoring via the renewal join spine,
 * capped at "Likely" for a unique top over the match threshold, "Needs Review" for an ambiguous or tied
 * top, and no match below the ambiguous threshold. Deterministic; never guesses between tied candidates.
 */
export function matchLocationToUnit(
  location: string,
  candidates: readonly UnitCandidate[],
): UnitMatchResult {
  const locationKey = deriveAddressKey(location);

  const exactHits = candidates.filter((candidate) =>
    hasExactId(location, candidate.unitId),
  );

  const scored: ScoredUnitCandidate[] = candidates
    .map((candidate) => {
      const isExact = exactHits.some((hit) => hit.unitId === candidate.unitId);
      const score = isExact
        ? 1
        : joinScore(locationKey, deriveAddressKey(candidate.label));
      return {
        unitId: candidate.unitId,
        label: candidate.label,
        score,
        confidence: isExact ? ("Verified" as const) : fuzzyConfidence(score),
      };
    })
    .sort((a, b) => b.score - a.score || a.unitId.localeCompare(b.unitId));

  const match = pickMatch(scored, exactHits.length);

  return { match, candidates: scored, autoMerge: false };
}

function pickMatch(
  scored: readonly ScoredUnitCandidate[],
  exactHitCount: number,
): MaintenanceUnitMatch | null {
  const top = scored[0];
  if (!top) return null;

  // A single verbatim unit-id reference is definitive; more than one is ambiguous → route to review.
  if (exactHitCount === 1 && top.confidence === "Verified") {
    return { unitId: top.unitId, label: top.label, confidence: "Verified" };
  }
  if (exactHitCount > 1) {
    return { unitId: top.unitId, label: top.label, confidence: "Needs Review" };
  }

  const tiedAtTop =
    scored.filter((candidate) => candidate.score === top.score).length > 1;

  if (top.score >= JOIN_MATCH_THRESHOLD && !tiedAtTop) {
    return { unitId: top.unitId, label: top.label, confidence: "Likely" };
  }
  if (top.score >= JOIN_AMBIGUOUS_THRESHOLD) {
    // Best-but-ambiguous: surface the top as a low-confidence suggestion the human must confirm.
    return { unitId: top.unitId, label: top.label, confidence: "Needs Review" };
  }
  return null;
}

// Alternate source-key lists for the RentVine export unit sub-object. The live unit shape is UNVERIFIED
// (only exercised by a synthetic fixture today), so — like the lease field map — this reads
// first-present-key-wins and, when the address is absent, emits a Needs-Verification label rather than a
// fabricated one. Confirm the live keys with `npm run smoke:rentvine-read -- --live` before trusting labels.
export const UNIT_ID_KEYS = ["unitID", "unitId", "id"] as const;
export const UNIT_ADDRESS_KEYS = [
  "streetName",
  "address",
  "address1",
  "addressLine1",
  "street",
  "name",
] as const;

function firstPresentString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/**
 * Derive read-only unit candidates from RentVine /leases/export rows (each carries a `unit` sub-object).
 * Rows with no resolvable unit id are skipped + counted (a unit with no id cannot be assigned). A unit
 * with no resolvable address gets a `Needs Verification:` label — never an invented address. Pure.
 */
export function deriveUnitCandidatesFromExport(
  rows: readonly Record<string, unknown>[],
): {
  candidates: UnitCandidate[];
  skipped: number;
} {
  const candidates: UnitCandidate[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const row of rows) {
    const unit = (row.unit && typeof row.unit === "object" ? row.unit : {}) as Record<
      string,
      unknown
    >;
    const rawId = firstPresentString(unit, UNIT_ID_KEYS);
    if (!rawId) {
      skipped += 1;
      continue;
    }

    const unitId = `unit:${rawId}`;
    if (seen.has(unitId)) continue;
    seen.add(unitId);

    const address = firstPresentString(unit, UNIT_ADDRESS_KEYS);
    candidates.push({ unitId, label: address ?? UNIT_ADDRESS_UNVERIFIED });
  }

  return { candidates, skipped };
}
