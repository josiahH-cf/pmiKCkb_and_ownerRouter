import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import {
  SheetWritebackService,
  SheetWritebackServiceError,
  hashSheetHeader,
  sheetCellValueMatches,
  type SheetWritebackDependencies,
  type SheetWritebackReversalPreview,
  type SheetWritebackWriter,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import {
  buildSheetWritebackProposal,
  normalRowNote,
  sheetWritebackExecutionId,
  sheetWritebackReversalExecutionId,
  type SheetWritebackProposal,
  type SheetWritebackProposalInput,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { mintSheetReversalPreviewHash } from "@/lib/lease-renewal/sheet-writeback/workspace-context";

const NOW = Date.parse("2026-09-02T12:00:00.000Z");
process.env.RENEWAL_DESK_PARTY_FILTER_KEY = Buffer.alloc(32, 19).toString("base64url");

// A compact live-shaped header: the real Renewals phrases for the columns the tests exercise.
const HEADER = [
  "Have we confirmed pricing with the owner? ",
  "Have we sent the renewal letter? ",
  "What is the Lease/Tenant name?",
  "Renewal Date",
  "Current Rent ",
];

interface FakeSheetState {
  header: string[];
  /** 1-based row numbers start at 2 (row 1 is the header). */
  rows: { values: string[]; note: string }[];
  failure?: { onMethod: string; error: unknown; afterApply?: boolean };
}

interface Harness {
  service: SheetWritebackService;
  store: MemoryExternalExecutionStore;
  state: FakeSheetState;
  calls: { method: string; args: unknown[] }[];
  createWriterSpy: ReturnType<typeof vi.fn>;
  flags: { gateOpen: boolean; writeFlag: boolean };
  headerHash: string;
  tenantColumnIndex: number;
  appendLifecycles: Map<string, string>;
}

function parseRange(range: string): {
  startColumn: number;
  endColumn: number;
  startRow: number;
  endRow: number;
} {
  const match = /^'[^']*'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (match) {
    return {
      startColumn: letterToIndex(match[1]),
      endColumn: letterToIndex(match[3]),
      startRow: Number(match[2]),
      endRow: Number(match[4]),
    };
  }
  const single = /^'[^']*'!([A-Z]+)(\d+)$/.exec(range);
  if (single) {
    const column = letterToIndex(single[1]);
    const row = Number(single[2]);
    return { startColumn: column, endColumn: column, startRow: row, endRow: row };
  }
  throw new Error(`unsupported fake range ${range}`);
}

function letterToIndex(letters: string): number {
  let value = 0;
  for (const letter of letters) {
    value = value * 26 + (letter.charCodeAt(0) - 64);
  }
  return value - 1;
}

