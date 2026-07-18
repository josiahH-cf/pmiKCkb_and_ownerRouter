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

afterEach(cleanup);

const resolution: LeaseRenewalResolutionRecord = {
  id: "decision-receipt-1",
  source_trigger_key: "lease_renewal:reconcile:live-review:current_rent",
  run_id: LIVE_RENEWAL_DECISION_RUN_ID,
  property_key: "opaque-property-key",
  field_key: "current_rent",
  field_label: "Current rent",
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

describe("Lease renewal decision projection", () => {
  it("projects the same decision/proposal identity without source or proposed values", () => {
    const decisions = buildLeaseRenewalDecisionProjections([resolution], [approval], {
      runId: LIVE_RENEWAL_DECISION_RUN_ID,
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
    const decisions = buildLeaseRenewalDecisionProjections([resolution], [staleApproval]);

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
});
