import { createHash } from "node:crypto";

import type { SheetsBatchGetResponse } from "@/lib/google-sheets/sheet-to-grids";
import { composeRentVineAddress } from "@/lib/integrations/rentvine/address";

const PROOF_NOTE_PREFIX = "TEST — PMI KC writeback proof — ";
const RENEWAL_SHEET_TITLE = "Lease Renewal";
const NEEDS_VERIFICATION = "Needs Verification";
const HYPERLINK_FORMULA =
  /^=HYPERLINK\(\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*"((?:[^"\\]|\\.)*)")?\s*\)$/i;
const WORKSPACE_PREFIX = "/lease-renewal/live/desk/lease/";
export const PRODUCTION_RECONCILIATION_DESK_VIEW = "v=2&scope=all";
const MAX_HEADER_SCAN_ROWS = 6;
const CURRENT_RENT_HEADER = "current rent";
const CURRENT_RENT_FIELD = "current_rent";
const LIVE_REVIEW_RUN_ID = "live-review";
const KNOWN_RENT_ADD_ON_SUMS = [0, 11.95, 28, 39.95] as const;
const RENT_TOLERANCE = 0.5;
const WORKSPACE_STEPS = new Set([
  "verify-renewal",
  "owner-decision",
  "tenant-decision",
  "document-packet",
  "signatures-follow-up",
  "compliance-close",
]);
const OVERALL_STATUSES = new Set([
  "needs_verification",
  "blocked",
  "complete",
  "waiting",
  "ready",
  "needs_review",
]);

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export interface IndependentRenewalSourceRow {
  readonly leaseId: string;
  readonly address: string;
  readonly owners: readonly string[];
  readonly tenants: readonly string[];
  readonly endDate: string;
  readonly baseRent: string;
  readonly rentvineSourceUrl: string | null;
}

export interface IndependentSheetProjection {
  readonly leaseUrls: ReadonlyMap<string, string>;
  readonly byLeaseId: ReadonlyMap<string, IndependentSheetLeaseFact>;
  /** A process-memory-only digest used to detect source drift. It must never be serialized. */
  readonly sourceDigest: string;
}

export interface IndependentSheetLeaseFact {
  readonly sourceUrl: string;
  /** Null means the exact linked row exists but Current Rent is blank or non-numeric. */
  readonly currentRent: number | null;
}

export type IndependentRentEvidence =
  | "agree"
  | "add_on_explained"
  | "missing_rentvine"
  | "missing_sheet"
  | "conflict";

export interface IndependentRentExpectation {
  readonly evidence: IndependentRentEvidence;
  readonly rentVerification: "verified" | "needs_verification";
  readonly verifiedByResolutionDiffers: boolean;
  readonly resolvedValue: number | null;
}

export interface IndependentRenderedStatus {
  readonly rentVerification: string | null;
  readonly verifiedByResolutionDiffers: string | null;
  readonly overallStatus: string | null;
  readonly isBlocked: string | null;
  readonly blockerCount: number;
}

export interface IndependentWorkspaceDestinationObservation {
  readonly workspaceAvailable: string | null;
  readonly primaryHrefs: readonly (string | null)[];
  readonly baseRentPhaseHrefs: readonly (string | null)[];
  readonly rentVerificationPhaseHrefs: readonly (string | null)[];
}

export interface IndependentBlockerDestinationObservation {
  readonly href: string | null;
  readonly destinationKind: string | null;
  readonly phaseId: string | null;
  readonly stepId: string | null;
}

export interface IndependentActionDestinationObservation {
  readonly actionKind: string | null;
  readonly destinationKind: string | null;
  readonly stepId: string | null;
  readonly requiredCapability: string | null;
  readonly declaredBlockerCount: string | null;
  readonly blockers: readonly IndependentBlockerDestinationObservation[];
  readonly phaseHrefs: readonly (string | null)[];
  readonly accessHrefs: readonly (string | null)[];
}

type NotesByTab = Readonly<Record<string, readonly (readonly (string | null)[])[]>>;

/**
 * Project the measured RentVine export contract without using the renewal desk mapper or pipeline.
 * `unit.rent` is intentionally the only rent input: a lease-level lookalike cannot replace a
 * missing contractual base rent.
 */
