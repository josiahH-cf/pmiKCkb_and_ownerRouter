// S159 (R-S159-11): the ONE reviewed place that states which operating-Sheet switch value each
// release role must carry. Deploy, preflight, candidate assurance, promotion, observation and
// recovery all read it from here; none of them takes the value from a command-line flag.
//
//   candidate, promoted           -> REVIEWED_CANDIDATE_SHEET_WRITEBACK
//   predecessor, recovery_target  -> the captured predecessor's ACTUAL value, never rewritten
//
// Changing REVIEWED_CANDIDATE_SHEET_WRITEBACK is a reviewed code change that ships through the same
// release gates as any other. The switch only fronts the two exact Action Registry keys
// (google_sheets.renewal_checklist.row_append and field_update); the deploy script's coupling check
// still refuses a true value while either key is closed, and no retired key is opened by it.

/** Must match lib/lease-renewal/sheet-writeback-policy.ts. */
export const SHEET_WRITEBACK_FLAG = "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";

/** The value the candidate and the promoted revision must carry, as an exact env string. */
export const REVIEWED_CANDIDATE_SHEET_WRITEBACK = "true";

export const SHEET_WRITEBACK_ROLES = Object.freeze([
  "candidate",
  "promoted",
  "predecessor",
  "recovery_target",
]);

/** Only the two exact strings are evidence. "TRUE", " true ", "1" and an absent value are not. */
export function isExactSheetWritebackValue(value) {
  return value === "true" || value === "false";
}

/**
 * The reviewed expected value for one release role. The predecessor and its recovery target have
 * no reviewed constant: their expectation is the captured predecessor's actual value, and missing
 * or non-exact evidence refuses instead of defaulting to either value.
 */
export function expectedSheetWriteback(role, { predecessorActual } = {}) {
  if (role === "candidate" || role === "promoted")
    return REVIEWED_CANDIDATE_SHEET_WRITEBACK;
  if (role === "predecessor" || role === "recovery_target") {
    if (!isExactSheetWritebackValue(predecessorActual))
      throw new Error("predecessor_sheet_writeback_evidence_required");
    return predecessorActual;
  }
  throw new Error("sheet_writeback_role_invalid");
}

/**
 * Read the switch from a Cloud Run v2 Revision resource. Returns "true" or "false" only when every
 * container carries exactly one plaintext entry with an exact value and all containers agree;
 * anything else (absent, duplicated, secret-backed, non-exact, disagreeing, malformed) is null.
 */
export function readRevisionSheetWriteback(revision) {
  if (
    !revision ||
    typeof revision !== "object" ||
    !Array.isArray(revision.containers) ||
    revision.containers.length === 0
  )
    return null;
  let observed = null;
  for (const container of revision.containers) {
    if (!container || typeof container !== "object") return null;
    const env = container.env ?? [];
    if (!Array.isArray(env)) return null;
    const entries = env.filter((entry) => entry?.name === SHEET_WRITEBACK_FLAG);
    if (
      entries.length !== 1 ||
      entries[0].valueSource !== undefined ||
      !isExactSheetWritebackValue(entries[0].value)
    )
      return null;
    if (observed !== null && observed !== entries[0].value) return null;
    observed = entries[0].value;
  }
  return observed;
}

/** True only when the revision's exact value is readable and equals the exact expected value. */
export function revisionCarriesSheetWriteback(revision, expected) {
  return (
    isExactSheetWritebackValue(expected) &&
    readRevisionSheetWriteback(revision) === expected
  );
}