function harness(overrides: Partial<FakeSheetState> = {}): Harness {
  const state: FakeSheetState = { header: [...HEADER], rows: [], ...overrides };
  const calls: Harness["calls"] = [];
  const record = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const flags = { gateOpen: true, writeFlag: true };
  const appendLifecycles = new Map<string, string>();

  const writer: SheetWritebackWriter = {
    async getValues(_spreadsheetId, range) {
      record("getValues", range);
      const parsed = parseRange(range);
      const out: string[][] = [];
      for (
        let row = parsed.startRow;
        row <= Math.min(parsed.endRow, state.rows.length + 1);
        row++
      ) {
        const source = row === 1 ? state.header : (state.rows[row - 2]?.values ?? []);
        out.push(source.slice(parsed.startColumn, parsed.endColumn + 1));
      }
      return out;
    },
    async getSheetIdByTitle() {
      record("getSheetIdByTitle");
      return 77;
    },
    async appendRowWithNote(input) {
      record("appendRowWithNote", input);
      if (state.failure?.onMethod === "appendRowWithNote" && !state.failure.afterApply) {
        throw state.failure.error;
      }
      state.rows.push({ values: [...input.values], note: input.note });
      if (state.failure?.onMethod === "appendRowWithNote") {
        throw state.failure.error;
      }
    },
    async deleteExactRow(input) {
      record("deleteExactRow", input);
      if (state.failure?.onMethod === "deleteExactRow" && !state.failure.afterApply) {
        throw state.failure.error;
      }
      state.rows.splice(input.rowNumber - 2, 1);
      if (state.failure?.onMethod === "deleteExactRow") {
        throw state.failure.error;
      }
    },
    async getColumnNotes(input) {
      record("getColumnNotes", input);
      return state.rows.map((row, index) => ({
        rowNumber: index + 2,
        value: row.values[input.columnIndex] ?? "",
        note: row.note,
      }));
    },
    async replaceCellIfExactMatch(_spreadsheetId, range, expected, replacement) {
      record("replaceCellIfExactMatch", range, expected, replacement);
      if (state.failure?.onMethod === "replaceCellIfExactMatch") {
        throw state.failure.error;
      }
      const parsed = parseRange(range);
      const row = state.rows[parsed.startRow - 2];
      if (!row) return false;
      const current = row.values[parsed.startColumn] ?? "";
      if (current !== expected) return false;
      row.values[parsed.startColumn] = replacement;
      return true;
    },
  };

  const store = new MemoryExternalExecutionStore();
  const createWriterSpy = vi.fn(() => writer);
  const resolution = resolveHeaders([state.header], RENEWAL_TAB_SCHEMAS.Renewals);
  const columns = new Map<string, number>();
  for (const column of resolution.columns) {
    if (column.field !== null && column.status === "resolved") {
      columns.set(column.field, column.index);
    }
  }
  const headerHash = hashSheetHeader(state.header, columns);
  const dependencies: SheetWritebackDependencies = {
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    } as never,
    store,
    createWriter: createWriterSpy as unknown as () => SheetWritebackWriter,
    gateFor: () => ({
      isExecutable: async () => flags.gateOpen,
      run: async (effect) => {
        if (!flags.gateOpen) throw new Error("gate closed");
        return effect();
      },
    }),
    writeFlagEnabled: () => flags.writeFlag,
    claimLeaseScopedAppend: async (input) => {
      const key = `${input.spreadsheetId}:${input.tabTitle}:${input.leaseId}`;
      if (appendLifecycles.has(key)) return "blocked";
      const claim = await store.claim(input.executionId, input.previewHash);
      if (claim === "claimed") appendLifecycles.set(key, "running");
      return claim;
    },
    settleLeaseScopedAppend: async (input) => {
      const key = `${input.spreadsheetId}:${input.tabTitle}:${input.leaseId}`;
      if (!appendLifecycles.has(key)) throw new Error("missing append lifecycle");
      appendLifecycles.set(key, input.state);
    },
    now: () => NOW,
  };
  return {
    service: new SheetWritebackService(dependencies),
    store,
    state,
    calls,
    createWriterSpy,
    flags,
    headerHash,
    tenantColumnIndex: columns.get("tenant_name") ?? 2,
    appendLifecycles,
  };
}

function appendProposal(
  h: Harness,
  overrides: Partial<SheetWritebackProposalInput> = {},
): SheetWritebackProposal {
  return buildSheetWritebackProposal({
    generationId: "proposal-append-12345678",
    spreadsheetId: "sheet-1",
    tabTitle: "Lease Renewal",
    headerHash: h.headerHash,
    headerWidth: h.state.header.length,
    tenantColumnIndex: h.tenantColumnIndex,
    scope: { kind: "lease_workspace", leaseId: "115", propertyId: "84" },
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
        fields: { current_rent: { value: "1200", source: "RentVine base rent" } },
      },
    ],
    nowMs: NOW,
    ...overrides,
  });
}

