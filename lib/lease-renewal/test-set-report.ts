// S63 report builder. The report is generated from immutable baselines and append-only evidence,
// never hand-authored. It contains client data and is written only under the gitignored report
// boundary by `scripts/generate-test-set-report.ts`.

import type { TestSetEvidenceEntry } from "@/lib/firestore/test-set-evidence";
import type { TestSetVerdict } from "@/lib/lease-renewal/test-set-verdict";
import {
  S63_RENTCAST_RADIUS_MILES,
  S63_RENTCAST_REQUESTED_COUNT,
} from "@/lib/lease-renewal/test-set-verdict";

/** Production-open sends explicitly scoped out of the source-read-only S63 runner. */
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
  /** blind | informed | null; null renders as not yet distinguishable. */
  comparisonMode: "blind" | "informed" | null;
}

export interface TestSetReportInput {
  generatedAtIso: string;
  windowDescription: string;
  dailyOwner: string;
  abortTrigger: string;
  leases: readonly TestSetReportLease[];
}

const CRITERION_TITLES: ReadonlyArray<
  readonly [keyof TestSetVerdict["criteria"], string]
> = [
  ["process", "Process outcome"],
  ["numberEvidence", "Number and evidence outcome"],
  ["safety", "Read-only safety outcome"],
];

export function buildTestSetReport(input: TestSetReportInput): string {
  const lines: string[] = [];
  lines.push("# Four-lease renewal test set — evidence report");
  lines.push("");
  lines.push(
    `Generated ${input.generatedAtIso} from immutable baseline and evidence records.`,
  );
  lines.push(
    "This report is generated inside the authorized evidence boundary and is written outside",
    "Git because it contains client data. Terminal output exposes only counts and an opaque run",
    "reference.",
    "",
  );

  lines.push("## Scope and safety posture");
  lines.push("");
  lines.push(
    "- The four-case boundary is exact lease id plus exact Sheet row from secure runtime input.",
    "  The ordinary renewal desk remains broader; this proof runner does not add a product",
    "  allowlist or change who may work other leases.",
  );
  lines.push(
    "- S63 exercises preview/refusal behavior without confirmation. It does not create an unsent",
    "  Gmail draft, send a client message, or write RentVine, the operating Sheet, or Dotloop.",
  );
  lines.push(
    "- A per-case safety observation is required before any zero-effect claim can pass. Missing",
    "  safety evidence stays not evaluated rather than being inferred from the evidence schema.",
  );
  lines.push(
    "- Two production-open send keys are explicitly out of scope and are not used by S63:",
  );
  for (const key of TEST_SET_OPEN_SEND_KEYS) {
    lines.push(`  - \`${key}\``);
  }
  lines.push("");

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
        : "Frozen baseline NOT yet captured for this exact binding.",
    );
    lines.push(
      lease.comparisonMode === null
        ? "Blind-versus-informed human comparison: not yet distinguishable."
        : `The human decision was captured **${lease.comparisonMode === "blind" ? "blind (before the app evidence)" : "informed (after the app evidence)"}**.`,
    );
    lines.push("");

    for (const [key, title] of CRITERION_TITLES) {
      const outcome = lease.verdict.criteria[key];
      lines.push(`### ${title}`);
      lines.push("");
      lines.push(`- \`${outcome.status}\` — ${outcome.reason}`);
      lines.push("");
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
    `- **Sample size:** ${input.leases.length} lease(s). Four leases prove process behavior and`,
    "  catch gross evidence errors; they are not a statistical portfolio claim.",
  );
  lines.push(
    `- **Verdict families evaluated:** ${evaluated.length}; **not evaluated:** ${notEvaluated.length}.`,
  );
  for (const item of notEvaluated) {
    lines.push(`  - not_evaluated: ${item}`);
  }
  lines.push(
    "- Address or property text never identifies a case. Every baseline and evidence read uses the",
    "  secure exact lease-id/Sheet-row binding and immutable source hash.",
  );
  lines.push(
    "- Source disagreements are derived from each frozen baseline and must be raised explicitly;",
    "  no case-specific conflict is hard-coded into the report generator.",
  );
  lines.push(
    `- RentCast evidence is checked against the approved ${S63_RENTCAST_RADIUS_MILES}-mile maximum and ${S63_RENTCAST_REQUESTED_COUNT}-request policy.`,
    "  Provider order is preserved, no hidden selection/freshness rule is invented, and provider",
    "  evidence cannot set the human offer or decision.",
  );
  lines.push("");
  return lines.join("\n");
}
