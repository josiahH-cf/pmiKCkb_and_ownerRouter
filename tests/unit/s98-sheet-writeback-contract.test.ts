import { describe, expect, it } from "vitest";

import {
  PROOF_NOTE_PREFIX,
  RETIRED_BROAD_SHEET_WRITEBACK_KEY,
  SHEET_FIELD_UPDATE_KEY,
  SHEET_ROW_APPEND_KEY,
  SHEET_SUPPORTED_FIELDS,
  SheetWritebackContractError,
  assertSheetWritebackConfirmation,
  buildSheetWritebackProposal,
  normalRowNote,
  parseRowNote,
  proofRowNote,
  type SheetWritebackProposalInput,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

const NOW = Date.parse("2026-09-02T12:00:00.000Z");
const HEADER_HASH = "a".repeat(64);

function baseInput(
  overrides: Partial<SheetWritebackProposalInput> = {},
): SheetWritebackProposalInput {
  return {
    spreadsheetId: "sheet-1",
    tabTitle: "Lease Renewal",
    headerHash: HEADER_HASH,
    headerWidth: 19,
    tenantColumnIndex: 2,
    actorUid: "admin-1",
    actorEmail: "admin@pmikcmetro.com",
    actorRole: "Admin",
    sourceReadAtIso: new Date(NOW - 1_000).toISOString(),
    evidenceRef: "workspace:115",
    effects: [
      {
        kind: "row_append",
        mode: "normal",
        operationId: "op-12345678",
        leaseId: "115",
        propertyId: "84",
        tenantName: "Fresh Real Tenant",
        fields: {},
      },
    ],
    nowMs: NOW,
    ...overrides,
  };
}

function expectCode(fn: () => unknown, code: string): void {
  let error: unknown;
  try {
    fn();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(SheetWritebackContractError);
  expect((error as SheetWritebackContractError).code).toBe(code);
}

describe("S98 proposal contract", () => {
  it("pins the exact two keys, the retired broad identifier, and the 19-field allowlist", () => {
    expect(SHEET_ROW_APPEND_KEY).toBe("google_sheets.renewal_checklist.row_append");
    expect(SHEET_FIELD_UPDATE_KEY).toBe("google_sheets.renewal_checklist.field_update");
    expect(RETIRED_BROAD_SHEET_WRITEBACK_KEY).toBe(
      "google_sheets.renewal_checklist.writeback",
    );
    expect(SHEET_SUPPORTED_FIELDS).toHaveLength(19);
    expect(SHEET_SUPPORTED_FIELDS).toContain("tenant_name");
    expect(SHEET_SUPPORTED_FIELDS).toContain("renewal_date");
    expect(SHEET_SUPPORTED_FIELDS).toContain("current_rent");
    expect(SHEET_SUPPORTED_FIELDS).toContain("utility_proof");
  });

  it("builds an append with ordered effects, the delete reversal, and a stable preview hash", () => {
    const proposal = buildSheetWritebackProposal(baseInput());
    expect(proposal.effects).toHaveLength(1);
    expect(proposal.effects[0].actionKey).toBe(SHEET_ROW_APPEND_KEY);
    expect(proposal.effects[0].reversal).toEqual({
      kind: "delete_appended_row",
      operationId: "op-12345678",
    });
    const again = buildSheetWritebackProposal(baseInput());
    expect(again.previewHash).toBe(proposal.previewHash);
  });

  it("refuses unsupported fields, blank tenant, missing sources, and non-server identity", () => {
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({
            effects: [
              {
                kind: "row_append",
                mode: "normal",
                operationId: "op-12345678",
                leaseId: "115",
                propertyId: "84",
                tenantName: "T",
                fields: { arbitrary_column: { value: "x", source: "s" } },
              },
            ],
          }),
        ),
      "field_unsupported",
    );
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({
            effects: [
              {
                kind: "row_append",
                mode: "normal",
                operationId: "op-12345678",
                leaseId: "115",
                propertyId: "84",
                tenantName: "   ",
                fields: {},
              },
            ],
          }),
        ),
      "tenant_name_required",
    );
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({
            effects: [
              {
                kind: "row_append",
                mode: "normal",
                operationId: "op-12345678",
                leaseId: "lease-115",
                propertyId: "84",
                tenantName: "T",
                fields: {},
              },
            ],
          }),
        ),
      "identity_invalid",
    );
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({
            effects: [
              {
                kind: "row_append",
                mode: "normal",
                operationId: "op-12345678",
                leaseId: "115",
                propertyId: "84",
                tenantName: "T",
                fields: { current_rent: { value: "1200", source: "" } },
              },
            ],
          }),
        ),
      "field_source_required",
    );
  });

  it("never infers renewal_date and keeps every proof-row field blank", () => {
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({
            effects: [
              {
                kind: "row_append",
                mode: "normal",
                operationId: "op-12345678",
                leaseId: "115",
                propertyId: "84",
                tenantName: "T",
                fields: {
                  renewal_date: { value: "2026-06-30", source: "RentVine endDate" },
                },
              },
            ],
          }),
        ),
      "renewal_date_unconfirmed",
    );
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({
            effects: [
              {
                kind: "row_append",
                mode: "proof",
                operationId: "op-12345678",
                leaseId: "115",
                propertyId: "84",
                tenantName: "T",
                fields: { current_rent: { value: "1200", source: "RentVine" } },
              },
            ],
          }),
        ),
      "proof_fields_blank",
    );
  });

  it("validates field updates: allowlist, anchored row, changed value, and named source", () => {
    const update = {
      kind: "field_update" as const,
      field: "current_rent",
      rowNumber: 525,
      rowKey: null,
      anchorTenantName: "TEST ROW",
      expectedValue: "",
      afterValue: "1200",
      source: "RentVine base rent",
    };
    const proposal = buildSheetWritebackProposal(baseInput({ effects: [update] }));
    expect(proposal.effects[0].actionKey).toBe(SHEET_FIELD_UPDATE_KEY);
    expect(proposal.effects[0].reversal).toEqual({
      kind: "restore_field",
      field: "current_rent",
      rowNumber: 525,
      rowKey: null,
      restoreValue: "",
    });

    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({ effects: [{ ...update, field: "not_a_field" }] }),
        ),
      "field_unsupported",
    );
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({ effects: [{ ...update, rowNumber: 1 }] }),
        ),
      "row_anchor_invalid",
    );
    expectCode(
      () =>
        buildSheetWritebackProposal(
          baseInput({ effects: [{ ...update, afterValue: "" }] }),
        ),
      "no_change",
    );
    expectCode(
      () =>
        buildSheetWritebackProposal(baseInput({ effects: [{ ...update, source: " " }] })),
      "field_source_required",
    );
  });

  it("round-trips both note formats and rejects foreign notes", () => {
    const identity = { operationId: "op-12345678", leaseId: "115", propertyId: "84" };
    const normal = normalRowNote(identity);
    const proof = proofRowNote(identity);
    expect(proof.startsWith(PROOF_NOTE_PREFIX)).toBe(true);
    expect(parseRowNote(normal)).toEqual({ proof: false, ...identity });
    expect(parseRowNote(proof)).toEqual({ proof: true, ...identity });
    expect(parseRowNote("just a human comment")).toBeNull();
    expect(parseRowNote("")).toBeNull();
  });

  it("binds confirmations to the exact proposal, effect, and unexpired window", () => {
    const proposal = buildSheetWritebackProposal(baseInput());
    const effect = proposal.effects[0];
    const good = {
      previewHash: proposal.previewHash,
      effectHash: effect.effectHash,
      confirmedAtIso: new Date(NOW).toISOString(),
    };
    assertSheetWritebackConfirmation({
      proposal,
      effect,
      confirmation: good,
      nowMs: NOW,
    });
    expectCode(
      () =>
        assertSheetWritebackConfirmation({
          proposal,
          effect,
          confirmation: { ...good, previewHash: "b".repeat(64) },
          nowMs: NOW,
        }),
      "confirmation_mismatch",
    );
    expectCode(
      () =>
        assertSheetWritebackConfirmation({
          proposal,
          effect,
          confirmation: good,
          nowMs: NOW + 11 * 60 * 1_000,
        }),
      "confirmation_expired",
    );
  });
});
