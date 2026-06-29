// Golden-data labeling round-trip (R3 math half). Converts a live-captured DRAFT (candidate flags,
// labelsVerified:false — real client data, gitignored/in-boundary) into a human reviewer WORKSHEET and,
// once the team has reviewed it, into a VERIFIED golden set the harness gate enforces. Ground truth is
// the TEAM's accept/reject/severity decisions — it is NEVER invented here. Pure: re-runs the pipeline
// (a pure fn) to surface each candidate flag's full reconciliation context (competing values, sources,
// timestamps, suggested winner, severity); no I/O, no network, no spend. The CLI is scripts/golden-labeling.ts.

import { z } from "zod";

import { ExpectedFlagSchema } from "@/lib/lease-renewal/golden/load";
import {
  runRenewalPipeline,
  type ReconciledFieldOutcome,
  type RenewalRunInput,
} from "@/lib/lease-renewal/pipeline";
import type { Severity } from "@/lib/lease-renewal/severity";

export const SEVERITIES = ["High", "Blocked", "Medium", "Low"] as const satisfies readonly Severity[];

/** Per-candidate decision the team records on the worksheet. "PENDING" until reviewed; "accept" keeps the
 *  candidate severity; "reject" drops the flag (it must become a NON-flag — i.e. the math must stop raising
 *  it); a severity literal keeps the flag but corrects its routing severity. */
export const FlagDecisionSchema = z.enum([
  "PENDING",
  "accept",
  "reject",
  "High",
  "Blocked",
  "Medium",
  "Low",
]);
export type FlagDecision = z.infer<typeof FlagDecisionSchema>;

const CandidateValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const WorksheetCandidateSchema = z.object({
  source_system: z.string(),
  value: CandidateValueSchema,
  confidence: z.string().optional(),
  read_timestamp: z.string().optional(),
});

const WorksheetEntrySchema = z.object({
  key: z.string(),
  tab: z.string(),
  sourceRowIndex: z.number(),
  fieldKey: z.string(),
  fieldLabel: z.string(),
  candidateSeverity: z.enum(SEVERITIES),
  agreement: z.string(),
  suggestedWinner: z.object({ source: z.string(), value: CandidateValueSchema }).nullable(),
  confidenceForDraft: z.string(),
  blockedReason: z.string().optional(),
  candidates: z.array(WorksheetCandidateSchema),
  // Team-filled:
  decision: FlagDecisionSchema,
  note: z.string(),
});
export type WorksheetEntry = z.infer<typeof WorksheetEntrySchema>;

const FieldUnderReviewSchema = z.object({
  tab: z.string(),
  fieldKey: z.string(),
  fieldLabel: z.string(),
  candidateFlagCount: z.number(),
  // Team-filled: confirm the column/field means what the math assumes before its flags count as truth.
  meaningConfirmed: z.boolean(),
  note: z.string(),
});
export type FieldUnderReview = z.infer<typeof FieldUnderReviewSchema>;

export const GoldenWorksheetSchema = z.object({
  capturedName: z.string().min(1),
  category: z.enum(["correct", "wrong", "edge"]),
  description: z.string(),
  instructions: z.string(),
  // Team flips to true only after every entry decision and field meaning is filled.
  reviewed: z.boolean(),
  fieldsUnderReview: z.array(FieldUnderReviewSchema),
  entries: z.array(WorksheetEntrySchema),
});
export type GoldenWorksheet = z.infer<typeof GoldenWorksheetSchema>;

/** A captured golden draft as written by scripts/capture-golden-data.ts (input preserved verbatim). */
export const CapturedDraftSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["correct", "wrong", "edge"]),
  description: z.string(),
  labelsVerified: z.boolean(),
  capturedAt: z.string().optional(),
  input: z
    .object({
      runId: z.string(),
      tables: z.array(z.array(z.array(z.string()))),
      nonSheetCandidates: z.array(z.unknown()),
    })
    .passthrough(),
  expectedFlags: z.array(ExpectedFlagSchema),
});
export type CapturedDraft = z.infer<typeof CapturedDraftSchema>;

/** The verified golden set this round-trip produces; shape matches load.ts's CapturedScenarioSchema so the
 *  harness gate (loadVerifiedCapturedScenarios) picks it up automatically once labelsVerified flips true. */
export interface VerifiedGoldenSet {
  name: string;
  category: "correct" | "wrong" | "edge";
  description: string;
  labelsVerified: true;
  capturedAt?: string;
  input: CapturedDraft["input"];
  expectedFlags: z.infer<typeof ExpectedFlagSchema>[];
}

export const INSTRUCTIONS =
  "Review each entry against ground truth, then fill it in. " +
  'decision: "accept" (a real flag at candidateSeverity), "reject" (a FALSE POSITIVE — the math must stop ' +
  'raising it), or a severity ("High"|"Blocked"|"Medium"|"Low") to keep the flag but correct its severity. ' +
  "Confirm each field's meaning under fieldsUnderReview (meaningConfirmed:true). When every decision is set " +
  "(none left PENDING) and every field meaning is confirmed, set reviewed:true, then run golden:apply-labels.";

function flagKey(outcome: ReconciledFieldOutcome): string {
  return `${outcome.recordRef.tab}#${outcome.recordRef.sourceRowIndex}#${outcome.fieldKey}`;
}

/** Build a reviewer worksheet from a captured draft. Re-runs the (pure) pipeline on the draft input to
 *  surface each candidate flag's full reconciliation context — everything a human needs to judge it. */