export function projectIndependentRentVineRows(
  exportRows: readonly Record<string, unknown>[],
  sheetLeaseUrls: ReadonlyMap<string, string>,
): IndependentRenewalSourceRow[] {
  return exportRows.map((exportRow) => {
    const lease = asRecord(exportRow.lease) ?? exportRow;
    const unit = asRecord(exportRow.unit);
    const leaseId = firstText(lease, ["leaseID", "leaseId", "id"]) ?? "";
    const address = independentAddress(lease, exportRow);
    const owners = independentOwners(lease, exportRow);
    const tenants = independentTenants(lease);
    const endDate = independentDate(lease.endDate);
    const rent = finiteAmount(unit?.rent);
    return {
      leaseId,
      address: address ?? `Lease ${leaseId || NEEDS_VERIFICATION}`,
      owners: owners.length > 0 ? owners : [NEEDS_VERIFICATION],
      tenants: tenants.length > 0 ? tenants : [NEEDS_VERIFICATION],
      endDate: endDate ?? NEEDS_VERIFICATION,
      baseRent: rent === null ? NEEDS_VERIFICATION : CURRENCY.format(rent),
      rentvineSourceUrl: sheetLeaseUrls.get(leaseId) ?? null,
    };
  });
}

/**
 * Pair the evaluated and FORMULA reads independently. Evaluated values are the source-state layer;
 * FORMULA cells contribute only validated RentVine URLs. Proof rows are excluded by their durable
 * note marker, matching the production data boundary without importing the application pipeline.
 */
export function projectIndependentSheetLinks(
  evaluated: SheetsBatchGetResponse,
  formulas: SheetsBatchGetResponse,
  notesByTab: NotesByTab,
  expectedRentvineHost: string,
): IndependentSheetProjection {
  const evaluatedRange = exactRenewalRange(evaluated, "evaluated");
  const formulaRange = exactRenewalRange(formulas, "FORMULA");
  const evaluatedValues = evaluatedRange.values ?? [];
  const formulaValues = formulaRange.values ?? [];
  if (evaluatedValues.length !== formulaValues.length) {
    throw new Error(
      "The evaluated and FORMULA Sheet reads returned different row counts.",
    );
  }

  const notes = notesByTab[RENEWAL_SHEET_TITLE] ?? [];
  const currentRentColumns: { rowIndex: number; columnIndex: number }[] = [];
  evaluatedValues.slice(0, MAX_HEADER_SCAN_ROWS).forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error("The evaluated Sheet read returned an invalid header row.");
    }
    row.forEach((cell, columnIndex) => {
      if (normalizeHeader(cell) === CURRENT_RENT_HEADER) {
        currentRentColumns.push({ rowIndex, columnIndex });
      }
    });
  });
  if (currentRentColumns.length !== 1) {
    throw new Error(
      "The Sheet must contain exactly one Current Rent header in its first six rows.",
    );
  }
  const [{ rowIndex: headerRowIndex, columnIndex: currentRentColumn }] =
    currentRentColumns;

  const leaseUrls = new Map<string, string>();
  const byLeaseId = new Map<string, IndependentSheetLeaseFact>();
  for (
    let rowIndex = headerRowIndex + 1;
    rowIndex < formulaValues.length;
    rowIndex += 1
  ) {
    if (
      (notes[rowIndex] ?? []).some(
        (note) => typeof note === "string" && note.startsWith(PROOF_NOTE_PREFIX),
      )
    ) {
      continue;
    }
    const formulaRow = formulaValues[rowIndex];
    const evaluatedRow = evaluatedValues[rowIndex];
    if (!Array.isArray(formulaRow) || !Array.isArray(evaluatedRow)) {
      throw new Error("The paired Sheet read returned an invalid row.");
    }
    if (isBlankOrDividerRow(evaluatedRow)) continue;

    const references = leaseReferencesForRow(
      evaluatedRow,
      formulaRow,
      expectedRentvineHost,
    );
    if (references.length !== 1) {
      throw new Error(
        references.length === 0
          ? "A nonblank Sheet data row has no exact RentVine lease link."
          : "A Sheet data row has multiple RentVine lease destinations.",
      );
    }
    const reference = references[0];
    if (byLeaseId.has(reference.leaseId)) {
      throw new Error("The Sheet contains duplicate rows for one RentVine lease.");
    }
    const fact = {
      sourceUrl: reference.url,
      currentRent: finiteAmount(evaluatedRow[currentRentColumn]),
    } satisfies IndependentSheetLeaseFact;
    byLeaseId.set(reference.leaseId, fact);
    leaseUrls.set(reference.leaseId, reference.url);
  }

  return {
    leaseUrls,
    byLeaseId,
    sourceDigest: digestInMemory({
      evaluated: evaluatedValues,
      formulas: formulaValues,
      notes,
      byLeaseId: [...byLeaseId].sort(([left], [right]) => left.localeCompare(right)),
    }),
  };
}