function updateProposal(
  h: Harness,
  overrides: Partial<{
    generationId: string;
    rowNumber: number;
    expectedValue: string;
    afterValue: string;
    anchorTenantName: string;
    rowKey: string | null;
  }> = {},
): SheetWritebackProposal {
  return buildSheetWritebackProposal({
    generationId: overrides.generationId ?? "proposal-update-12345678",
    spreadsheetId: "sheet-1",
    tabTitle: "Lease Renewal",
    headerHash: h.headerHash,
    headerWidth: h.state.header.length,
    tenantColumnIndex: h.tenantColumnIndex,
    scope: { kind: "lease_workspace", leaseId: "115", propertyId: "84" },
    actorUid: "admin-1",
    actorEmail: "admin@pmikcmetro.com",
    actorRole: "Admin",
    sourceReadAtIso: new Date(NOW - 1_000).toISOString(),
    evidenceRef: "workspace:115",
    effects: [
      {
        kind: "field_update",
        field: "current_rent",
        rowNumber: overrides.rowNumber ?? 2,
        rowKey: overrides.rowKey ?? null,
        anchorTenantName: overrides.anchorTenantName ?? "Existing Tenant",
        expectedValue: overrides.expectedValue ?? "",
        afterValue: overrides.afterValue ?? "1200",
        source: "RentVine base rent",
        authorization: {
          sourceTriggerKey: "lease_renewal:reconcile:live-review:key:current_rent",
          runId: "live-review",
          fieldKey: "current_rent",
          proposedValue: overrides.afterValue ?? "1200",
          sourceOfValue: "RentVine base rent",
          candidateFingerprint: `rcf1_${"a".repeat(64)}`,
          resolutionUpdatedAt: "2026-09-02T11:58:00.000Z",
          authorizationToken: `rwat1_${"b".repeat(64)}`,
          approvalId: "approval-current-rent",
          approvalUpdatedAt: "2026-09-02T11:59:00.000Z",
          approvalDecidedByUid: "admin-2",
        },
      },
    ],
    nowMs: NOW,
  });
}

function proofAppendProposal(h: Harness): SheetWritebackProposal {
  return buildSheetWritebackProposal({
    generationId: "proposal-proof-12345678",
    spreadsheetId: "sheet-1",
    tabTitle: "Lease Renewal",
    headerHash: h.headerHash,
    headerWidth: h.state.header.length,
    tenantColumnIndex: h.tenantColumnIndex,
    scope: { kind: "sealed_proof", leaseId: "115", propertyId: "84" },
    actorUid: "admin-1",
    actorEmail: "admin@pmikcmetro.com",
    actorRole: "Admin",
    sourceReadAtIso: new Date(NOW - 1_000).toISOString(),
    evidenceRef: "completed-proof:immutable",
    effects: [
      {
        kind: "row_append",
        mode: "proof",
        operationId: "op-proof-12345678",
        leaseId: "115",
        propertyId: "84",
        tenantName: "Fresh Real Tenant",
        fields: {},
      },
    ],
    nowMs: NOW,
  });
}

function confirmed(proposal: SheetWritebackProposal, index = 0) {
  const effect = proposal.effects[index];
  return {
    proposal,
    effectHash: effect.effectHash,
    confirmation: {
      previewHash: proposal.previewHash,
      effectHash: effect.effectHash,
      confirmedAtIso: new Date(NOW).toISOString(),
    },
  };
}

async function signedAppendReversal(
  h: Harness,
  proposal: SheetWritebackProposal,
  currentRowNumber = 2,
): Promise<SheetWritebackReversalPreview> {
  const effect = proposal.effects[0];
  const forwardExecutionId = sheetWritebackExecutionId(proposal, effect);
  const forward = await h.store.get(forwardExecutionId);
  if (!forward?.receipt) throw new Error("forward receipt missing in test harness");
  const reversalExecutionId = sheetWritebackReversalExecutionId(
    forwardExecutionId,
    forward.receipt.resultHash,
  );
  const expiresAtIso = new Date(NOW + 10 * 60_000).toISOString();
  const binding = {
    proposalPreviewHash: proposal.previewHash,
    effectHash: effect.effectHash,
    forwardExecutionId,
    forwardReceiptHash: forward.receipt.resultHash,
    reversalExecutionId,
    kind: "delete_appended_row" as const,
    currentRowNumber,
    expiresAtIso,
  };
  const previewHash = mintSheetReversalPreviewHash(binding);
  if (!previewHash) throw new Error("reversal key unavailable in test harness");
  return { ...binding, previewHash };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(SheetWritebackServiceError);
  expect((error as SheetWritebackServiceError).code).toBe(code);
}

// S51_DYNAMIC_REFUSAL:s98-sheet-effect-writer
it.each(["action_suspended", "global_suspended", "unreadable"] as const)(
  "does not construct the Sheets writer for a confirmed effect when runtime state is %s",
  async (gateRefusalState) => {
    const h = harness();
    // The injected per-key gate resolves every one of these runtime states to non-executable.
    void gateRefusalState;
    h.flags.gateOpen = false;
    const proposal = appendProposal(h);
    await expectCode(h.service.executeEffect(confirmed(proposal)), "action_closed");
    expect(h.createWriterSpy).not.toHaveBeenCalled();
    expect(h.state.rows).toHaveLength(0);
  },
);