export function buildWorksheet(draft: CapturedDraft): GoldenWorksheet {
  const result = runRenewalPipeline(draft.input as unknown as RenewalRunInput);

  const entries: WorksheetEntry[] = result.flags.map((flag) => ({
    key: flagKey(flag),
    tab: flag.recordRef.tab,
    sourceRowIndex: flag.recordRef.sourceRowIndex,
    fieldKey: flag.fieldKey,
    fieldLabel: flag.fieldLabel,
    candidateSeverity: flag.reconciliation.severity,
    agreement: flag.reconciliation.agreement,
    suggestedWinner: flag.reconciliation.suggested_winner
      ? {
          source: flag.reconciliation.suggested_winner.source,
          value: flag.reconciliation.suggested_winner.value,
        }
      : null,
    confidenceForDraft: String(flag.reconciliation.confidence_for_draft),
    ...(flag.reconciliation.blocked_reason
      ? { blockedReason: flag.reconciliation.blocked_reason }
      : {}),
    candidates: flag.reconciliation.candidates.map((candidate) => ({
      source_system: candidate.source_system,
      value: candidate.value,
      ...(candidate.confidence ? { confidence: candidate.confidence } : {}),
      ...(candidate.read_timestamp ? { read_timestamp: candidate.read_timestamp } : {}),
    })),
    decision: "PENDING",
    note: "",
  }));

  const fieldGroups = new Map<string, FieldUnderReview>();
  for (const flag of result.flags) {
    const key = `${flag.recordRef.tab}::${flag.fieldKey}`;
    const existing = fieldGroups.get(key);
    if (existing) {
      existing.candidateFlagCount += 1;
    } else {
      fieldGroups.set(key, {
        tab: flag.recordRef.tab,
        fieldKey: flag.fieldKey,
        fieldLabel: flag.fieldLabel,
        candidateFlagCount: 1,
        meaningConfirmed: false,
        note: "",
      });
    }
  }

  return {
    capturedName: draft.name,
    category: draft.category,
    description: draft.description,
    instructions: INSTRUCTIONS,
    reviewed: false,
    fieldsUnderReview: [...fieldGroups.values()],
    entries,
  };
}

export interface DecisionSummary {
  total: number;
  accepted: number;
  rejected: number;
  severityCorrections: number;
}

export function summarizeDecisions(worksheet: GoldenWorksheet): DecisionSummary {
  let accepted = 0;
  let rejected = 0;
  let severityCorrections = 0;
  for (const entry of worksheet.entries) {
    if (entry.decision === "reject") rejected += 1;
    else if (entry.decision === "accept") accepted += 1;
    else if (entry.decision !== "PENDING") {
      accepted += 1;
      if (entry.decision !== entry.candidateSeverity) severityCorrections += 1;
    }
  }
  return { total: worksheet.entries.length, accepted, rejected, severityCorrections };
}

/** Apply the team's reviewed worksheet to a draft, producing a VERIFIED golden set. Refuses an
 *  incomplete review (anti-slop: no verified labels from a half-filled sheet) and a worksheet that does
 *  not match the draft's current pipeline flags (stale/mismatched — regenerate). Ground truth is the
 *  team's decisions only. */
export function applyDecisions(draft: CapturedDraft, worksheet: GoldenWorksheet): VerifiedGoldenSet {
  if (worksheet.capturedName !== draft.name) {
    throw new Error(
      `Worksheet is for "${worksheet.capturedName}" but the draft is "${draft.name}" — pass the matching pair.`,
    );
  }
  if (!worksheet.reviewed) {
    throw new Error(
      "Worksheet is not reviewed (reviewed:false). Fill every decision + field meaning, then set reviewed:true.",
    );
  }
  const pending = worksheet.entries.filter((entry) => entry.decision === "PENDING");
  if (pending.length > 0) {
    throw new Error(
      `${pending.length} entr${pending.length === 1 ? "y is" : "ies are"} still PENDING — decide every flag before applying.`,
    );
  }
  const unconfirmed = worksheet.fieldsUnderReview.filter((field) => !field.meaningConfirmed);
  if (unconfirmed.length > 0) {
    throw new Error(
      `${unconfirmed.length} field meaning(s) unconfirmed (${unconfirmed
        .map((field) => `${field.tab}/${field.fieldKey}`)
        .join(", ")}) — confirm each before applying.`,
    );
  }

  // Integrity: the worksheet must describe exactly the draft's current candidate flags (deterministic
  // pipeline), or it was built from a different/stale draft.
  const result = runRenewalPipeline(draft.input as unknown as RenewalRunInput);
  const currentKeys = new Set(result.flags.map(flagKey));
  const worksheetKeys = new Set(worksheet.entries.map((entry) => entry.key));
  if (
    currentKeys.size !== worksheetKeys.size ||
    [...currentKeys].some((key) => !worksheetKeys.has(key))
  ) {
    throw new Error(
      "Worksheet entries do not match the draft's current pipeline flags — regenerate the worksheet (golden:worksheet) from this draft.",
    );
  }

  const expectedFlags = worksheet.entries
    .filter((entry) => entry.decision !== "reject")
    .map((entry) => ({
      tab: entry.tab,
      sourceRowIndex: entry.sourceRowIndex,
      fieldKey: entry.fieldKey,
      severity: (entry.decision === "accept"
        ? entry.candidateSeverity
        : entry.decision) as VerifiedGoldenSet["expectedFlags"][number]["severity"],
    }));

  const summary = summarizeDecisions(worksheet);
  return {
    name: draft.name,
    category: worksheet.category,
    description:
      `Team-verified golden set from "${draft.name}": ${summary.accepted} accepted flag(s), ` +
      `${summary.rejected} rejected as false positives, ${summary.severityCorrections} severity correction(s). ` +
      "Ground truth is the team's review (not pipeline output). " +
      draft.description,
    labelsVerified: true,
    ...(draft.capturedAt ? { capturedAt: draft.capturedAt } : {}),
    input: draft.input,
    expectedFlags,
  };
}
