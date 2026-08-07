// S63 verdict logic (AC-S63-10, AC-S63-13). Pure evaluation of the four pass criteria for one
// cohort lease. `not_evaluated` is a first-class outcome carrying its reason: a criterion whose
// inputs are missing must NEVER read as a pass — a missing provider number, a missing Market
// Value, or an unstarted window all surface as `not_evaluated` with the reason spelled out, and
// the overall verdict can only be `pass` when all four criteria individually pass.
//
// Tolerance (owner-decided, Q-TESTSET-TOLERANCE resolved 2026-08-06): the app's provider-derived
// estimate passes criterion 3 when it falls within ±5 percent or ±$50 of the team's own recorded
// Market Value for the lease, whichever tolerance is LARGER. The comparison basis is the Sheet's
// human-entered Market Value for ALL FOUR leases (F-TESTSET-COMPARISON-BASIS: no cohort lease
// carries a negotiated rent; if one closes during the window its agreed rent is recorded as an
// additional comparison, not a substitute).

import type { TestSetBaseline } from "@/lib/firestore/test-set-baseline";

export const TESTSET_TOLERANCE_PCT = 5;
export const TESTSET_TOLERANCE_USD = 50;

export type CriterionStatus = "pass" | "fail" | "not_evaluated";

export interface CriterionOutcome {
  status: CriterionStatus;
  /** Plain-English reason; REQUIRED for every outcome so the report never asserts a bare pass. */
  reason: string;
}

export interface TestSetVerdict {
  criteria: {
    reachability: CriterionOutcome;
    factAccuracy: CriterionOutcome;
    numberAgreement: CriterionOutcome;
    communicationCorrectness: CriterionOutcome;
  };
  /** pass only when all four criteria pass; fail when any fails; incomplete otherwise. */
  overall: "pass" | "fail" | "incomplete";
}

export interface TestSetVerdictInput {
  /** Criterion 1: the lease appeared on the desk with this end date and disposition. */
  reachability: {
    appearedOnDesk: boolean | null;
    endDateMatchesBaseline: boolean | null;
    dispositionCorrect: boolean | null;
  };
  /** Criterion 2: facts matched, or a genuine disagreement was raised rather than swallowed. */
  factAccuracy: {
    /** Field-level disagreements that genuinely exist between the sources (day-zero derived). */
    knownDiscrepancyFields: readonly string[];
    /** Fields for which a discrepancy_raised evidence entry exists. */
    raisedDiscrepancyFields: readonly string[];
    /** True when every checked fact either matched or appears in raisedDiscrepancyFields. */
    factsMatchOrRaised: boolean | null;
  };
  /** Criterion 3: the app's provider-derived estimate vs the team's recorded Market Value. */
  numberAgreement: {
    providerEstimate: number | null;
    /** Why the provider estimate is missing, when it is (e.g. Q-RENTCAST-ACCOUNT-403). */
    providerMissingReason?: string;
    sheetMarketValue: number | null;
    /** A renewal that actually closed during the window; recorded as an ADDITIONAL comparison. */
    agreedRent?: number | null;
  };
  /** Criterion 4: recipients right, channels never mixed, every number attributed. */
  communicationCorrectness: {
    ownerDraftRecipientsCorrect: boolean | null;
    tenantDraftRecipientsCorrect: boolean | null;
    channelsSeparated: boolean | null;
    numbersAttributed: boolean | null;
  };
}

/** The larger of ±5% and ±$50, per the owner-decided tolerance. */
export function numberAgreementTolerance(marketValue: number): number {
  return Math.max((TESTSET_TOLERANCE_PCT / 100) * marketValue, TESTSET_TOLERANCE_USD);
}

function boolCriterion(
  checks: ReadonlyArray<readonly [string, boolean | null]>,
  passReason: string,
): CriterionOutcome {
  const unknown = checks.filter(([, value]) => value === null);
  if (unknown.length > 0) {
    return {
      status: "not_evaluated",
      reason: `Not yet observed: ${unknown.map(([name]) => name).join(", ")}. A missing input never reads as success.`,
    };
  }
  const failed = checks.filter(([, value]) => value === false);
  if (failed.length > 0) {
    return {
      status: "fail",
      reason: `Failed checks: ${failed.map(([name]) => name).join(", ")}.`,
    };
  }
  return { status: "pass", reason: passReason };
}

