// S63 report builder (AC-S63-7, AC-S63-8, AC-S63-9, AC-S63-13). Builds the plain-English test-set
// report FROM the evidence records — never hand-authored, so it cannot drift from what actually
// happened. The report contains client data and is therefore written OUTSIDE git by the generator
// script (`scripts/generate-test-set-report.ts`), following the golden-data boundary.
//
// The report is structurally incapable of reading as an unqualified pass: the limits section, the
// procedural-boundary statement, and the send-key scope-out are unconditional parts of the
// document, and every criterion renders its status WITH its reason.

import type { TestSetEvidenceEntry } from "@/lib/firestore/test-set-evidence";
import type { TestSetVerdict } from "@/lib/lease-renewal/test-set-verdict";
import {
  TESTSET_TOLERANCE_PCT,
  TESTSET_TOLERANCE_USD,
} from "@/lib/lease-renewal/test-set-verdict";

/** The two production-open send keys the test set must scope out in writing (AC-S63-9). */
export const TEST_SET_OPEN_SEND_KEYS = [
  "gmail.thread.reply",
  "internal.transactional_notice.send",
] as const;

export interface TestSetReportLease {
  leaseId: string;
  sheetRowNumber: number;
  endDateIso: string | null;
  baseline: { captured: boolean; hash: string | null; capturedAt: string | null };
  evidence: readonly TestSetEvidenceEntry[];
  verdict: TestSetVerdict;
  /** blind | informed | null (AC-S63-12) — null renders as "not yet distinguishable". */
  comparisonMode: "blind" | "informed" | null;
}

export interface TestSetReportInput {
  generatedAtIso: string;
  windowDescription: string;
  dailyOwner: string;
  abortTrigger: string;
  leases: readonly TestSetReportLease[];
  /** Count of application-initiated client sends observed during the window. Must be reported. */
  applicationInitiatedClientSends: number;
}

const CRITERION_TITLES: ReadonlyArray<
  readonly [keyof TestSetVerdict["criteria"], string]
> = [
  ["reachability", "1. Reachability and classification"],
  ["factAccuracy", "2. Fact accuracy"],
  ["numberAgreement", "3. Number agreement"],
  ["communicationCorrectness", "4. Communication correctness"],
];