/** A stable in-memory digest over only the direct source projection; callers must not serialize it. */
export function independentSourceDigest(
  rows: readonly IndependentRenewalSourceRow[],
  sheetDigest: string,
): string {
  return digestInMemory({
    rows: [...rows].sort(compareRows),
    sheetDigest,
  });
}

/** Read only the measured RentVine export path used for contractual base rent. */
export function independentRentVineCurrentRent(
  exportRow: Readonly<Record<string, unknown>>,
): number | null {
  return finiteAmount(asRecord(exportRow.unit)?.rent);
}

/**
 * Mirror only the definitive cohort exclusions needed to decide whether a workspace may exist.
 * Missing/off-cycle/out-of-window dates are deliberately not exclusions: operators may need the
 * workspace to resolve those facts.
 */
export function independentWorkspaceExpected(
  exportRow: Readonly<Record<string, unknown>>,
): boolean {
  const lease = asRecord(exportRow.lease) ?? exportRow;
  const leaseId = firstText(lease, ["leaseID", "leaseId", "id"]);
  return leaseId !== null && !hasDefinitiveSkipSignal(lease);
}

/** Exact value-free identity of one live-review current-rent decision. */
export function independentCurrentRentResolutionTriggerKey(leaseId: string): string {
  if (!leaseId.trim()) throw new Error("A current-rent resolution requires a lease id.");
  const recordKey = createHash("sha256")
    .update(`join:lease:${leaseId}`)
    .digest("hex")
    .slice(0, 16);
  return `lease_renewal:reconcile:${LIVE_REVIEW_RUN_ID}:${recordKey}:${CURRENT_RENT_FIELD}`;
}

/**
 * Independently classify the current-rent source facts and the one exact current resolution that may
 * turn a real discrepancy into Verified. Raw resolution records are accepted intentionally so the
 * production runner can query Firestore without importing the application's resolution projector.
 */
export function projectIndependentRentExpectation(input: {
  readonly leaseId: string;
  readonly rentvineCurrentRent: number | null;
  readonly sheetFact: IndependentSheetLeaseFact | null;
  readonly resolutions: readonly Readonly<Record<string, unknown>>[];
}): IndependentRentExpectation {
  const rentvine = finiteAmount(input.rentvineCurrentRent);
  if (rentvine === null || rentvine <= 0) {
    return unresolvedRentExpectation("missing_rentvine");
  }
  const sheet = finiteAmount(input.sheetFact?.currentRent);
  if (sheet === null || sheet <= 0) {
    return unresolvedRentExpectation("missing_sheet");
  }

  const gap = sheet - rentvine;
  const accountedFor =
    gap >= 0 &&
    KNOWN_RENT_ADD_ON_SUMS.some(
      (sum) => Math.abs(gap - sum) <= RENT_TOLERANCE + Number.EPSILON * 10_000,
    );
  if (accountedFor) {
    return {
      evidence: sheet === rentvine ? "agree" : "add_on_explained",
      rentVerification: "verified",
      verifiedByResolutionDiffers: false,
      resolvedValue: null,
    };
  }

  const resolvedValue = independentResolvedCurrentRent(
    input.leaseId,
    rentvine,
    sheet,
    input.resolutions,
  );
  if (resolvedValue !== null) {
    return {
      evidence: "conflict",
      rentVerification: "verified",
      verifiedByResolutionDiffers: resolvedValue !== rentvine,
      resolvedValue,
    };
  }
  return unresolvedRentExpectation("conflict");
}