export function evaluateTestSetVerdict(input: TestSetVerdictInput): TestSetVerdict {
  const reachability = boolCriterion(
    [
      ["appeared on desk", input.reachability.appearedOnDesk],
      ["end date matches baseline", input.reachability.endDateMatchesBaseline],
      ["disposition correct", input.reachability.dispositionCorrect],
    ],
    "The lease appeared on the desk with the correct end date and disposition.",
  );

  const unraised = input.factAccuracy.knownDiscrepancyFields.filter(
    (field) => !input.factAccuracy.raisedDiscrepancyFields.includes(field),
  );
  let factAccuracy: CriterionOutcome;
  if (input.factAccuracy.factsMatchOrRaised === null) {
    factAccuracy = {
      status: "not_evaluated",
      reason:
        "Fact comparison not yet performed. A missing input never reads as success.",
    };
  } else if (unraised.length > 0) {
    factAccuracy = {
      status: "fail",
      reason: `Genuine source disagreement silently accepted (never raised): ${unraised.join(", ")}.`,
    };
  } else if (!input.factAccuracy.factsMatchOrRaised) {
    factAccuracy = {
      status: "fail",
      reason: "A checked fact neither matched its authoritative source nor was raised.",
    };
  } else {
    factAccuracy = {
      status: "pass",
      reason:
        input.factAccuracy.knownDiscrepancyFields.length > 0
          ? `Facts match or were raised as discrepancies (${input.factAccuracy.knownDiscrepancyFields.join(", ")}).`
          : "Every checked fact matches its authoritative source.",
    };
  }

  let numberAgreement: CriterionOutcome;
  const { providerEstimate, sheetMarketValue } = input.numberAgreement;
  if (typeof sheetMarketValue !== "number" || !Number.isFinite(sheetMarketValue)) {
    numberAgreement = {
      status: "not_evaluated",
      reason:
        "No recorded Market Value to compare against. A missing input never reads as success.",
    };
  } else if (typeof providerEstimate !== "number" || !Number.isFinite(providerEstimate)) {
    numberAgreement = {
      status: "not_evaluated",
      reason: `No provider-derived estimate to evaluate${
        input.numberAgreement.providerMissingReason
          ? ` (${input.numberAgreement.providerMissingReason})`
          : ""
      }. A missing input never reads as success.`,
    };
  } else {
    const tolerance = numberAgreementTolerance(sheetMarketValue);
    const delta = Math.abs(providerEstimate - sheetMarketValue);
    const extra =
      typeof input.numberAgreement.agreedRent === "number"
        ? " An agreed rent from a closed renewal is recorded as an additional comparison."
        : "";
    numberAgreement =
      delta <= tolerance
        ? {
            status: "pass",
            reason: `The provider estimate is within the ±${TESTSET_TOLERANCE_PCT}%/±$${TESTSET_TOLERANCE_USD} tolerance (larger applies) of the recorded Market Value.${extra}`,
          }
        : {
            status: "fail",
            reason: `The provider estimate differs from the recorded Market Value by more than the ±${TESTSET_TOLERANCE_PCT}%/±$${TESTSET_TOLERANCE_USD} tolerance.${extra}`,
          };
  }

  const communicationCorrectness = boolCriterion(
    [
      [
        "owner draft recipients",
        input.communicationCorrectness.ownerDraftRecipientsCorrect,
      ],
      [
        "tenant draft recipients",
        input.communicationCorrectness.tenantDraftRecipientsCorrect,
      ],
      ["channel separation", input.communicationCorrectness.channelsSeparated],
      ["number attribution", input.communicationCorrectness.numbersAttributed],
    ],
    "Drafts composed with the right recipients on the right channels, never mixed, every number attributed.",
  );

  const all = [reachability, factAccuracy, numberAgreement, communicationCorrectness];
  const overall = all.every((criterion) => criterion.status === "pass")
    ? "pass"
    : all.some((criterion) => criterion.status === "fail")
      ? "fail"
      : "incomplete";

  return {
    criteria: { reachability, factAccuracy, numberAgreement, communicationCorrectness },
    overall,
  };
}