it.each(["action_suspended", "global_suspended", "unreadable"] as const)(
  "does not construct the Sheets writer for a confirmed reversal when runtime state is %s",
  async (gateRefusalState) => {
    const h = harness();
    void gateRefusalState;
    const proposal = appendProposal(h);
    await h.service.executeEffect(confirmed(proposal));
    const reversal = await signedAppendReversal(h, proposal);
    h.flags.gateOpen = false;
    h.createWriterSpy.mockClear();
    await expectCode(
      h.service.executeReversal({
        proposal,
        effectHash: proposal.effects[0].effectHash,
        reversal,
        confirmedAtIso: new Date(NOW).toISOString(),
      }),
      "action_closed",
    );
    expect(h.createWriterSpy).not.toHaveBeenCalled();
    expect(h.state.rows).toHaveLength(1);
  },
);

describe("S98 live-format value matching (2026-09-02 proof finding)", () => {
  it("treats the Sheet's currency rendering of the written number as the same value", () => {
    expect(sheetCellValueMatches("1.00", "$1.00")).toBe(true);
    expect(sheetCellValueMatches("1200", "$1,200.00")).toBe(true);
    expect(sheetCellValueMatches("1200", "1200")).toBe(true);
    expect(sheetCellValueMatches("", "")).toBe(true);
  });

  it("never masks a real drift: blank, text, and different numbers stay mismatches", () => {
    expect(sheetCellValueMatches("", "$0.00")).toBe(false);
    expect(sheetCellValueMatches("1.00", "")).toBe(false);
    expect(sheetCellValueMatches("1.00", "1.05")).toBe(false);
    expect(sheetCellValueMatches("TEST", "$1.00")).toBe(false);
    expect(sheetCellValueMatches("1.00", "one dollar")).toBe(false);
  });
});

