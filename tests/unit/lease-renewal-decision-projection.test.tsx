// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeaseDecisionProjectionPanel } from "@/components/lease-renewal/LeaseDecisionProjectionPanel";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import {
  buildLeaseRenewalDecisionProjections,
  LIVE_RENEWAL_DECISION_RUN_ID,
} from "@/lib/lease-renewal/decision-projection";
import type {
  ReconciledFieldOutcome,
  RenewalRunResult,
} from "@/lib/lease-renewal/pipeline";

afterEach(cleanup);

const resolution: LeaseRenewalResolutionRecord = {
  id: "decision-receipt-1",
  source_trigger_key: "lease_renewal:reconcile:live-review:current_rent",
  run_id: LIVE_RENEWAL_DECISION_RUN_ID,
  property_key: "opaque-property-key",
  field_key: "current_rent",
  field_label: "Current rent",
  candidate_fingerprint: `rcf1_${"a".repeat(64)}`,
  severity: "High",
  status: "Resolved",
  resolution_kind: "pick_source",
  chosen_source: "authoritative-source",
  reason: "value-bearing operator reason must stay off the projection",
  resolved_by_uid: "admin-1",
  proposed_writeback: {
    field_key: "current_rent",
    value: "sensitive proposed value",
    source_of_value: "authoritative-source",
    status: "Queued",
    production_allowed: false,
  },
  created_at: "2026-07-18T12:00:00.000Z",
  updated_at: "2026-07-18T12:01:00.000Z",
};

const approval: LeaseRenewalWritebackApprovalRecord = {
  id: "authorization-receipt-1",
  source_trigger_key: resolution.source_trigger_key,
  run_id: LIVE_RENEWAL_DECISION_RUN_ID,
  property_key: resolution.property_key,
  field_key: resolution.field_key,
  field_label: resolution.field_label,
  candidate_fingerprint: resolution.candidate_fingerprint,
  resolution_updated_at: resolution.updated_at,
  severity: "High",
  state: "Approved",
  proposed_value: resolution.proposed_writeback!.value,
  source_of_value: resolution.proposed_writeback!.source_of_value,
  reason: "another value-bearing reason",
  decided_by_uid: "admin-2",
  production_allowed: false,
  executed: false,
  created_at: "2026-07-18T12:02:00.000Z",
  updated_at: "2026-07-18T12:02:00.000Z",
};

function currentRun(
  candidateFingerprint = resolution.candidate_fingerprint!,
): RenewalRunResult {
  const flag = {
    recordRef: { tab: "Lease Renewal", tabNumber: 3, sourceRowIndex: 4 },
    fieldKey: resolution.field_key,
    fieldLabel: resolution.field_label,
    candidateFingerprint,
    reconciliation: {
      field_key: resolution.field_key,
      candidates: [
        {
          source: resolution.chosen_source!,
          source_system: "Authoritative source",
          value: resolution.proposed_writeback!.value,
        },
        { source: "other-source", source_system: "Other source", value: "other" },
      ],
      agreement: "conflict",
      suggested_winner: null,
      suggestion_only: true,
      auto_apply_allowed: false,
      severity: "High",
      severity_rule: 1,
      confidence_for_draft: "Conflict",
      raise_flag: true,
    },
    queueMapping: {
      queueItem: {
        item_type: "SourceFactConflict",
        source_trigger_key: resolution.source_trigger_key,
        status: "Ready for Approval",
        risk: "High",
        audience_group: "Dan/Admin decisions",
        process_run_ref: { id: LIVE_RENEWAL_DECISION_RUN_ID, label: "Current rent" },
        action_needed: "Review current rent.",
        affected_system_action: "google_sheets.renewal_checklist.reconcile",
        direct_link: "/lease-renewal/live",
      },
      sourceLinks: [],
    },
    propertyKey: resolution.property_key,
  } satisfies ReconciledFieldOutcome;
  return {
    runId: LIVE_RENEWAL_DECISION_RUN_ID,
    manifest: {
      tabsRecognized: 1,
      tabsUnrecognized: 0,
      credentialTabsExcluded: 0,
      credentialScrubHits: 0,
      dividerRowsDropped: 0,
      unrecognizedRowCount: 0,
      totalRecords: 1,
      perTab: [],
    },
    excludedTabs: [],
    outcomes: [flag],
    flags: [flag],
    queueItems: [flag.queueMapping.queueItem],
    bySeverity: { High: [flag], Blocked: [], Medium: [], Low: [] },
    production_allowed: false,
  };
}

