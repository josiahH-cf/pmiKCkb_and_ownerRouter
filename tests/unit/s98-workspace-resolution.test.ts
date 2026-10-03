import { describe, expect, it } from "vitest";

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
  effectForFreshLeaseContext,
  effectForWorkingCurrentRent,
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
    association: { kind: "exact_link", rowNumber: 41 },
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

// S160: the current-rent update is bound to the lease's working current rent; no resolution or
// approval record takes part. The value is the binding.
const WORKING = { workingCurrentRent: 1200 };

function proposal(
  current = context(),
  workingCurrentRent = 1200,
): SheetWritebackProposal {
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
    effects: [effectForWorkingCurrentRent(current, workingCurrentRent)],
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

  it("S160: accepts only the exact current row, value and source for the working current rent", () => {
    const current = context();
    expect(() =>
      assertProposalMatchesFreshLeaseContext(proposal(current), current, WORKING),
    ).not.toThrow();
    expect(proposal(current).effects[0].effect).toMatchObject({
      field: "current_rent",
      expectedValue: "999",
      afterValue: "1200",
      source: "Working current rent",
      staffIntent: { field: "current_rent", value: 1200 },
    });
  });

  it("S160: rejects a changed or cleared working current rent before a provider effect", () => {
    const current = context();
    expectCode(
      () =>
        assertProposalMatchesFreshLeaseContext(proposal(current), current, {
          workingCurrentRent: 1250,
        }),
      "working_value_changed",
    );
    expectCode(
      () =>
        assertProposalMatchesFreshLeaseContext(proposal(current), current, {
          workingCurrentRent: null,
        }),
      "working_value_missing",
    );
    expectCode(() => effectForWorkingCurrentRent(current, null), "working_value_missing");
  });

  it("S160: a Sheet cell that already shows the working value has nothing to update", () => {
    expectCode(() => effectForWorkingCurrentRent(context(), 999), "no_change");
  });

  it("S158: a selected location that is read-only refuses the update with its own limit", () => {
    const limited = context({
      targetRefusal: {
        code: "selected_row_not_writable",
        message: "Row 41 stays readable, but the app does not update it.",
      },
    });
    expectCode(
      () => effectForWorkingCurrentRent(limited, 1200),
      "selected_row_not_writable",
    );
    expectCode(
      () => assertProposalMatchesFreshLeaseContext(proposal(context()), limited, WORKING),
      "proposal_stale",
    );
  });

  it("S116/S158: an append is prepared only from a confirmed absence", () => {
    expectCode(
      () => effectForFreshLeaseContext(context(), "op-12345678"),
      "row_state_mismatch",
    );
    const absent = context({ association: { kind: "absent_confirmed" }, row: null });
    expect(effectForFreshLeaseContext(absent, "op-12345678")).toMatchObject({
      kind: "row_append",
      leaseId: "115",
      propertyId: "84",
      tenantName: "Exact Tenant",
    });
  });

  it("rejects cross-lease scope, edited row number, value, and source", () => {
    const current = context();
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
        () => assertProposalMatchesFreshLeaseContext(changed, current, WORKING),
        "proposal_stale",
      );
    }
  });
});