/** Count only source-derived status contradictions; S72 workflow state is intentionally not copied. */
export function countIndependentStatusMismatches(
  expected: IndependentRentExpectation,
  observed: IndependentRenderedStatus,
): number {
  let mismatches = 0;
  if (observed.rentVerification !== expected.rentVerification) mismatches += 1;
  if (
    observed.verifiedByResolutionDiffers !==
    (expected.verifiedByResolutionDiffers ? "true" : "false")
  ) {
    mismatches += 1;
  }
  if (!observed.overallStatus || !OVERALL_STATUSES.has(observed.overallStatus)) {
    mismatches += 1;
  }
  const sourceBlocks =
    expected.rentVerification === "needs_verification" &&
    (expected.evidence === "missing_rentvine" ||
      expected.evidence === "missing_sheet" ||
      expected.evidence === "conflict");
  if (sourceBlocks) {
    const requiredStatus =
      expected.evidence === "conflict" ? "blocked" : "needs_verification";
    if (observed.overallStatus !== requiredStatus) mismatches += 1;
    if (observed.isBlocked !== "true") mismatches += 1;
    // Every source-derived hold needs at least one causal, clickable blocker. Otherwise a row can
    // say Needs verification without telling the operator what must be resolved.
    if (observed.blockerCount < 1) mismatches += 1;
  } else if (observed.overallStatus && OVERALL_STATUSES.has(observed.overallStatus)) {
    const expectedBlocked = ["blocked", "needs_verification"].includes(
      observed.overallStatus,
    );
    if (observed.isBlocked !== (expectedBlocked ? "true" : "false")) mismatches += 1;
  }
  return mismatches;
}

/**
 * Presence-aware workspace contract for the three destinations every eligible row must expose.
 * Returns a counts-only mismatch total so callers never persist a lease id or source value.
 */
export function countIndependentWorkspaceDestinationMismatches(input: {
  readonly workspaceExpected: boolean;
  readonly leaseId: string;
  readonly origin: string;
  readonly observed: IndependentWorkspaceDestinationObservation;
  readonly expectedDeskView?: string;
}): number {
  const expectedDeskView = input.expectedDeskView ?? PRODUCTION_RECONCILIATION_DESK_VIEW;
  const expectedFlag = input.workspaceExpected ? "true" : "false";
  let mismatches = input.observed.workspaceAvailable === expectedFlag ? 0 : 1;
  const expectedCount = input.workspaceExpected ? 1 : 0;
  for (const hrefs of [
    input.observed.primaryHrefs,
    input.observed.baseRentPhaseHrefs,
    input.observed.rentVerificationPhaseHrefs,
  ]) {
    if (hrefs.length !== expectedCount) mismatches += 1;
  }
  if (!input.workspaceExpected) return mismatches;
  if (
    input.observed.primaryHrefs.length === 1 &&
    !validPrimaryWorkspaceDestination(
      input.observed.primaryHrefs[0],
      input.origin,
      input.leaseId,
      expectedDeskView,
    )
  ) {
    mismatches += 1;
  }
  for (const hrefs of [
    input.observed.baseRentPhaseHrefs,
    input.observed.rentVerificationPhaseHrefs,
  ]) {
    if (
      hrefs.length === 1 &&
      !validPhaseWorkspaceDestination(
        hrefs[0],
        input.origin,
        input.leaseId,
        "verify-renewal",
        expectedDeskView,
      )
    ) {
      mismatches += 1;
    }
  }
  return mismatches;
}

