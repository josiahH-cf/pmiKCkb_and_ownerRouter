import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { OWNER_PROOF_WINDOW_OPEN_KEYS } from "@/lib/integrations/action-registry-seed";
import type {
  SheetWritebackDependencies,
  SheetWritebackWriter,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import type { SheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

const HEADER = [
  "Have we confirmed pricing with the owner? ",
  "Have we sent the renewal letter? ",
  "What is the Lease/Tenant name?",
  "Renewal Date",
  "Current Rent ",
];

const mocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" as string },
  deps: null as SheetWritebackDependencies | { status: "not_configured" } | null,
  proposals: new Map<string, SheetWritebackProposal>(),
  gateOpen: false,
  writerMutations: [] as string[],
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: vi.fn(async () => mocks.user),
}));

// The production-bound suspension reader would hang without Firestore in the unit env; an
// immediate throw exercises the same fail-closed unreadable path deterministically.
vi.mock("@/lib/firestore/runtime-action-suspensions", async (importActual) => ({
  ...(await importActual<
    typeof import("@/lib/firestore/runtime-action-suspensions")
  >()),
  readRuntimeActionSuspension: vi.fn(async () => {
    throw new Error("suspension store unreadable in unit env");
  }),
}));

vi.mock("@/lib/environment/descriptor", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/environment/descriptor")>()),
  requireEnvironmentDescriptor: () => ({
    environmentKind: "production",
    dataContext: "live",
    source: "explicit",
  }),
}));

vi.mock("@/lib/lease-renewal/sheet-writeback/live", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/lease-renewal/sheet-writeback/live")>();
  return {
    ...actual,
    liveOperatingSheetId: () => "sheet-live-1",
    buildLiveSheetWritebackDeps: () => mocks.deps ?? { status: "not_configured" },
    assertSheetWritebackV2ExecutionAllowed: async (
      descriptor: Parameters<typeof actual.assertSheetWritebackV2ExecutionAllowed>[0],
      mode: "mutating" | "recovery",
      actionKey?: string,
    ) => {
      // The happy path stands in for an activated key; the closed path exercises the REAL
      // committed-seed gate so the refusal below is the production refusal, not a stub.
      if (mode === "mutating" && mocks.gateOpen) return;
      return actual.assertSheetWritebackV2ExecutionAllowed(descriptor, mode, actionKey);
    },
  };
});

vi.mock("@/lib/lease-renewal/sheet-writeback/proposal-store", () => ({
  saveSheetWritebackProposal: vi.fn(
    async (_actor: unknown, proposal: SheetWritebackProposal) => {
      mocks.proposals.set("active", proposal);
    },
  ),
  getSheetWritebackProposal: vi.fn(async () => mocks.proposals.get("active") ?? null),
  discardSheetWritebackProposal: vi.fn(async () => {
    mocks.proposals.delete("active");
  }),
}));

vi.mock("@/lib/integrations/rentvine/client", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/integrations/rentvine/client")>();
  return {
    ...actual,
    RentVineClient: class {
      async getLease(leaseId: string) {
        return { lease: { leaseID: leaseId, propertyID: "84" } };
      }
    },
  };
});

import { POST } from "@/app/api/lease-renewal/operating-sheet/route";

const state = {
  header: [...HEADER],
  rows: [] as { values: string[]; note: string }[],
};

