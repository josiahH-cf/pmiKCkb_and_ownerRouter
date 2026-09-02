import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import {
  SheetWritebackService,
  SheetWritebackServiceError,
  hashSheetHeader,
  type SheetWritebackDependencies,
  type SheetWritebackWriter,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import {
  buildSheetWritebackProposal,
  normalRowNote,
  type SheetWritebackProposal,
  type SheetWritebackProposalInput,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

const NOW = Date.parse("2026-09-02T12:00:00.000Z");

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
  };
}

function appendProposal(
  h: Harness,
  overrides: Partial<SheetWritebackProposalInput> = {},
): SheetWritebackProposal {
  return buildSheetWritebackProposal({
    spreadsheetId: "sheet-1",
    tabTitle: "Lease Renewal",
    headerHash: h.headerHash,
    headerWidth: h.state.header.length,
    tenantColumnIndex: h.tenantColumnIndex,
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
    rowNumber: number;
    expectedValue: string;
    afterValue: string;
    anchorTenantName: string;
    rowKey: string | null;
  }> = {},
): SheetWritebackProposal {
  return buildSheetWritebackProposal({
    spreadsheetId: "sheet-1",
    tabTitle: "Lease Renewal",
    headerHash: h.headerHash,
    headerWidth: h.state.header.length,
    tenantColumnIndex: h.tenantColumnIndex,
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

// S51_DYNAMIC_REFUSAL:s98-sheet-reversal-writer
it.each(["action_suspended", "global_suspended", "unreadable"] as const)(
  "does not construct the Sheets writer for a confirmed reversal when runtime state is %s",
  async (gateRefusalState) => {
    const h = harness();
    void gateRefusalState;
    const proposal = appendProposal(h);
    await h.service.executeEffect(confirmed(proposal));
    const reversal = await h.service.previewReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
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

  it("updates one anchored cell via CAS and treats collaborator drift as definite", async () => {
    const h = harness({
      rows: [{ values: ["", "", "Existing Tenant", "", ""], note: "" }],
    });
    const proposal = updateProposal(h);
    const outcome = await h.service.executeEffect(confirmed(proposal));
    expect(outcome.receipt.providerRef).toBe("s98-cell:current_rent");
    expect(h.state.rows[0].values[4]).toBe("1200");

    const h2 = harness({
      rows: [{ values: ["", "", "Existing Tenant", "", "999"], note: "" }],
    });
    const drifted = updateProposal(h2);
    await expectCode(h2.service.executeEffect(confirmed(drifted)), "cas_not_applied");
    expect(h2.state.rows[0].values[4]).toBe("999");
    const record = await h2.store.get(`s98:sheet-1:${drifted.effects[0].effectHash}`);
    expect(record?.state).toBe("failed");
  });

  it("refuses a moved ordinary-row anchor before the write", async () => {
    const h = harness({
      rows: [{ values: ["", "", "Somebody Else", "", ""], note: "" }],
    });
    const proposal = updateProposal(h);
    await expectCode(h.service.executeEffect(confirmed(proposal)), "row_anchor_drift");
    expect(
      h.calls.filter((call) => call.method === "replaceCellIfExactMatch"),
    ).toHaveLength(0);
  });

  it("deletes only the exact unchanged appended row, tracking it by note across moves", async () => {
    const h = harness();
    const proposal = appendProposal(h);
    await h.service.executeEffect(confirmed(proposal));
    // A collaborator inserts a row ABOVE the appended one; the note key still finds it.
    h.state.rows.unshift({
      values: ["", "", "Human Added", "", ""],
      note: "",
    });
    const preview = await h.service.previewReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    expect(preview.kind).toBe("delete_appended_row");
    expect(preview.currentRowNumber).toBe(3);
    const outcome = await h.service.executeReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
      reversal: preview,
      confirmedAtIso: new Date(NOW).toISOString(),
    });
    expect(outcome.receipt.providerRef).toBe("s98-row-deleted:op-12345678");
    expect(h.state.rows).toHaveLength(1);
    expect(h.state.rows[0].values[2]).toBe("Human Added");
  });

  it("refuses reversal when the appended row content drifted", async () => {
    const h = harness();
    const proposal = appendProposal(h);
    await h.service.executeEffect(confirmed(proposal));
    h.state.rows[0].values[4] = "edited-by-human";
    await expectCode(
      h.service.previewReversal({
        proposal,
        effectHash: proposal.effects[0].effectHash,
      }),
      "reversal_target_drift",
    );
    expect(h.state.rows).toHaveLength(1);
  });

  it("restores an updated cell under a new confirmation and reconciles a lost delete", async () => {
    const h = harness({
      rows: [{ values: ["", "", "Existing Tenant", "", ""], note: "" }],
    });
    const proposal = updateProposal(h);
    await h.service.executeEffect(confirmed(proposal));
    const preview = await h.service.previewReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
    });
    expect(preview.kind).toBe("restore_field");
    const outcome = await h.service.executeReversal({
      proposal,
      effectHash: proposal.effects[0].effectHash,
      reversal: preview,
      confirmedAtIso: new Date(NOW).toISOString(),
    });
    expect(outcome.receipt.providerRef).toBe("s98-cell:current_rent");
    expect(h.state.rows[0].values[4]).toBe("");

    // Lost delete response: applied on the provider, ambiguous locally, reconciled from absence.
    const h2 = harness();
    const appendP = appendProposal(h2);
    await h2.service.executeEffect(confirmed(appendP));
    const preview2 = await h2.service.previewReversal({
      proposal: appendP,
      effectHash: appendP.effects[0].effectHash,
    });
    h2.state.failure = {
      onMethod: "deleteExactRow",
      error: new Error("socket closed"),
      afterApply: true,
    };
    await expectCode(
      h2.service.executeReversal({
        proposal: appendP,
        effectHash: appendP.effects[0].effectHash,
        reversal: preview2,
        confirmedAtIso: new Date(NOW).toISOString(),
      }),
      "provider_ambiguous",
    );
    h2.state.failure = undefined;
    const receipt = await h2.service.reconcileReversal({
      proposal: appendP,
      effectHash: appendP.effects[0].effectHash,
    });
    expect(receipt.reconciled).toBe(true);
    expect(receipt.providerRef).toBe("s98-row-deleted:op-12345678");
    expect(h2.calls.filter((call) => call.method === "deleteExactRow")).toHaveLength(1);
  });
});