/** Presence and structure checks for blocker, current-action, and access-handoff destinations. */
export function countIndependentActionDestinationMismatches(input: {
  readonly leaseId: string;
  readonly origin: string;
  readonly observed: IndependentActionDestinationObservation;
  /** Set when the caller can independently derive the actor's capability outcome. */
  readonly accessHandoffExpected?: boolean;
  /** Set when source/cohort truth independently requires one exact phase action. */
  readonly expectedStep?: string;
  readonly expectedDeskView?: string;
}): number {
  const { observed } = input;
  const expectedDeskView = input.expectedDeskView ?? PRODUCTION_RECONCILIATION_DESK_VIEW;
  let mismatches = 0;
  const declared = parseNonnegativeCount(observed.declaredBlockerCount);
  if (declared === null || declared !== observed.blockers.length) mismatches += 1;

  if (observed.blockers.length > 0) {
    if (!["blocked", "needs_verification"].includes(observed.actionKind ?? "")) {
      mismatches += 1;
    }
    if (observed.phaseHrefs.length !== 0 || observed.accessHrefs.length !== 0) {
      mismatches += 1;
    }
    for (const blocker of observed.blockers) {
      if (
        blocker.destinationKind !== "workspace_phase" ||
        !blocker.stepId ||
        blocker.stepId !== blocker.phaseId ||
        (input.expectedStep !== undefined && blocker.stepId !== input.expectedStep) ||
        !validPhaseWorkspaceDestination(
          blocker.href,
          input.origin,
          input.leaseId,
          blocker.stepId,
          expectedDeskView,
        )
      ) {
        mismatches += 1;
      }
    }
    return mismatches;
  }

  if (observed.actionKind === "blocked") mismatches += 1;
  if (observed.destinationKind === "none") {
    if (input.expectedStep !== undefined) mismatches += 1;
    if (observed.phaseHrefs.length !== 0 || observed.accessHrefs.length !== 0) {
      mismatches += 1;
    }
    return mismatches;
  }
  if (observed.destinationKind !== "workspace_phase" || !observed.stepId) {
    return mismatches + 1;
  }
  if (input.expectedStep !== undefined && observed.stepId !== input.expectedStep) {
    mismatches += 1;
  }

  const requireAccess = input.accessHandoffExpected;
  if (requireAccess === true) {
    if (observed.phaseHrefs.length !== 0 || observed.accessHrefs.length !== 1) {
      mismatches += 1;
    }
  } else if (requireAccess === false) {
    if (observed.phaseHrefs.length !== 1 || observed.accessHrefs.length !== 0) {
      mismatches += 1;
    }
  } else if (observed.phaseHrefs.length + observed.accessHrefs.length !== 1) {
    mismatches += 1;
  }

  if (
    observed.phaseHrefs.length === 1 &&
    !validPhaseWorkspaceDestination(
      observed.phaseHrefs[0],
      input.origin,
      input.leaseId,
      observed.stepId,
      expectedDeskView,
    )
  ) {
    mismatches += 1;
  }
  if (
    observed.accessHrefs.length === 1 &&
    !validRenewalAccessDestination(
      observed.accessHrefs[0],
      input.origin,
      observed.requiredCapability,
      expectedDeskView,
    )
  ) {
    mismatches += 1;
  }
  return mismatches;
}

export function validPrimaryWorkspaceDestination(
  href: string | null,
  origin: string,
  leaseId: string,
  expectedDeskView: string = PRODUCTION_RECONCILIATION_DESK_VIEW,
): boolean {
  return validWorkspaceDestination(
    href,
    origin,
    leaseId,
    false,
    undefined,
    expectedDeskView,
  );
}

export function validPhaseWorkspaceDestination(
  href: string | null,
  origin: string,
  leaseId: string,
  expectedStep?: string,
  expectedDeskView: string = PRODUCTION_RECONCILIATION_DESK_VIEW,
): boolean {
  return validWorkspaceDestination(
    href,
    origin,
    leaseId,
    true,
    expectedStep,
    expectedDeskView,
  );
}

export function validRenewalRowActionDestination(
  href: string | null,
  origin: string,
  leaseId: string,
): boolean {
  if (validPhaseWorkspaceDestination(href, origin, leaseId)) return true;
  return validRenewalAccessDestination(
    href,
    origin,
    undefined,
    PRODUCTION_RECONCILIATION_DESK_VIEW,
  );
}

export function validRenewalAccessDestination(
  href: string | null,
  origin: string,
  expectedCapability?: string | null,
  expectedDeskView: string = PRODUCTION_RECONCILIATION_DESK_VIEW,
): boolean {
  if (!href) return false;
  let target: URL;
  try {
    target = new URL(href, origin);
  } catch {
    return false;
  }
  if (target.origin !== origin || target.pathname !== "/admin/access" || target.hash) {
    return false;
  }
  if (!hasExactKeys(target.searchParams, ["v", "capability", "space", "return_to"])) {
    return false;
  }
  return (
    target.searchParams.get("v") === "1" &&
    ["edit", "approve"].includes(target.searchParams.get("capability") ?? "") &&
    (expectedCapability === undefined ||
      target.searchParams.get("capability") === expectedCapability) &&
    target.searchParams.get("space") === "renewals" &&
    target.searchParams.get("return_to") ===
      `/lease-renewal/live/desk?${expectedDeskView}`
  );
}

export function validRenderedRentvineSourceDestination(input: {
  readonly href: string | null;
  readonly expectedHref: string | null;
  readonly expectedHost: string;
  readonly leaseId: string;
  readonly target: string | null;
  readonly rel: string | null;
}): boolean {
  // The product contract explicitly permits the in-app comparison fallback when no external link
  // is rendered. When a source link is present, however, it must be the exact independently read
  // Sheet URL with the full external-link safety posture. An unexpected link fails closed.
  if (input.href === null) return true;
  if (input.expectedHref === null) return false;
  const normalized = normalizeRentvineLeaseUrl(input.href, input.expectedHost);
  if (
    !normalized ||
    normalized.leaseId !== input.leaseId ||
    normalized.url !== input.expectedHref ||
    input.target !== "_blank"
  ) {
    return false;
  }
  const rel = new Set((input.rel ?? "").split(/\s+/).filter(Boolean));
  return rel.has("noopener") && rel.has("noreferrer");
}