/**
 * Day-zero source disagreements derivable from the frozen baseline alone (AC-S63-5 input).
 * Lease 297's RentVine-zero rent against a non-zero Sheet figure surfaces here as
 * `current_rent`; the field list feeds `knownDiscrepancyFields`, so a verdict can only pass
 * criterion 2 when each derived disagreement was RAISED on the evidence record, never silently
 * absorbed.
 */
export function deriveBaselineDiscrepancies(baseline: TestSetBaseline): string[] {
  const fields: string[] = [];
  const sheetRent = parseSheetCurrency(baseline.sheetRow.current_rent);
  const rvRent = baseline.rentvineFacts.currentRent;
  if (
    sheetRent !== null &&
    typeof rvRent === "number" &&
    Math.abs(rvRent - sheetRent) > 0.005
  ) {
    fields.push("current_rent");
  }
  return fields;
}

export function parseSheetCurrency(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Build the verdict input FROM the frozen baseline and the appended evidence entries — the report
 * generator derives everything from records, never from hand-typed values. Observations the window
 * has not produced yet stay null and therefore evaluate `not_evaluated` (AC-S63-10). Conventions:
 * a `verdict`-kind entry may carry observed booleans under `payload.reachability` /
 * `payload.factAccuracy` / `payload.communicationCorrectness`; an `app_position` entry may carry
 * `payload.providerEstimate`; `discrepancy_raised` entries carry `payload.field`.
 */
export function verdictInputFromRecords(input: {
  baseline: TestSetBaseline | null;
  entries: ReadonlyArray<{ kind: string; payload: Record<string, unknown> }>;
}): TestSetVerdictInput {
  const latestVerdict = [...input.entries]
    .reverse()
    .find((entry) => entry.kind === "verdict");
  const latestApp = [...input.entries]
    .reverse()
    .find((entry) => entry.kind === "app_position");
  const raisedFields = input.entries
    .filter((entry) => entry.kind === "discrepancy_raised")
    .map((entry) => entry.payload.field)
    .filter((field): field is string => typeof field === "string");

  const observed = (section: string, key: string): boolean | null => {
    const block = latestVerdict?.payload[section];
    if (!block || typeof block !== "object") return null;
    const value = (block as Record<string, unknown>)[key];
    return typeof value === "boolean" ? value : null;
  };

  const providerEstimate =
    typeof latestApp?.payload.providerEstimate === "number"
      ? latestApp.payload.providerEstimate
      : null;

  return {
    reachability: {
      appearedOnDesk: observed("reachability", "appearedOnDesk"),
      endDateMatchesBaseline: observed("reachability", "endDateMatchesBaseline"),
      dispositionCorrect: observed("reachability", "dispositionCorrect"),
    },
    factAccuracy: {
      knownDiscrepancyFields: input.baseline
        ? deriveBaselineDiscrepancies(input.baseline)
        : [],
      raisedDiscrepancyFields: raisedFields,
      factsMatchOrRaised: observed("factAccuracy", "factsMatchOrRaised"),
    },
    numberAgreement: {
      providerEstimate,
      ...(providerEstimate === null
        ? {
            providerMissingReason:
              "no app_position entry carries a provider estimate yet; the RentCast account activation is an open owner step (Q-RENTCAST-ACCOUNT-403)",
          }
        : {}),
      sheetMarketValue: input.baseline
        ? parseSheetCurrency(input.baseline.sheetRow.market_value)
        : null,
    },
    communicationCorrectness: {
      ownerDraftRecipientsCorrect: observed(
        "communicationCorrectness",
        "ownerDraftRecipientsCorrect",
      ),
      tenantDraftRecipientsCorrect: observed(
        "communicationCorrectness",
        "tenantDraftRecipientsCorrect",
      ),
      channelsSeparated: observed("communicationCorrectness", "channelsSeparated"),
      numbersAttributed: observed("communicationCorrectness", "numbersAttributed"),
    },
  };
}
