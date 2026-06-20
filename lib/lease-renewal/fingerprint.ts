// Content-keyed tab fingerprinting for the renewal sheet connector (Phase-1, read-only).
//
// The export flattens tabs into back-to-back tables with the tab names dropped and single logical
// tabs fractured across sub-tables (docs/products/lease-renewal-spreadsheet-map.md §1). So a tab's
// identity must be inferred from its *content* — a header signature — never from position. This
// module is a pure matcher: given a grid it returns the best-matching known tab or UNRECOGNIZED,
// and never guesses below the confidence threshold (map §8: "treat unmapped columns as MURKY →
// surface, don't guess"). It performs no I/O and reaches no external system.

import type { RawGrid } from "@/lib/lease-renewal/sheet-types";

export const UNRECOGNIZED_TAB = "UNRECOGNIZED" as const;

/** Fraction of a tab's signature phrases that must be present for a confident match. */
export const FINGERPRINT_MATCH_THRESHOLD = 0.5;

export interface KnownRenewalTab {
  name: string;
  /** Inferred logical tab number from the semantic map §1. */
  tabNumber: number;
  /** Tabs 4 & 7 carry plaintext credentials and must be hard-excluded by the connector. */
  credentialBearing: boolean;
  /**
   * Distinctive, already-normalized header phrases for this tab. Chosen to avoid overlap with
   * other tabs so a partial header drift still clears the threshold without false positives.
   */
  signature: readonly string[];
}

export interface FingerprintResult {
  /** A known tab name, or UNRECOGNIZED when nothing clears the threshold (or it is ambiguous). */
  tab: string;
  tabNumber: number | null;
  credentialBearing: boolean;
  /** Best signature-match ratio in [0, 1]. */
  score: number;
  /** Which signature phrases were found, for explainability. */
  matchedSignals: string[];
}

// Registry of the tabs the connector recognizes. Signatures use verbatim header phrases from the
// sanitized semantic map §2, normalized the same way candidate cells are.
export const KNOWN_RENEWAL_TABS: readonly KnownRenewalTab[] = [
  {
    name: "Move-In Checklist",
    tabNumber: 1,
    credentialBearing: false,
    signature: [
      "move in date",
      "have we collected the processing fee",
      "have we received certified funds",
    ],
  },
  {
    name: "Move-Out Checklist",
    tabNumber: 2,
    credentialBearing: false,
    signature: [
      "scheduled move out date",
      "have they put in their notice",
      "deposit disposition sent",
      "everything finalized",
    ],
  },
  {
    name: "Renewals",
    tabNumber: 3,
    credentialBearing: false,
    signature: [
      "renewal date",
      "have we confirmed pricing with the owner",
      "is this renewal completed",
      "current rent",
      "market value",
    ],
  },
  {
    name: "PadSplit WiFi",
    tabNumber: 4,
    credentialBearing: true,
    signature: ["wifi name", "wifi password", "garage spot", "og member"],
  },
  {
    name: "Platform Logins",
    tabNumber: 7,
    credentialBearing: true,
    signature: ["platform", "username", "password", "pin"],
  },
  {
    name: "Inspection Tracker",
    tabNumber: 17,
    credentialBearing: false,
    signature: ["2024 inspections", "last inspection", "next inspection", "lease start"],
  },
  {
    name: "Property Attributes",
    tabNumber: 18,
    credentialBearing: false,
    signature: [
      "updated to kwickset smart locks",
      "utilities needed",
      "lawn care",
      "appliances provided",
    ],
  },
];

/** Lowercase, strip non-alphanumerics to spaces, collapse runs, trim. Deterministic. */
export function normalizeHeaderText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UNRECOGNIZED_RESULT: FingerprintResult = {
  tab: UNRECOGNIZED_TAB,
  tabNumber: null,
  credentialBearing: false,
  score: 0,
  matchedSignals: [],
};

/**
 * Fingerprint a single tab's grid by content. Scans every cell (header position is not assumed),
 * scores each known tab by the fraction of its signature phrases present, and returns the unique
 * best match at or above the threshold. Ties or below-threshold bests return UNRECOGNIZED.
 */
export function fingerprintTab(grid: RawGrid): FingerprintResult {
  const cellSet = new Set<string>();
  for (const row of grid) {
    for (const cell of row) {
      const normalized = normalizeHeaderText(cell);
      if (normalized !== "") cellSet.add(normalized);
    }
  }
  if (cellSet.size === 0) return UNRECOGNIZED_RESULT;

  const scored = KNOWN_RENEWAL_TABS.map((tab) => {
    const matchedSignals = tab.signature.filter((phrase) => cellSet.has(phrase));
    return {
      tab,
      matchedSignals,
      score: matchedSignals.length / tab.signature.length,
    };
  });

  let best = scored[0];
  let bestIsUnique = true;
  for (const candidate of scored.slice(1)) {
    if (candidate.score > best.score) {
      best = candidate;
      bestIsUnique = true;
    } else if (candidate.score === best.score) {
      bestIsUnique = false;
    }
  }

  if (best.score < FINGERPRINT_MATCH_THRESHOLD || !bestIsUnique) {
    return UNRECOGNIZED_RESULT;
  }

  return {
    tab: best.tab.name,
    tabNumber: best.tab.tabNumber,
    credentialBearing: best.tab.credentialBearing,
    score: best.score,
    matchedSignals: best.matchedSignals,
  };
}