function unresolvedRentExpectation(
  evidence: Extract<
    IndependentRentEvidence,
    "missing_rentvine" | "missing_sheet" | "conflict"
  >,
): IndependentRentExpectation {
  return {
    evidence,
    rentVerification: "needs_verification",
    verifiedByResolutionDiffers: false,
    resolvedValue: null,
  };
}

function independentResolvedCurrentRent(
  leaseId: string,
  rentvineCurrentRent: number,
  sheetCurrentRent: number,
  resolutions: readonly Readonly<Record<string, unknown>>[],
): number | null {
  const trigger = independentCurrentRentResolutionTriggerKey(leaseId);
  const matches = resolutions.filter((record) => record.source_trigger_key === trigger);
  if (matches.length > 1) {
    throw new Error(
      "The independent resolution read returned duplicate current-rent decisions.",
    );
  }
  const record = matches[0];
  if (!record) return null;
  if (record.run_id !== LIVE_REVIEW_RUN_ID || record.field_key !== CURRENT_RENT_FIELD) {
    throw new Error("The independent current-rent resolution identity is inconsistent.");
  }
  if (record.status === "Open") return null;
  if (record.status === "Dismissed") {
    if (
      record.resolution_kind !== "flag_incorrect" ||
      record.chosen_source !== undefined ||
      record.corrected_value !== undefined ||
      record.proposed_writeback !== undefined
    ) {
      throw new Error(
        "The independent dismissed current-rent resolution has an invalid resolution contract.",
      );
    }
    return null;
  }
  if (record.status !== "Resolved") {
    throw new Error("The independent current-rent resolution has an invalid status.");
  }
  if (
    record.candidate_fingerprint !==
    independentCurrentRentCandidateFingerprint(rentvineCurrentRent, sheetCurrentRent)
  ) {
    return null;
  }

  const proposed = asRecord(record.proposed_writeback);
  if (
    !proposed ||
    proposed.field_key !== CURRENT_RENT_FIELD ||
    proposed.status !== "Queued" ||
    proposed.production_allowed !== false ||
    typeof proposed.value !== "string" ||
    typeof proposed.source_of_value !== "string"
  ) {
    throw new Error(
      "The independent current-rent resolution has an invalid queued proposal contract.",
    );
  }

  let raw: string;
  if (record.resolution_kind === "pick_source") {
    if (
      typeof record.chosen_source !== "string" ||
      record.corrected_value !== undefined
    ) {
      throw new Error(
        "The independent current-rent source-pick resolution has an invalid value contract.",
      );
    }
    const candidates = new Map<string, string>([
      ["rentvine", String(rentvineCurrentRent)],
      ["sheet_tab3", String(sheetCurrentRent)],
    ]);
    const pickedValue = candidates.get(record.chosen_source);
    if (
      pickedValue === undefined ||
      proposed.source_of_value !== record.chosen_source ||
      proposed.value !== pickedValue
    ) {
      throw new Error(
        "The independent current-rent resolution does not match the exact picked candidate.",
      );
    }
    raw = pickedValue;
  } else if (record.resolution_kind === "corrected_value") {
    if (
      typeof record.corrected_value !== "string" ||
      record.corrected_value.trim() === "" ||
      record.chosen_source !== undefined ||
      proposed.source_of_value !== "corrected_value" ||
      proposed.value !== record.corrected_value
    ) {
      throw new Error(
        "The independent current-rent corrected-value resolution has an invalid value contract.",
      );
    }
    raw = record.corrected_value;
  } else {
    throw new Error(
      "The independent current-rent resolution has an invalid resolution kind.",
    );
  }

  const value = strictMoney(raw);
  if (value === null || value <= 0) {
    throw new Error("The independent current-rent resolution has no valid money value.");
  }
  return value;
}

/** Independent duplicate of the versioned application contract; do not import its projector. */
export function independentCurrentRentCandidateFingerprint(
  rentvineCurrentRent: number,
  sheetCurrentRent: number,
): string {
  const facts = [
    { source: "rentvine", value: rentvineCurrentRent },
    { source: "sheet_tab3", value: sheetCurrentRent },
  ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        version: "renewal-source-candidates/v1",
        fieldKey: CURRENT_RENT_FIELD,
        facts,
      }),
    )
    .digest("hex");
  return `rcf1_${digest}`;
}

