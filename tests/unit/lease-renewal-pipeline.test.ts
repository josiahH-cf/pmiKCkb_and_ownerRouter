import { describe, expect, it } from "vitest";

import {
  runRenewalPipeline,
  type NonSheetCandidate,
  type RenewalRunInput,
} from "@/lib/lease-renewal/pipeline";
import {
  SYNTHETIC_CREDENTIAL_TAB_4,
  SYNTHETIC_CREDENTIAL_TAB_7,
  SYNTHETIC_RENEWALS_TAB,
} from "../fixtures/lease-renewal/synthetic-renewal-sheet";

const RENEWALS_ONLY = [SYNTHETIC_RENEWALS_TAB.grid];

function findOutcome(
  result: ReturnType<typeof runRenewalPipeline>,
  fieldKey: string,
  tenantRow: number,
) {
  return result.outcomes.find(
    (outcome) =>
      outcome.fieldKey === fieldKey && outcome.recordRef.sourceRowIndex === tenantRow,
  );
}

describe("runRenewalPipeline", () => {
  it("raises a High flag with a suggested winner on a renewal-date conflict", () => {
    const candidates: NonSheetCandidate[] = [
      {
        source: "rentvine",
        source_system: "Rentvine",
        joinKind: "name",
        joinValue: "Casey Rivers",
        read_timestamp: "2026-06-20T00:00:00Z",
        location_ref: "/lease-renewal/runs/run-1/reconciliation/renewal_date#rentvine",
        fields: { renewal_date: { value: "2026-09-01" } },
      },
    ];
    const result = runRenewalPipeline({
      runId: "run-1",
      tables: RENEWALS_ONLY,
      nonSheetCandidates: candidates,
    });

    expect(result.production_allowed).toBe(false);
    expect(result.bySeverity.High).toHaveLength(1);
    const flag = result.bySeverity.High[0];
    expect(flag.fieldKey).toBe("renewal_date");
    expect(flag.reconciliation.agreement).toBe("conflict");
    expect(flag.reconciliation.severity).toBe("High");
    expect(flag.reconciliation.suggested_winner).toEqual({
      source: "rentvine",
      value: "2026-09-01",
    });
    expect(result.queueItems).toHaveLength(1);
    expect(result.queueItems[0].risk).toBe("High");
  });

  it("routes a conflict on a field with no precedence rule to Blocked", () => {
    const candidates: NonSheetCandidate[] = [
      {
        source: "google_form",
        source_system: "Google Form",
        joinKind: "name",
        joinValue: "Jordan Maple",
        fields: { tenant_responded: { value: false } },
      },
    ];
    const result = runRenewalPipeline({
      runId: "run-1",
      tables: RENEWALS_ONLY,
      nonSheetCandidates: candidates,
    });

    expect(result.bySeverity.Blocked).toHaveLength(1);
    const flag = result.bySeverity.Blocked[0];
    expect(flag.fieldKey).toBe("tenant_responded");
    expect(flag.reconciliation.blocked_reason).toBe("no precedence rule");
    expect(flag.reconciliation.suggested_winner).toBeNull();
    expect(result.queueItems[0].status).toBe("Blocked");
  });

  it("raises no flag when candidates agree, and leaves unmatched records single-source", () => {
    const candidates: NonSheetCandidate[] = [
      {
        source: "rentvine",
        source_system: "Rentvine",
        joinKind: "name",
        joinValue: "Jordan Maple",
        // Matches the sheet's normalized ISO date for Jordan Maple (8/31/2026).
        fields: { renewal_date: { value: "2026-08-31" } },
      },
    ];
    const result = runRenewalPipeline({
      runId: "run-1",
      tables: RENEWALS_ONLY,
      nonSheetCandidates: candidates,
    });

    expect(result.flags).toHaveLength(0);
    // Jordan Maple (grid row 1) has two agreeing candidates.
    expect(findOutcome(result, "renewal_date", 1)?.reconciliation.agreement).toBe(
      "agree",
    );
    // Pat Solstice (grid row 3) has no non-sheet candidate -> single source.
    expect(findOutcome(result, "renewal_date", 3)?.reconciliation.agreement).toBe(
      "single_source",
    );
  });

  it("never merges an ambiguous or below-threshold join", () => {
    const candidates: NonSheetCandidate[] = [
      {
        source: "rentvine",
        source_system: "Rentvine",
        joinKind: "name",
        // "Jordan" alone is an ambiguous (0.5) match against "Jordan Maple" -> never merged.
        joinValue: "Jordan",
        fields: { renewal_date: { value: "2026-12-31" } },
      },
    ];
    const result = runRenewalPipeline({
      runId: "run-1",
      tables: RENEWALS_ONLY,
      nonSheetCandidates: candidates,
    });

    expect(result.flags).toHaveLength(0);
    expect(findOutcome(result, "renewal_date", 1)?.reconciliation.agreement).toBe(
      "single_source",
    );
  });

  it("excludes credential tabs and reflects them in the counts-only manifest", () => {
    const result = runRenewalPipeline({
      runId: "run-1",
      tables: [
        SYNTHETIC_RENEWALS_TAB.grid,
        SYNTHETIC_CREDENTIAL_TAB_4.grid,
        SYNTHETIC_CREDENTIAL_TAB_7.grid,
      ],
      nonSheetCandidates: [],
    });

    expect(result.manifest.credentialTabsExcluded).toBe(2);
    expect(result.excludedTabs).toHaveLength(2);
    // No credential placeholder value may survive anywhere in the run output.
    expect(JSON.stringify(result)).not.toContain("PLACEHOLDER");
    // Every reconciled record came from the Renewals tab — never a credential tab.
    expect(result.outcomes.every((outcome) => outcome.recordRef.tab === "Renewals")).toBe(
      true,
    );
  });

  it("keeps queue items PII-free and deep-linked, and the manifest counts-only", () => {
    const candidates: NonSheetCandidate[] = [
      {
        source: "rentvine",
        source_system: "Rentvine",
        joinKind: "name",
        joinValue: "Casey Rivers",
        fields: { renewal_date: { value: "2026-09-01" } },
      },
    ];
    const result = runRenewalPipeline({
      runId: "run-1",
      tables: RENEWALS_ONLY,
      nonSheetCandidates: candidates,
    });

    for (const item of result.queueItems) {
      expect(item.direct_link.startsWith("/lease-renewal/runs/")).toBe(true);
    }
    // The conflicting value lives only inside the in-boundary reconciliation candidates,
    // never in the queue artifact or the manifest.
    expect(JSON.stringify(result.queueItems)).not.toContain("2026-09-01");
    expect(JSON.stringify(result.manifest)).not.toContain("Jordan");
    expect(JSON.stringify(result.manifest)).not.toContain("Casey");
  });

  it("is deterministic across repeated runs", () => {
    const input: RenewalRunInput = {
      runId: "run-1",
      tables: RENEWALS_ONLY,
      nonSheetCandidates: [
        {
          source: "rentvine",
          source_system: "Rentvine",
          joinKind: "name",
          joinValue: "Casey Rivers",
          fields: { renewal_date: { value: "2026-09-01" } },
        },
      ],
    };
    expect(runRenewalPipeline(input)).toEqual(runRenewalPipeline(input));
  });
});