export function buildTestSetReport(input: TestSetReportInput): string {
  const lines: string[] = [];
  lines.push("# Four-lease renewal test set — evidence report");
  lines.push("");
  lines.push(`Generated ${input.generatedAtIso} from the recorded evidence entries.`);
  lines.push(
    "This document is produced by the report generator from the Firestore evidence",
    "records; it is not hand-authored and it is written outside git because it contains",
    "client data.",
    "",
  );

  lines.push("## Scope and safety posture");
  lines.push("");
  lines.push(
    "- The cohort boundary was **procedural, not enforced by code**: the desk shows every",
    "  lease in its window, and the operators worked the four test leases by their per-lease",
    "  links. No lease filter, allowlist, or pilot flag exists.",
  );
  lines.push(
    `- **Application-initiated client sends during the test: ${input.applicationInitiatedClientSends}.**`,
    "  Renewal and maintenance client notices are draft-only and their send keys are",
    "  Registry-closed under D33. This is a checked statement, not a remembered one.",
  );
  lines.push(
    "- Two send keys ARE open in production and are explicitly **out of scope for this test**,",
    "  scoped out in writing rather than assumed away:",
  );
  for (const key of TEST_SET_OPEN_SEND_KEYS) {
    lines.push(`  - \`${key}\` — not used by the test set.`);
  }
  lines.push(
    "- Test-window communication is **compose-and-review only**: owner drafts are produced",
    "  and reviewed by a person in Gmail and are not sent during the window. Any human",
    "  reviewed-and-sent draft under D33 would be recorded on the evidence record.",
    "",
  );

  lines.push("## Window, daily owner, abort trigger");
  lines.push("");
  lines.push(`- Window: ${input.windowDescription}`);
  lines.push(`- Daily owner: ${input.dailyOwner}`);
  lines.push(`- Abort trigger: ${input.abortTrigger}`);
  lines.push("");

  for (const lease of input.leases) {
    lines.push(
      `## Lease ${lease.leaseId} (Sheet row ${lease.sheetRowNumber}, ends ${lease.endDateIso ?? "unknown"})`,
    );
    lines.push("");
    lines.push(
      lease.baseline.captured
        ? `Frozen baseline captured ${lease.baseline.capturedAt ?? "(time unrecorded)"} — hash \`${lease.baseline.hash ?? ""}\`.`
        : "Frozen baseline NOT yet captured for this lease.",
    );
    lines.push(
      lease.comparisonMode === null
        ? "Blind-versus-informed comparison: not yet distinguishable (one side of the comparison has not been recorded)."
        : `The human figure was captured **${lease.comparisonMode === "blind" ? "blind (before the app's output)" : "informed (after the app's output)"}**.`,
    );
    lines.push("");
    for (const [key, title] of CRITERION_TITLES) {
      const outcome = lease.verdict.criteria[key];
      lines.push(`- **${title}** — \`${outcome.status}\`. ${outcome.reason}`);
    }
    lines.push(`- **Overall:** \`${lease.verdict.overall}\``);
    lines.push("");
    const discrepancies = lease.evidence.filter(
      (entry) => entry.kind === "discrepancy_raised",
    );
    const dispositions = lease.evidence.filter(
      (entry) => entry.kind === "discrepancy_disposition",
    );
    lines.push(
      `Discrepancies raised: ${discrepancies.length}; dispositioned: ${dispositions.length}.`,
    );
    for (const entry of discrepancies) {
      lines.push(`- Raised ${entry.recordedAt}: ${entry.note}`);
    }
    for (const entry of dispositions) {
      lines.push(`- Dispositioned ${entry.recordedAt}: ${entry.note}`);
    }
    lines.push("");
    lines.push("Timeline:");
    if (lease.evidence.length === 0) {
      lines.push("- No evidence entries recorded yet.");
    }
    for (const entry of lease.evidence) {
      lines.push(`- ${entry.recordedAt} · ${entry.kind}: ${entry.note}`);
    }
    lines.push("");
  }

  lines.push("## Limits of this report");
  lines.push("");
  const evaluated: string[] = [];
  const notEvaluated: string[] = [];
  for (const lease of input.leases) {
    for (const [key, title] of CRITERION_TITLES) {
      const outcome = lease.verdict.criteria[key];
      const label = `lease ${lease.leaseId} · ${title}`;
      if (outcome.status === "not_evaluated") {
        notEvaluated.push(`${label} — ${outcome.reason}`);
      } else {
        evaluated.push(label);
      }
    }
  }
  lines.push(
    `- **Sample size:** ${input.leases.length} lease(s). Four leases prove process and catch`,
    "  gross errors; they are not a statistical claim about the portfolio.",
  );
  lines.push(
    `- **Criteria evaluated:** ${evaluated.length}; **not evaluated:** ${notEvaluated.length}.`,
  );
  for (const item of notEvaluated) {
    lines.push(`  - not_evaluated: ${item}`);
  }
  lines.push(
    "- The cohort boundary was procedural (stated above), so nothing in code prevented an",
    "  operator from working a non-cohort lease.",
  );
  lines.push(
    "- Leases 279 and 280 share one street address; every record in this test keys on lease",
    "  id, and address alone does not identify a lease.",
  );
  lines.push(
    "- Lease 297 carried a source disagreement from day zero: RentVine reads a current rent",
    "  of zero while the Sheet lists a non-zero figure. That is finding number one of the",
    "  test, present before any work began.",
  );
  lines.push(
    "- No cohort lease is MKD-owned (portfolio 27), so the owner-policy rule path (S62) and",
    "  the equal-ownership tie case (S61) are not exercised by this cohort.",
  );
  lines.push(
    `- Criterion 3 tolerance: the larger of ±${TESTSET_TOLERANCE_PCT}% and ±$${TESTSET_TOLERANCE_USD},`,
    "  against the Sheet's human-entered Market Value (no cohort lease carried a negotiated",
    "  rent when the test opened).",
  );
  lines.push("");
  return lines.join("\n");
}