function strictMoney(value: string): number | null {
  const match = /^\$?\s*((?:\d{1,3}(?:,\d{3})+)|(?:\d+))(?:\.(\d{1,2}))?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const amount = Number(`${match[1].replaceAll(",", "")}.${match[2] ?? "0"}`);
  return Number.isFinite(amount) ? amount : null;
}

function hasDefinitiveSkipSignal(lease: Readonly<Record<string, unknown>>): boolean {
  return (
    firstPresentMatches(lease, ["isMonthToMonth", "monthToMonth", "mtm"], isTruthy) ||
    firstPresentContains(
      lease,
      ["leaseType", "leaseTypeName", "term", "frequency", "leaseTerm", "status"],
      ["month to month", "month-to-month", "monthly", "m2m"],
    ) ||
    firstPresentContains(
      lease,
      ["status", "leaseStatus", "note", "notes", "tags"],
      ["owner authorized", "owner hold", "owner approved", "let renew"],
    ) ||
    firstPresentContains(
      lease,
      ["program", "programName", "leaseType", "leaseTypeName", "tags", "status"],
      ["program", "padsplit", "section 8", "section8", "voucher", "hap"],
    )
  );
}

function firstPresentContains(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  needles: readonly string[],
): boolean {
  return firstPresentMatches(record, keys, (value) => {
    const text = String(value).toLowerCase();
    return needles.some((needle) => text.includes(needle));
  });
}

function firstPresentMatches(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  predicate: (value: unknown) => boolean,
): boolean {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    ) {
      continue;
    }
    return predicate(value);
  }
  return false;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return (
    typeof value === "string" &&
    ["true", "yes", "y", "1"].includes(value.trim().toLowerCase())
  );
}

function leaseReferencesForRow(
  evaluatedRow: readonly unknown[],
  formulaRow: readonly unknown[],
  expectedRentvineHost: string,
): { leaseId: string; url: string }[] {
  const references: { leaseId: string; url: string }[] = [];
  const width = Math.max(evaluatedRow.length, formulaRow.length);
  for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
    const formula = formulaRow[columnIndex];
    const match =
      typeof formula === "string" ? formula.trim().match(HYPERLINK_FORMULA) : null;
    if (match) {
      if (columnIndex >= evaluatedRow.length) {
        throw new Error("A Sheet hyperlink has no aligned evaluated cell.");
      }
      const normalized = normalizeRentvineLeaseUrl(match[1], expectedRentvineHost);
      if (normalized) references.push(normalized);
      // The evaluated representation of a formula is display text, never an independent source
      // destination. Treat the formula/evaluated pair as one cell coordinate.
      continue;
    }
    const cell = evaluatedRow[columnIndex];
    if (typeof cell !== "string" || !/^https?:\/\//i.test(cell.trim())) continue;
    const normalized = normalizeRentvineLeaseUrl(cell.trim(), expectedRentvineHost);
    if (normalized) references.push(normalized);
  }
  return references;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isBlankOrDividerRow(row: readonly unknown[]): boolean {
  return row.every((cell) => {
    const value = String(cell ?? "").trim();
    return value === "" || /^-+$/.test(value) || /^\.+$/.test(value);
  });
}

function validWorkspaceDestination(
  href: string | null,
  origin: string,
  leaseId: string,
  requireStep: boolean,
  expectedStep: string | undefined,
  expectedDeskView: string,
): boolean {
  if (!href || !leaseId) return false;
  let target: URL;
  try {
    target = new URL(href, origin);
  } catch {
    return false;
  }
  if (
    target.origin !== origin ||
    target.pathname !== `${WORKSPACE_PREFIX}${encodeURIComponent(leaseId)}` ||
    target.hash
  ) {
    return false;
  }
  const allowedKeys = requireStep ? ["step", "deskView"] : ["deskView"];
  if (!hasOnlyKeys(target.searchParams, allowedKeys)) return false;
  const step = target.searchParams.get("step");
  if (requireStep ? !step || !WORKSPACE_STEPS.has(step) : step !== null) return false;
  if (expectedStep !== undefined && step !== expectedStep) return false;
  const deskView = target.searchParams.get("deskView");
  return deskView === expectedDeskView;
}

function normalizeRentvineLeaseUrl(
  raw: string,
  expectedHost: string,
): { leaseId: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== expectedHost.toLowerCase() ||
    (url.port !== "" && url.port !== "443") ||
    url.username ||
    url.password
  ) {
    return null;
  }
  const leaseId =
    url.pathname.match(/\/leases?\/([1-9]\d*)/i)?.[1] ??
    url.hash.match(/\/leases?\/([1-9]\d*)/i)?.[1] ??
    [...url.searchParams.entries()].find(
      ([key, value]) => /^lease(?:id)?$/i.test(key) && /^[1-9]\d*$/.test(value),
    )?.[1];
  return leaseId ? { leaseId, url: url.toString() } : null;
}