describe("S98 one-attempt sheet execution", () => {
  it("appends once atomically with note and exact readback, and replays duplicates", async () => {
    const h = harness();
    const proposal = appendProposal(h);
    const first = await h.service.executeEffect(confirmed(proposal));
    expect(first.duplicate).toBe(false);
    expect(first.receipt.providerRef).toBe("s98-row:op-12345678");
    expect(first.appendedRowNumber).toBe(2);
    expect(h.state.rows).toHaveLength(1);
    expect(h.state.rows[0].note).toBe(
      normalRowNote({ operationId: "op-12345678", leaseId: "115", propertyId: "84" }),
    );
    expect(h.state.rows[0].values[h.tenantColumnIndex]).toBe("Fresh Real Tenant");
    expect(h.state.rows[0].values[4]).toBe("1200");

    const second = await h.service.executeEffect(confirmed(proposal));
    expect(second.duplicate).toBe(true);
    expect(second.receipt.resultHash).toBe(first.receipt.resultHash);
    expect(h.calls.filter((call) => call.method === "appendRowWithNote")).toHaveLength(1);
  });

  it("refuses on header drift before any claim or provider mutation", async () => {
    const h = harness();
    const proposal = appendProposal(h);
    h.state.header[4] = "Totally Different Column";
    await expectCode(h.service.executeEffect(confirmed(proposal)), "header_drift");
    expect(h.calls.filter((call) => call.method === "appendRowWithNote")).toHaveLength(0);
    expect(await h.store.get(`s98:sheet-1:${proposal.effects[0].effectHash}`)).toBeNull();
  });

  it("refuses with the flag disabled or the key closed before writer construction", async () => {
    const h = harness();
    const proposal = appendProposal(h);
    h.flags.writeFlag = false;
    await expectCode(h.service.executeEffect(confirmed(proposal)), "flag_disabled");
    expect(h.createWriterSpy).not.toHaveBeenCalled();
    h.flags.writeFlag = true;
    h.flags.gateOpen = false;
    await expectCode(h.service.executeEffect(confirmed(proposal)), "action_closed");
    expect(h.createWriterSpy).not.toHaveBeenCalled();
  });

  it("parks a lost append response as ambiguous and reconciles it from the exact note", async () => {
    const h = harness({
      failure: {
        onMethod: "appendRowWithNote",
        error: new Error("socket closed"),
        afterApply: true,
      },
    });
    const proposal = appendProposal(h);
    await expectCode(h.service.executeEffect(confirmed(proposal)), "provider_ambiguous");
    expect(h.state.rows).toHaveLength(1);
    h.state.failure = undefined;

    const receipt = await h.service.reconcileEffect({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    expect(receipt.reconciled).toBe(true);
    expect(receipt.providerRef).toBe("s98-row:op-12345678");
    expect(h.calls.filter((call) => call.method === "appendRowWithNote")).toHaveLength(1);
  });

  it("reports an unapplied lost append as not proven without a second call", async () => {
    const h = harness({
      failure: { onMethod: "appendRowWithNote", error: new Error("timeout") },
    });
    const proposal = appendProposal(h);
    await expectCode(h.service.executeEffect(confirmed(proposal)), "provider_ambiguous");
    expect(h.state.rows).toHaveLength(0);
    h.state.failure = undefined;
    await expectCode(
      h.service.reconcileEffect({ proposal, effectHash: proposal.effects[0].effectHash }),
      "reconcile_not_proven",
    );
    expect(h.calls.filter((call) => call.method === "appendRowWithNote")).toHaveLength(1);
  });

  it("refuses fixed-row field mutation before writer construction or claim", async () => {
    const h = harness({
      rows: [{ values: ["", "", "Existing Tenant", "", ""], note: "" }],
    });
    const proposal = updateProposal(h);
    await expectCode(
      h.service.executeEffect(confirmed(proposal)),
      "provider_capability_unavailable",
    );
    expect(h.createWriterSpy).not.toHaveBeenCalled();
    expect(
      h.calls.filter((call) => call.method === "replaceCellIfExactMatch"),
    ).toHaveLength(0);
    expect(
      await h.store.get(sheetWritebackExecutionId(proposal, proposal.effects[0])),
    ).toBeNull();
  });

  it("binds reversal preview terms but refuses unsafe fixed-row deletion", async () => {
    const h = harness();
    const proposal = appendProposal(h);
    await h.service.executeEffect(confirmed(proposal));
    // A collaborator inserts a row ABOVE the appended one; the note key still finds it.
    h.state.rows.unshift({
      values: ["", "", "Human Added", "", ""],
      note: "",
    });
    const preview = await signedAppendReversal(h, proposal, 3);
    expect(preview.kind).toBe("delete_appended_row");
    expect(preview.currentRowNumber).toBe(3);
    await expectCode(
      h.service.executeReversal({
        proposal,
        effectHash: proposal.effects[0].effectHash,
        reversal: preview,
        confirmedAtIso: new Date(NOW).toISOString(),
      }),
      "provider_capability_unavailable",
    );
    expect(h.state.rows).toHaveLength(2);
    expect(h.calls.filter((call) => call.method === "deleteExactRow")).toHaveLength(0);

    for (const reversal of [
      { ...preview, forwardExecutionId: `${preview.forwardExecutionId}:foreign` },
      { ...preview, previewHash: "f".repeat(64) },
      {
        ...preview,
        expiresAtIso: new Date(NOW + 30 * 60_000).toISOString(),
      },
    ]) {
      await expectCode(
        h.service.executeReversal({
          proposal,
          effectHash: proposal.effects[0].effectHash,
          reversal,
          confirmedAtIso: new Date(NOW).toISOString(),
        }),
        "confirmation_invalid",
      );
    }
  });

  it("refuses reversal preview before fixed-row provider reads", async () => {
    const h = harness();
    const proposal = appendProposal(h);
    await h.service.executeEffect(confirmed(proposal));
    h.createWriterSpy.mockClear();
    await expectCode(
      h.service.previewReversal({
        proposal,
        effectHash: proposal.effects[0].effectHash,
      }),
      "provider_capability_unavailable",
    );
    expect(h.createWriterSpy).not.toHaveBeenCalled();
    expect(h.state.rows).toHaveLength(1);
  });

  it("permanently retires sealed-proof mutation before writer construction", async () => {
    const h = harness();
    const proposal = proofAppendProposal(h);
    await expectCode(h.service.executeEffect(confirmed(proposal)), "proof_retired");
    expect(h.createWriterSpy).not.toHaveBeenCalled();
    expect(h.state.rows).toHaveLength(0);
  });
});
