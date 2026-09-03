import { describe, expect, it } from "vitest";

import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import { hashSheetHeader } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  buildSheetWritebackProposal,
  normalRowNote,
  proofRowNote,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SheetWorkspaceResolutionError,
  assertProposalMatchesFreshLeaseContext,
  authorizedCurrentRentUpdateFromRecords,
  effectForFreshLeaseContext,
  exactOperatingSheetRowIndexes,
  type FreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";

const FINGERPRINT = `rcf1_${"a".repeat(64)}`;
const TRIGGER = "lease_renewal:reconcile:live-review:key:current_rent";
const HEADER = ["Tenant", "Current Rent"];
const COLUMNS = new Map([
  ["tenant_name", 0],
  ["current_rent", 1],
]);

function context(overrides: Partial<FreshOperatingSheetLeaseContext> = {}) {
  return {
    leaseId: "115",
    propertyId: "84",
    tenantName: "Exact Tenant",
    sourceReadAtIso: "2026-09-02T12:00:00.000Z",
    header: HEADER,
    columns: COLUMNS,
    tenantColumnIndex: 0,
    row: {
      rowNumber: 41,
      rowKey: null,
      anchorTenantName: "Exact Tenant",
      currentRentValue: "999",
      currentRentSourceTriggerKey: TRIGGER,
      currentRentCandidateFingerprint: FINGERPRINT,
    },
    ...overrides,
  } satisfies FreshOperatingSheetLeaseContext;
}

function resolution(
  overrides: Partial<LeaseRenewalResolutionRecord> = {},
): LeaseRenewalResolutionRecord {
  return {
    id: "resolution-key",
    source_trigger_key: TRIGGER,
    run_id: "live-review",
    field_key: "current_rent",
    field_label: "Current rent",
    candidate_fingerprint: FINGERPRINT,
    severity: "High",
    status: "Resolved",
    resolution_kind: "pick_source",
    chosen_source: "rentvine",
    reason: "RentVine is the confirmed current source.",
    resolved_by_uid: "editor-1",
    proposed_writeback: {
      field_key: "current_rent",
      value: "1200",
      source_of_value: "rentvine",
      status: "Queued",
      production_allowed: false,
    },
    created_at: "2026-09-02T11:00:00.000Z",
    updated_at: "2026-09-02T11:30:00.000Z",
    ...overrides,
  };
}

function approval(
  overrides: Partial<LeaseRenewalWritebackApprovalRecord> = {},
): LeaseRenewalWritebackApprovalRecord {
  return {
    id: "approval-key",
    source_trigger_key: TRIGGER,
    run_id: "live-review",
    field_key: "current_rent",
    field_label: "Current rent",
    candidate_fingerprint: FINGERPRINT,
    resolution_updated_at: "2026-09-02T11:30:00.000Z",
    severity: "High",
    state: "Approved",
    proposed_value: "1200",
    source_of_value: "rentvine",
    reason: "Use the exact RentVine base rent.",
    decided_by_uid: "admin-2",
    production_allowed: false,
    executed: false,
    created_at: "2026-09-02T11:31:00.000Z",
    updated_at: "2026-09-02T11:31:00.000Z",
    ...overrides,
  };
}

function proposal(
  current = context(),
  resolutionRecord = resolution(),
  approvalRecord = approval(),
): SheetWritebackProposal {
  const authorized = authorizedCurrentRentUpdateFromRecords(
    current,
    resolutionRecord,
    approvalRecord,
  );
  return buildSheetWritebackProposal({
    generationId: "proposal-12345678",
    spreadsheetId: "sheet-live-1",
    tabTitle: "Lease Renewal",
    headerHash: hashSheetHeader(HEADER, COLUMNS),
    headerWidth: HEADER.length,
    tenantColumnIndex: 0,
    scope: { kind: "lease_workspace", leaseId: "115", propertyId: "84" },
    actorUid: "editor-1",
    actorEmail: "editor@pmikcmetro.com",
    actorRole: "Editor",
    sourceReadAtIso: current.sourceReadAtIso,
    evidenceRef: "workspace:115:fresh-live-join",
    effects: [effectForFreshLeaseContext(current, authorized, "op-12345678")],
    nowMs: Date.parse("2026-09-02T12:00:00.000Z"),
  });
}