function exactRenewalRange(
  response: SheetsBatchGetResponse,
  label: string,
): NonNullable<SheetsBatchGetResponse["valueRanges"]>[number] {
  const ranges = response.valueRanges ?? [];
  if (ranges.length !== 1) {
    throw new Error(`The ${label} Sheet read did not return exactly one range.`);
  }
  const rangeTitle = sheetTitleOfRange(ranges[0].range ?? "");
  if (rangeTitle !== RENEWAL_SHEET_TITLE) {
    throw new Error(`The ${label} Sheet read returned an unexpected tab.`);
  }
  return ranges[0];
}

function sheetTitleOfRange(range: string): string {
  const raw = range.split("!", 1)[0].trim();
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  return raw;
}

function independentAddress(
  lease: Record<string, unknown>,
  exportRow: Record<string, unknown>,
): string | null {
  const property = asRecord(lease.property) ?? asRecord(exportRow.property);
  for (const source of [property, lease]) {
    if (!source) continue;
    const composed = composeRentVineAddress(source);
    if (composed) return composed;
    const fallback = firstText(source, ["propertyAddress"]);
    if (fallback) return fallback;
  }
  return null;
}

function independentTenants(lease: Record<string, unknown>): string[] {
  const fromArray = personArray(lease.tenants);
  if (fromArray.length > 0) return fromArray;
  const nested = personName(asRecord(lease.tenant));
  if (nested) return [nested];
  const direct = firstText(lease, [
    "tenantName",
    "primaryTenantName",
    "primaryTenant",
    "leaseName",
  ]);
  return direct ? [direct] : [];
}

function independentOwners(
  lease: Record<string, unknown>,
  exportRow: Record<string, unknown>,
): string[] {
  const portfolio = asRecord(lease.portfolio) ?? asRecord(exportRow.portfolio);
  const property = asRecord(lease.property) ?? asRecord(exportRow.property);
  for (const value of [
    portfolio?.owners,
    property?.owners,
    lease.owners ?? exportRow.owners,
  ]) {
    const names = personArray(value);
    if (names.length > 0) return names;
  }
  for (const value of [
    portfolio?.owner,
    property?.owner,
    lease.owner ?? exportRow.owner,
  ]) {
    const name = personName(asRecord(value));
    if (name) return [name];
  }
  const direct = firstText(lease, ["ownerName", "primaryOwnerName"]);
  return direct ? [direct] : [];
}

function personArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return dedupe(
    value.flatMap((entry) => {
      const name = personName(asRecord(entry));
      return name ? [name] : [];
    }),
  );
}

function personName(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  const direct = firstText(value, ["name", "displayName", "companyName"]);
  if (direct) return direct;
  const combined = [
    firstText(value, ["firstName", "first_name"]),
    firstText(value, ["lastName", "last_name"]),
  ]
    .filter(Boolean)
    .join(" ");
  return combined || null;
}

function firstText(
  value: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return String(candidate);
  }
  return null;
}

function finiteAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function independentDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!us) return null;
  const month = Number(us[1]);
  const day = Number(us[2]);
  let year = Number(us[3]);
  if (us[3].length === 2) year += 2000;
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.toLocaleLowerCase("en-US");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function hasOnlyKeys(params: URLSearchParams, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!allowedSet.has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function hasExactKeys(params: URLSearchParams, expected: readonly string[]): boolean {
  return hasOnlyKeys(params, expected) && expected.every((key) => params.has(key));
}

function parseNonnegativeCount(value: string | null): number | null {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function compareRows(
  left: IndependentRenewalSourceRow,
  right: IndependentRenewalSourceRow,
): number {
  return (
    left.leaseId.localeCompare(right.leaseId) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function digestInMemory(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