function letterToIndex(letters: string): number {
  let value = 0;
  for (const letter of letters) {
    value = value * 26 + (letter.charCodeAt(0) - 64);
  }
  return value - 1;
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

function fakeDeps(): SheetWritebackDependencies {
  const writer: SheetWritebackWriter = {
    async getValues(_spreadsheetId, range) {
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
      return 77;
    },
    async appendRowWithNote(input) {
      mocks.writerMutations.push("append");
      state.rows.push({ values: [...input.values], note: input.note });
    },
    async deleteExactRow(input) {
      mocks.writerMutations.push("delete");
      state.rows.splice(input.rowNumber - 2, 1);
    },
    async getColumnNotes(input) {
      return state.rows
        .map((row, index) => ({
          rowNumber: index + 2,
          value: row.values[input.columnIndex] ?? "",
          note: row.note,
        }))
        .filter(
          (entry) =>
            entry.rowNumber >= input.startRowNumber &&
            entry.rowNumber <= input.endRowNumber,
        );
    },
    async replaceCellIfExactMatch(_spreadsheetId, range, expected, replacement) {
      mocks.writerMutations.push("cas");
      const parsed = parseRange(range);
      const row = state.rows[parsed.startRow - 2];
      if (!row) return false;
      if ((row.values[parsed.startColumn] ?? "") !== expected) return false;
      row.values[parsed.startColumn] = replacement;
      return true;
    },
  };
  return {
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    } as never,
    store: new MemoryExternalExecutionStore(),
    createWriter: () => writer,
    gateFor: () => ({
      isExecutable: async () => mocks.gateOpen,
      run: async (effect) => {
        if (!mocks.gateOpen) throw new Error("gate closed");
        return effect();
      },
    }),
    writeFlagEnabled: () => mocks.gateOpen,
  };
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/lease-renewal/operating-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("S98 operating-sheet route", () => {
  beforeEach(() => {
    mocks.user = { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" };
    mocks.deps = fakeDeps();
    mocks.proposals.clear();
    mocks.gateOpen = false;
    mocks.writerMutations = [];
    state.header = [...HEADER];
    state.rows = [];
    process.env.RENTVINE_API_BASE_URL = "https://rentvine.invalid";
    process.env.RENTVINE_API_KEY = "unit-key";
    process.env.RENTVINE_API_SECRET = "unit-secret";
  });

  it("lets an Editor propose an append from the fresh header with server-resolved identity", async () => {
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    const response = await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      proposal: { effects: { effect: Record<string, unknown> }[] };
    };
    const effect = payload.proposal.effects[0].effect;
    expect(effect.propertyId).toBe("84");
    expect(String(effect.operationId)).toMatch(/^op-/);
    expect(effect.mode).toBe("normal");
    expect(mocks.writerMutations).toEqual([]);
  });

  it("captures the fresh expected value and anchor for a field update proposal", async () => {
    state.rows = [{ values: ["", "", "Existing Tenant", "", "999"], note: "" }];
    const response = await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [
        {
          kind: "field_update",
          field: "current_rent",
          rowNumber: 2,
          afterValue: "1200",
          source: "RentVine base rent",
        },
      ],
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      proposal: { effects: { effect: Record<string, unknown> }[] };
    };
    const effect = payload.proposal.effects[0].effect;
    expect(effect.expectedValue).toBe("999");
    expect(effect.anchorTenantName).toBe("Existing Tenant");
    expect(mocks.writerMutations).toEqual([]);
  });

  it("refuses Admin execution through the real committed-seed gate before any mutation", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("active")!;
    const execute = await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(execute.status).toBe(409);
    const payload = (await execute.json()) as { error_type: string };
    // Outside a proof window the committed seed refuses; inside the append window the seed term
    // passes and the fail-closed runtime-suspension read (unreadable in unit env) refuses instead.
    expect(payload.error_type).toBe(
      OWNER_PROOF_WINDOW_OPEN_KEYS.includes("google_sheets.renewal_checklist.row_append")
        ? "action_runtime_suspended"
        : "action_not_production_allowed",
    );
    expect(mocks.writerMutations).toEqual([]);
  });

  it("never lets an Editor execute even with a valid confirmation", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("active")!;
    mocks.gateOpen = true;
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    const execute = await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(execute.status).toBeGreaterThanOrEqual(400);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("executes one confirmed append once and reports the duplicate durably", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("active")!;
    mocks.gateOpen = true;
    const first = await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(first.status).toBe(200);
    const outcome = (await first.json()) as {
      status: string;
      duplicate: boolean;
      appended_row_number?: number;
    };
    expect(outcome.status).toBe("executed");
    expect(outcome.duplicate).toBe(false);
    expect(outcome.appended_row_number).toBe(2);
    expect(mocks.writerMutations.filter((entry) => entry === "append")).toHaveLength(1);

    const second = await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { duplicate: boolean }).duplicate).toBe(true);
    expect(mocks.writerMutations.filter((entry) => entry === "append")).toHaveLength(1);
  });

  it("rejects a stale preview hash without consuming the attempt", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("active")!;
    mocks.gateOpen = true;
    const execute = await post({
      operation: "execute",
      previewHash: "a".repeat(64),
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(execute.status).toBe(409);
    const payload = (await execute.json()) as { error_type: string };
    expect(payload.error_type).toBe("confirmation_invalid");
    expect(mocks.writerMutations).toEqual([]);
  });

  it("reports status and discards without touching the provider", async () => {
    const empty = await post({ operation: "status" });
    expect(((await empty.json()) as { proposal: unknown }).proposal).toBeNull();
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const status = await post({ operation: "status" });
    const payload = (await status.json()) as { effects: { state: string }[] };
    expect(payload.effects[0].state).toBe("not_started");
    const discard = await post({ operation: "discard" });
    expect(discard.status).toBe(200);
    expect(mocks.proposals.has("active")).toBe(false);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("previews and executes a receipt-bound row deletion for an executed append", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("active")!;
    mocks.gateOpen = true;
    await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });

    const preview = await post({
      operation: "reverse_preview",
      effectHash: proposal.effects[0].effectHash,
    });
    expect(preview.status).toBe(200);
    const previewPayload = (await preview.json()) as {
      reversal: {
        reversalExecutionId: string;
        forwardExecutionId: string;
        previewHash: string;
        expiresAtIso: string;
        kind: string;
        currentRowNumber?: number;
      };
    };
    expect(previewPayload.reversal.kind).toBe("delete_appended_row");

    const reverse = await post({
      operation: "reverse_execute",
      effectHash: proposal.effects[0].effectHash,
      reversal: previewPayload.reversal,
      confirm: true,
    });
    expect(reverse.status).toBe(200);
    const reversed = (await reverse.json()) as { status: string; duplicate: boolean };
    expect(reversed.status).toBe("reversed");
    expect(reversed.duplicate).toBe(false);
    expect(state.rows).toHaveLength(0);
    expect(mocks.writerMutations.filter((entry) => entry === "delete")).toHaveLength(1);
  });

  it("reports not_configured instead of failing when the sheet binding is absent", async () => {
    mocks.deps = { status: "not_configured" };
    const response = await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("not_configured");
  });

  it("rejects a proof-mode marker and unknown fields structurally at the boundary", async () => {
    const response = await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [
        {
          kind: "row_append",
          leaseId: "115",
          tenantName: "Fresh Real Tenant",
          mode: "proof",
        },
      ],
    });
    expect(response.status).toBe(400);
    expect(mocks.writerMutations).toEqual([]);
  });
});