function expectCode(run: () => unknown, code: string) {
  expect(run).toThrowError(SheetWorkspaceResolutionError);
  try {
    run();
  } catch (error) {
    expect((error as SheetWorkspaceResolutionError).code).toBe(code);
  }
}

describe("S98 exact lease-workspace binding", () => {
  it("treats the exact normal system note as a row join and excludes sealed proof rows", () => {
    const notes: (string | null)[][] = [
      [],
      [normalRowNote({ operationId: "op-12345678", leaseId: "115", propertyId: "84" })],
      [proofRowNote({ operationId: "op-87654321", leaseId: "115", propertyId: "84" })],
    ];
    expect(
      exactOperatingSheetRowIndexes({
        rowCount: 3,
        joins: [null, null, "lease:115"],
        notes,
        tenantColumnIndex: 0,
        leaseId: "115",
        propertyId: "84",
      }),
    ).toEqual([1]);
  });

  it("fails closed on a link/note cross-lease conflict or same-lease property conflict", () => {
    expectCode(
      () =>
        exactOperatingSheetRowIndexes({
          rowCount: 1,
          joins: ["lease:116"],
          notes: [
            [
              normalRowNote({
                operationId: "op-12345678",
                leaseId: "115",
                propertyId: "84",
              }),
            ],
          ],
          tenantColumnIndex: 0,
          leaseId: "115",
          propertyId: "84",
        }),
      "row_state_mismatch",
    );
    expectCode(
      () =>
        exactOperatingSheetRowIndexes({
          rowCount: 1,
          joins: [null],
          notes: [
            [
              normalRowNote({
                operationId: "op-12345678",
                leaseId: "115",
                propertyId: "999",
              }),
            ],
          ],
          tenantColumnIndex: 0,
          leaseId: "115",
          propertyId: "84",
        }),
      "row_state_mismatch",
    );
  });

  it("accepts only the exact current source, resolution, approval, row, value, and source", () => {
    const current = context();
    const authorized = authorizedCurrentRentUpdateFromRecords(
      current,
      resolution(),
      approval(),
    );
    expect(() =>
      assertProposalMatchesFreshLeaseContext(proposal(current), current, authorized),
    ).not.toThrow();
  });

  it("rejects source drift before a provider effect", () => {
    const drifted = context({
      row: {
        ...context().row!,
        currentRentCandidateFingerprint: `rcf1_${"c".repeat(64)}`,
      },
    });
    expectCode(
      () => authorizedCurrentRentUpdateFromRecords(drifted, resolution(), approval()),
      "resolution_stale",
    );
  });

  it("rejects a same-value re-resolution until an Admin approves that exact generation", () => {
    const rerResolved = resolution({ updated_at: "2026-09-02T11:45:00.000Z" });
    expectCode(
      () => authorizedCurrentRentUpdateFromRecords(context(), rerResolved, approval()),
      "approval_stale",
    );
  });

  it("rejects a returned or stale approval", () => {
    expectCode(
      () =>
        authorizedCurrentRentUpdateFromRecords(
          context(),
          resolution(),
          approval({ state: "Returned for Revision" }),
        ),
      "approval_stale",
    );
  });

  it("rejects cross-lease scope, edited row number, value, and source", () => {
    const current = context();
    const authorized = authorizedCurrentRentUpdateFromRecords(
      current,
      resolution(),
      approval(),
    );
    const exact = proposal(current);
    const mutations: SheetWritebackProposal[] = [
      { ...exact, scope: { kind: "lease_workspace", leaseId: "116", propertyId: "85" } },
      {
        ...exact,
        effects: [
          {
            ...exact.effects[0],
            effect: { ...exact.effects[0].effect, rowNumber: 42 },
          },
        ],
      } as SheetWritebackProposal,
      {
        ...exact,
        effects: [
          {
            ...exact.effects[0],
            effect: { ...exact.effects[0].effect, afterValue: "1300" },
          },
        ],
      } as SheetWritebackProposal,
      {
        ...exact,
        effects: [
          {
            ...exact.effects[0],
            effect: { ...exact.effects[0].effect, source: "caller supplied" },
          },
        ],
      } as SheetWritebackProposal,
    ];
    for (const changed of mutations) {
      expectCode(
        () => assertProposalMatchesFreshLeaseContext(changed, current, authorized),
        "proposal_stale",
      );
    }
  });
});