describe("Lease renewal decision projection", () => {
  it("projects the same decision/proposal identity without source or proposed values", () => {
    const decisions = buildLeaseRenewalDecisionProjections([resolution], [approval], {
      runId: LIVE_RENEWAL_DECISION_RUN_ID,
      currentRuns: [currentRun()],
    });

    expect(decisions).toEqual([
      expect.objectContaining({
        sourceTriggerKey: resolution.source_trigger_key,
        dataMode: "Live",
        propertyKey: "opaque-property-key",
        decisionReceiptId: "decision-receipt-1",
        decisionReasonRecorded: true,
        proposalState: "Queued",
        proposalIdentity: "decision-receipt-1",
        authorizationState: "Approved",
        authorizationReceiptId: "authorization-receipt-1",
        executionState: "not_executed",
        owningHref: "/lease-renewal/live",
      }),
    ]);
    expect(JSON.stringify(decisions)).not.toContain("sensitive proposed value");
    expect(JSON.stringify(decisions)).not.toContain("value-bearing operator reason");
    expect(JSON.stringify(decisions)).not.toContain("another value-bearing reason");
  });

  it("treats a stale authorization as awaiting approval and renders an honest execution boundary", () => {
    const staleApproval = { ...approval, proposed_value: "old value" };
    const decisions = buildLeaseRenewalDecisionProjections(
      [resolution],
      [staleApproval],
      {
        currentRuns: [currentRun()],
      },
    );

    expect(decisions[0]).toMatchObject({
      authorizationState: "Awaiting Approval",
      authorizationReceiptId: null,
      authorizationReasonRecorded: false,
      executionState: "not_executed",
    });

    render(
      <LeaseDecisionProjectionPanel
        decisions={decisions}
        emptyMessage="none"
        title="Live renewal decisions"
      />,
    );

    const region = screen.getByRole("region", { name: "Live renewal decisions" });
    expect(region).toHaveTextContent("Live · Current rent");
    expect(region).toHaveTextContent("Awaiting Approval");
    expect(region).toHaveTextContent("not executed");
    expect(region).toHaveTextContent("decision-receipt-1");
    expect(region).not.toHaveTextContent("sensitive proposed value");
    expect(screen.getByRole("link", { name: "Open property history" })).toHaveAttribute(
      "href",
      expect.stringContaining("opaque-property-key"),
    );
  });

  it.each([
    ["missing approval fingerprint", { candidate_fingerprint: undefined }],
    ["blank approval fingerprint", { candidate_fingerprint: "   " }],
    ["mismatched approval fingerprint", { candidate_fingerprint: "rcf1_other" }],
    ["missing resolution version", { resolution_updated_at: undefined }],
    ["blank resolution version", { resolution_updated_at: "   " }],
    [
      "mismatched resolution version",
      { resolution_updated_at: "2026-07-18T11:59:00.000Z" },
    ],
  ])("treats %s as legacy or stale, never as current authorization", (_name, patch) => {
    const decisions = buildLeaseRenewalDecisionProjections(
      [resolution],
      [{ ...approval, ...patch }],
      { currentRuns: [currentRun()] },
    );

    expect(decisions[0]).toMatchObject({
      authorizationState: "Awaiting Approval",
      authorizationReceiptId: null,
      authorizationReasonRecorded: false,
      executionState: "not_executed",
    });
  });

  it.each([
    ["missing resolution fingerprint", { candidate_fingerprint: undefined }],
    ["blank resolution fingerprint", { candidate_fingerprint: "   " }],
    ["blank resolution updated-at", { updated_at: "   " }],
  ])("omits a legacy or malformed decision with %s", (_name, patch) => {
    const legacyResolution = { ...resolution, ...patch };
    const decisions = buildLeaseRenewalDecisionProjections(
      [legacyResolution],
      [
        {
          ...approval,
          candidate_fingerprint: legacyResolution.candidate_fingerprint,
          resolution_updated_at: legacyResolution.updated_at,
        },
      ],
      { currentRuns: [currentRun()] },
    );

    expect(decisions).toEqual([]);
  });

  it.each([
    ["wrong run identity", { run_id: "another-run" }],
    ["missing resolution kind", { resolution_kind: undefined }],
    [
      "mismatched proposal field",
      {
        proposed_writeback: {
          ...resolution.proposed_writeback!,
          field_key: "renewal_date",
        },
      },
    ],
  ])("omits a decision with %s", (_name, patch) => {
    expect(
      buildLeaseRenewalDecisionProjections([{ ...resolution, ...patch }], [approval], {
        runId: LIVE_RENEWAL_DECISION_RUN_ID,
        currentRuns: [currentRun()],
      }),
    ).toEqual([]);
  });

  it("omits a once-current decision when the exact source fingerprint drifts", () => {
    expect(
      buildLeaseRenewalDecisionProjections([resolution], [approval], {
        currentRuns: [currentRun(`rcf1_${"b".repeat(64)}`)],
      }),
    ).toEqual([]);
  });

  it("omits a decision when unchanged candidate values move to a different property", () => {
    const run = currentRun();
    run.flags[0] = { ...run.flags[0], propertyKey: "different-property-key" };
    run.outcomes[0] = run.flags[0];
    run.bySeverity.High[0] = run.flags[0];

    expect(
      buildLeaseRenewalDecisionProjections([resolution], [approval], {
        currentRuns: [run],
      }),
    ).toEqual([]);
  });
});
