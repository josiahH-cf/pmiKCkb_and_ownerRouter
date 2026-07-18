import { describe, expect, it } from "vitest";

import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import {
  MAINTENANCE_TEST_ACTIONS,
  type MaintenanceTestActionReceipt,
} from "@/lib/maintenance/test-workflow";
import {
  buildLeaseTestOperationalHandoff,
  buildMaintenanceTestOperationalHandoff,
} from "@/lib/operations/test-handoffs";
import {
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ALIASES,
  type LeaseTestActionReceipt,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

function leaseRun(overrides: Partial<LeaseTestRunRecord> = {}): LeaseTestRunRecord {
  return {
    id: "test-renewal-handoff-1",
    data_mode: "test",
    scenario: "standard-renewal",
    status: "Executing",
    labels: ["TEST DATA"],
    lease_ref: LEASE_TEST_ALIASES.leaseRef,
    property_label: LEASE_TEST_ALIASES.propertyLabel,
    resident_label: LEASE_TEST_ALIASES.residentLabel,
    resident_email: LEASE_TEST_ALIASES.residentEmail,
    action_total: LEASE_TEST_ACTIONS.length,
    candidate_disposition: "included",
    candidate_cadence: "two_month_window",
    candidate_off_cycle: false,
    candidate_worklog_reason: "canonical_standard_window_test_fixture",
    owner_direction: "renew",
    owner_terms_key: "canonical-test-renewal-terms-v1",
    tenant_offer_timing: "by_fifteenth",
    signature_window_days: 30,
    conditional_facts_key: "canonical-test-conditional-facts-v1",
    created_by_uid: "editor-1",
    updated_by_uid: "editor-1",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T01:00:00.000Z",
    ...overrides,
  };
}

function leaseReceipt(
  actionKey: (typeof LEASE_TEST_ACTIONS)[number],
): LeaseTestActionReceipt {
  return {
    id: `receipt:${actionKey}`,
    run_id: "test-renewal-handoff-1",
    data_mode: "test",
    action_key: actionKey,
    target_label: "TEST target",
    outcome: "simulated_success",
    attempt_count: 1,
    provider_contacted: false,
    live_proof_eligible: false,
    actor_uid: "editor-1",
    created_at: "2026-07-18T01:00:00.000Z",
  };
}

function maintenanceTicket(
  overrides: Partial<MaintenanceTicketRecord> = {},
): MaintenanceTicketRecord {
  return {
    id: "maintenance-test-handoff-1",
    data_mode: "test",
    status: "Open",
    priority: "High",
    priority_provenance: "operator-set",
    summary: "SENTINEL_SUMMARY_MUST_NOT_PROJECT",
    description: "SENTINEL_DESCRIPTION_MUST_NOT_PROJECT",
    unit: { unitId: "test-unit", label: "SENTINEL_UNIT_MUST_NOT_PROJECT" },
    photo_refs: [],
    reporter: { kind: "staff", uid: "editor-1" },
    labels: ["TEST DATA"],
    space_id: "maintenance-work-order-intake",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T01:00:00.000Z",
    ...overrides,
  };
}

describe("bodyless Test operational handoffs", () => {
  it("projects the exact Lease Test owner, due state, blocker, action, and owning link", () => {
    const handoff = buildLeaseTestOperationalHandoff(leaseRun(), [], []);

    expect(handoff).toMatchObject({
      data_mode: "test",
      kind: "lease_renewal",
      owning_record_id: "test-renewal-handoff-1",
      owning_record_href: "/lease-renewal/runs/test-renewal-handoff-1",
      next_owner: "Lease renewal operator",
      exact_next_action:
        "Simulate gmail.renewal_notice.draft_create and record its Test receipt",
      evidence_identity: "No Test evidence recorded yet",
    });
    const serialized = JSON.stringify(handoff);
    expect(serialized).not.toContain(LEASE_TEST_ALIASES.propertyLabel);
    expect(serialized).not.toContain(LEASE_TEST_ALIASES.residentEmail);
  });

  it("keeps the terminal Move-Out branch linked to its next owner and disables renewal", () => {
    const handoff = buildLeaseTestOperationalHandoff(
      leaseRun({
        status: "Moved to Move-Out",
        tenant_response: "move_out",
        business_test_status: "moved_to_move_out",
      }),
      [],
      [],
    );

    expect(handoff.next_owner).toBe("Move-Out operator");
    expect(handoff.blocker).toMatch(/renewal actions are terminal/i);
    expect(handoff.exact_next_action).toMatch(/Move-Out Space handoff/i);
  });

  it("projects Maintenance Test attention without copying ticket values", () => {
    const handoff = buildMaintenanceTestOperationalHandoff(maintenanceTicket(), []);

    expect(handoff).toMatchObject({
      data_mode: "test",
      kind: "maintenance",
      owning_record_href: "/maintenance?ticket_id=maintenance-test-handoff-1",
      next_owner: "Maintenance triage operator",
      exact_next_action: "Assign the owning Test ticket to a supported staff identity",
    });
    const serialized = JSON.stringify(handoff);
    expect(serialized).not.toContain("SENTINEL_SUMMARY_MUST_NOT_PROJECT");
    expect(serialized).not.toContain("SENTINEL_DESCRIPTION_MUST_NOT_PROJECT");
    expect(serialized).not.toContain("SENTINEL_UNIT_MUST_NOT_PROJECT");
  });

  it("qualifies a closed Maintenance Test ticket even when all app receipts exist", () => {
    const receipts: MaintenanceTestActionReceipt[] = MAINTENANCE_TEST_ACTIONS.map(
      (actionKey, index) => ({
        id: `maintenance-receipt-${index}`,
        ticket_id: "maintenance-test-handoff-1",
        data_mode: "test",
        action_key: actionKey,
        target_label: "TEST target",
        outcome: "simulated_success",
        provider_contacted: false,
        live_proof_eligible: false,
        actor_uid: "editor-1",
        created_at: `2026-07-18T01:00:0${index}.000Z`,
      }),
    );
    const handoff = buildMaintenanceTestOperationalHandoff(
      maintenanceTicket({ status: "Closed", closed_reason: "Test complete" }),
      receipts,
    );

    expect(handoff.status).toBe("App Test ticket closed");
    expect(handoff.blocker).toMatch(/physical work.*remain unproven/i);
    expect(handoff.receipt_count).toBe(6);
  });

  it("uses the newest Lease receipt as the bodyless evidence identity", () => {
    const receipts = [
      leaseReceipt("gmail.renewal_notice.draft_create"),
      {
        ...leaseReceipt("gmail.renewal_notice.send"),
        id: "newest-receipt",
        created_at: "2026-07-18T02:00:00.000Z",
      },
    ];
    expect(
      buildLeaseTestOperationalHandoff(leaseRun(), receipts, []).evidence_identity,
    ).toBe("newest-receipt");
  });
});
