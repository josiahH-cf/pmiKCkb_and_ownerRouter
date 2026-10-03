import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import type {
  SheetWritebackDependencies,
  SheetWritebackWriter,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import type { SheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

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
  // S128 (F08): the operating-Sheet write switch, independent of the per-key committed-seed gate.
  // Default true so pre-S128 execute/gate tests are unchanged; S128 cases set it false to pause.
  writeFlagEnabled: true,
  writerMutations: [] as string[],
  resolveContext: vi.fn<(leaseId: string) => Promise<FreshOperatingSheetLeaseContext>>(),
  // S160: the lease's working record (its working current rent) in place of any approval record.
  workingRecord: null as RenewalWorkingRecord | null,
  progress: null as unknown,
}));

vi.mock("@/lib/firestore/renewal-sheet-working-inputs", () => ({
  readSheetWorkingRecord: vi.fn(async () => mocks.workingRecord),
}));

vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  getRenewalProgress: vi.fn(async () => mocks.progress),
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: vi.fn(async () => mocks.user),
}));

// The production-bound suspension reader would hang without Firestore in the unit env; an
// immediate throw exercises the same fail-closed unreadable path deterministically.
vi.mock("@/lib/firestore/runtime-action-suspensions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/firestore/runtime-action-suspensions")>()),
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

vi.mock("@/lib/lease-renewal/sheet-writeback/proposal-store", async () => {
  const { EditableLayerError } = await import("@/lib/firestore/errors");
  return {
    saveSheetWritebackProposal: vi.fn(
      async (
        _actor: unknown,
        proposal: SheetWritebackProposal,
        scope: { leaseId?: string },
        expected: string | null,
      ) => {
        const key = scope.leaseId ?? "proof";
        const current = mocks.proposals.get(key)?.previewHash ?? null;
        if (current !== expected) throw new EditableLayerError("stale proposal", 409);
        mocks.proposals.set(key, proposal);
      },
    ),
    getSheetWritebackProposal: vi.fn(
      async (
        _actor: unknown,
        _sheet: string,
        _tab: string,
        scope: { leaseId?: string },
      ) => mocks.proposals.get(scope.leaseId ?? "proof") ?? null,
    ),
    listSheetWritebackProposalHistory: vi.fn(async () => []),
    discardSheetWritebackProposal: vi.fn(
      async (
        _actor: unknown,
        _sheet: string,
        _tab: string,
        scope: { leaseId?: string },
        expectedPreviewHash: string,
      ) => {
        const key = scope.leaseId ?? "proof";
        if (mocks.proposals.get(key)?.previewHash !== expectedPreviewHash) {
          throw new EditableLayerError("stale or cross-workspace proposal", 409);
        }
        mocks.proposals.delete(key);
      },
    ),
  };
});

vi.mock(
  "@/lib/lease-renewal/sheet-writeback/workspace-context",
  async (importActual) => ({
    ...(await importActual<
      typeof import("@/lib/lease-renewal/sheet-writeback/workspace-context")
    >()),
    verifySheetWorkspaceContext: (token: string) => ({
      leaseId: token.includes("116") ? "116" : "115",
      expiresAtMs: Date.now() + 60_000,
    }),
  }),
);

vi.mock(
  "@/lib/lease-renewal/sheet-writeback/workspace-resolution",
  async (importActual) => ({
    ...(await importActual<
      typeof import("@/lib/lease-renewal/sheet-writeback/workspace-resolution")
    >()),
    resolveFreshOperatingSheetLeaseContext: (leaseId: string) =>
      mocks.resolveContext(leaseId),
  }),
);

import { GET, POST } from "@/app/api/lease-renewal/operating-sheet/route";

const state = {
  header: [...HEADER],
  rows: [] as { values: string[]; note: string }[],
};
const WORKSPACE_CONTEXT = `context-115-${"x".repeat(48)}`;
const CANDIDATE_FINGERPRINT = `rcf1_${"a".repeat(64)}`;

function currentColumns() {
  const resolution = resolveHeaders([state.header], RENEWAL_TAB_SCHEMAS.Renewals);
  const columns = new Map<string, number>();
  for (const column of resolution.columns) {
    if (column.field !== null && column.status === "resolved") {
      columns.set(column.field, column.index);
    }
  }
  return columns;
}

function freshContext(
  leaseId = "115",
  row: FreshOperatingSheetLeaseContext["row"] = null,
): FreshOperatingSheetLeaseContext {
  return {
    leaseId,
    propertyId: leaseId === "115" ? "84" : "85",
    tenantName: leaseId === "115" ? "Fresh Real Tenant" : "Other Tenant",
    sourceReadAtIso: "2026-09-02T12:00:00.000Z",
    header: [...state.header],
    columns: currentColumns(),
    tenantColumnIndex: 2,
    association: row
      ? { kind: "exact_link", rowNumber: row.rowNumber }
      : { kind: "absent_confirmed" },
    row,
  };
}

/** S160: a working record holding the working current rent staff entered. */
function workingRecord(currentRent: number | null): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "115",
    revision: 1,
    fields:
      currentRent === null
        ? {}
        : {
            current_rent: {
              value: currentRent,
              revision: 1,
              eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
              recordedAt: "2026-09-02T11:58:00.000Z",
              recordedByUid: "editor-1",
              recordedByLabel: "editor@pmikcmetro.com",
              origin: "staff_entry",
            },
          },
  };
}

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
  const store = new MemoryExternalExecutionStore();
  const appendLifecycles = new Map<string, string>();
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
    store,
    createWriter: () => writer,
    gateFor: () => ({
      isExecutable: async () => mocks.gateOpen,
      run: async (effect) => {
        if (!mocks.gateOpen) throw new Error("gate closed");
        return effect();
      },
    }),
    writeFlagEnabled: () => mocks.writeFlagEnabled,
    claimLeaseScopedFieldUpdate: (input) =>
      store.claim(input.executionId, input.previewHash),
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
  };
}

function post(body: Record<string, unknown>) {
  const normalized =
    body.operation === "propose" && Array.isArray(body.effects)
      ? {
          operation: "propose",
          workspaceContext: WORKSPACE_CONTEXT,
          intent:
            (body.effects[0] as { kind?: string } | undefined)?.kind === "field_update"
              ? "update_approved_current_rent"
              : "append_missing_row",
          expectedPriorPreviewHash: mocks.proposals.get("115")?.previewHash ?? null,
        }
      : body.operation === "discard" && body.previewHash === undefined
        ? {
            workspaceContext: WORKSPACE_CONTEXT,
            ...body,
            previewHash: mocks.proposals.get("115")?.previewHash,
          }
        : { workspaceContext: WORKSPACE_CONTEXT, ...body };
  return POST(
    new Request("http://localhost/api/lease-renewal/operating-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(normalized),
    }),
  );
}

function postUnmodified(body: Record<string, unknown>) {
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
    vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
    vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
    mocks.user = { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" };
    mocks.deps = fakeDeps();
    mocks.proposals.clear();
    mocks.gateOpen = false;
    mocks.writeFlagEnabled = true;
    mocks.writerMutations = [];
    state.header = [...HEADER];
    state.rows = [];
    mocks.resolveContext.mockReset();
    mocks.resolveContext.mockImplementation(async (leaseId) => freshContext(leaseId));
    mocks.workingRecord = workingRecord(1200);
    process.env.RENTVINE_API_BASE_URL = "https://rentvine.invalid";
    process.env.RENTVINE_API_KEY = "unit-key";
    process.env.RENTVINE_API_SECRET = "unit-secret";
    process.env.RENEWAL_DESK_PARTY_FILTER_KEY = Buffer.alloc(32, 23).toString(
      "base64url",
    );
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

  it("reads status with the same actor-bound context and refuses effect-bearing GETs", async () => {
    const expected = await (await post({ operation: "status" })).json();
    const response = await GET(
      new Request("http://localhost/api/lease-renewal/operating-sheet", {
        headers: { "x-renewal-workspace-context": WORKSPACE_CONTEXT },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(expected);
    for (const query of ["?operation=execute", "?workspaceContext=untrusted"]) {
      expect(
        (
          await GET(
            new Request(`http://localhost/api/lease-renewal/operating-sheet${query}`, {
              headers: { "x-renewal-workspace-context": WORKSPACE_CONTEXT },
            }),
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (await GET(new Request("http://localhost/api/lease-renewal/operating-sheet")))
        .status,
    ).toBe(400);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("S113/S160 prepares the current-rent field proposal from the working current rent without a provider mutation", async () => {
    state.rows = [{ values: ["", "", "Existing Tenant", "", "999"], note: "" }];
    mocks.resolveContext.mockResolvedValue(
      freshContext("115", {
        rowNumber: 2,
        rowKey: null,
        anchorTenantName: "Existing Tenant",
        currentRentValue: "999",
        currentRentSourceTriggerKey:
          "lease_renewal:reconcile:live-review:key:current_rent",
        currentRentCandidateFingerprint: CANDIDATE_FINGERPRINT,
      }),
    );
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
    expect(await response.json()).toMatchObject({ status: "proposed" });
    expect(mocks.resolveContext).toHaveBeenCalled();
    expect(mocks.proposals.get("115")?.effects[0].effect).toMatchObject({
      kind: "field_update",
      field: "current_rent",
      expectedValue: "999",
      afterValue: "1200",
      staffIntent: { field: "current_rent", value: 1200 },
    });
    expect(mocks.writerMutations).toEqual([]);
  });

  it("refuses Admin execution through the real committed-seed gate before any mutation", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("115")!;
    const execute = await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(execute.status).toBe(409);
    const payload = (await execute.json()) as { error_type: string };
    // With the key closed the committed seed refuses; with the key executable (its bounded proof
    // window, or the durable 2026-09-02 activation) the seed term passes and the fail-closed
    // runtime-suspension read (unreadable in unit env) refuses instead.
    const appendExecutable = ACTION_REGISTRY_SEED.some(
      (entry) =>
        entry.key === "google_sheets.renewal_checklist.row_append" &&
        entry.production_allowed === true,
    );
    expect(payload.error_type).toBe(
      appendExecutable ? "action_runtime_suspended" : "action_not_production_allowed",
    );
    expect(mocks.writerMutations).toEqual([]);
  });

  it("S160: lets an Editor confirm a valid confirmation, and never a verification account", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("115")!;
    mocks.gateOpen = true;
    mocks.user = {
      uid: "canary-1",
      email: "canary-editor@pmikcmetro.com",
      role: "Editor",
    };
    const refused = await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(refused.status).toBe(403);
    expect(mocks.writerMutations).toEqual([]);
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    const execute = await post({
      operation: "execute",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(execute.status).toBe(200);
    expect(mocks.writerMutations).toEqual(["append"]);
  });

  it("executes one confirmed append once and reports the duplicate durably", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("115")!;
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

  it("S160: appends the row whatever the recorded owner response says (the S105 gate is retired)", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("115")!;
    mocks.gateOpen = true;
    mocks.progress = { ownerOutcome: { state: "declined_non_renewal" } };
    try {
      const response = await post({
        operation: "execute",
        previewHash: proposal.previewHash,
        effectHash: proposal.effects[0].effectHash,
        confirm: true,
      });
      expect(response.status).toBe(200);
      expect(mocks.writerMutations.filter((entry) => entry === "append")).toHaveLength(1);
    } finally {
      mocks.progress = null;
    }
  });

  it("rejects a stale preview hash without consuming the attempt", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("115")!;
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
    expect(mocks.proposals.has("115")).toBe(false);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("cannot read, discard, overwrite, or execute another lease workspace proposal", async () => {
    await post({ operation: "propose", effects: [{ kind: "row_append" }] });
    const lease115 = mocks.proposals.get("115")!;
    const workspace116 = `context-116-${"y".repeat(48)}`;

    const status = await postUnmodified({
      operation: "status",
      workspaceContext: workspace116,
    });
    expect((await status.json()) as { proposal: unknown }).toMatchObject({
      proposal: null,
    });

    const discard = await postUnmodified({
      operation: "discard",
      workspaceContext: workspace116,
      previewHash: lease115.previewHash,
    });
    expect(discard.status).toBeGreaterThanOrEqual(400);
    expect(mocks.proposals.get("115")?.previewHash).toBe(lease115.previewHash);

    const overwrite = await postUnmodified({
      operation: "propose",
      workspaceContext: workspace116,
      intent: "append_missing_row",
      expectedPriorPreviewHash: lease115.previewHash,
    });
    expect(overwrite.status).toBeGreaterThanOrEqual(400);
    expect(mocks.proposals.get("115")?.previewHash).toBe(lease115.previewHash);

    mocks.gateOpen = true;
    const execute = await postUnmodified({
      operation: "execute",
      workspaceContext: workspace116,
      previewHash: lease115.previewHash,
      effectHash: lease115.effects[0].effectHash,
      confirm: true,
    });
    expect(execute.status).toBe(404);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("refuses reversal preview when no atomic stable-row delete exists", async () => {
    await post({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [{ kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" }],
    });
    const proposal = mocks.proposals.get("115")!;
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
    expect(preview.status).toBe(409);
    expect((await preview.json()) as { error_type: string }).toMatchObject({
      error_type: "provider_capability_unavailable",
    });
    expect(state.rows).toHaveLength(1);
    expect(mocks.writerMutations.filter((entry) => entry === "delete")).toHaveLength(0);
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
    const response = await postUnmodified({
      operation: "propose",
      workspaceContext: WORKSPACE_CONTEXT,
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

  it("S160: refuses a current-rent preparation when the amount the page showed differs from the working current rent", async () => {
    state.rows = [{ values: ["", "", "Existing Tenant", "", "999"], note: "" }];
    mocks.resolveContext.mockResolvedValue(
      freshContext("115", {
        rowNumber: 2,
        rowKey: null,
        anchorTenantName: "Existing Tenant",
        currentRentValue: "999",
        currentRentSourceTriggerKey:
          "lease_renewal:reconcile:live-review:key:current_rent",
        currentRentCandidateFingerprint: CANDIDATE_FINGERPRINT,
      }),
    );
    const response = await postUnmodified({
      operation: "propose",
      workspaceContext: WORKSPACE_CONTEXT,
      intent: "update_approved_current_rent",
      expectedPriorPreviewHash: null,
      expectedCurrentRent: 1199,
    });
    expect(response.status).toBe(409);
    expect(mocks.proposals.size).toBe(0);
    expect(mocks.writerMutations).toEqual([]);
  });
  it("rejects caller-selected lease, tenant, row, value, and source fields", async () => {
    const response = await postUnmodified({
      operation: "propose",
      workspaceContext: WORKSPACE_CONTEXT,
      intent: "update_approved_current_rent",
      expectedPriorPreviewHash: null,
      leaseId: "116",
      tenantName: "Injected Tenant",
      rowNumber: 99,
      afterValue: "1",
      source: "caller",
    });
    expect(response.status).toBe(400);
    expect(mocks.resolveContext).not.toHaveBeenCalled();
    expect(mocks.writerMutations).toEqual([]);
  });

  // S128 (F08): operating-Sheet mutations are paused by owner policy while the write switch is off.
  // Every mutating operation refuses with the exact paused reason before any writer construction, even
  // with an open per-key gate; status surfaces the pause proactively; new proposals refuse while
  // read-only reconciliation stays reachable and app-owned work continues. Nested so the parent
  // beforeEach resets user, deps, the write flag and env for each case.
  describe("S128 operating-sheet write pause", () => {
    async function proposeAppend() {
      await post({
        operation: "propose",
        evidenceRef: "workspace:115",
        effects: [
          { kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" },
        ],
      });
      return mocks.proposals.get("115")!;
    }

    it("refuses an append execute with the paused reason and no writer, even with the key open", async () => {
      const proposal = await proposeAppend();
      // The per-key gate is open; the pause must still preempt every mutating dispatch.
      mocks.gateOpen = true;
      mocks.writeFlagEnabled = false;
      const execute = await post({
        operation: "execute",
        previewHash: proposal.previewHash,
        effectHash: proposal.effects[0].effectHash,
        confirm: true,
      });
      expect(execute.status).toBe(409);
      expect(((await execute.json()) as { error_type: string }).error_type).toBe(
        "writeback_paused",
      );
      expect(mocks.writerMutations).toEqual([]);
      expect(state.rows).toEqual([]);
    });

    it("refuses a field-update execute with the paused reason and no cell mutation", async () => {
      state.rows = [{ values: ["", "", "Existing Tenant", "", "999"], note: "" }];
      mocks.resolveContext.mockResolvedValue(
        freshContext("115", {
          rowNumber: 2,
          rowKey: null,
          anchorTenantName: "Existing Tenant",
          currentRentValue: "999",
          currentRentSourceTriggerKey:
            "lease_renewal:reconcile:live-review:key:current_rent",
          currentRentCandidateFingerprint: CANDIDATE_FINGERPRINT,
        }),
      );
      await post({
        operation: "propose",
        intent: "update_approved_current_rent",
        expectedPriorPreviewHash: null,
      });
      const proposal = mocks.proposals.get("115")!;
      mocks.gateOpen = true;
      mocks.writeFlagEnabled = false;
      const execute = await post({
        operation: "execute",
        previewHash: proposal.previewHash,
        effectHash: proposal.effects[0].effectHash,
        confirm: true,
      });
      expect(execute.status).toBe(409);
      expect(((await execute.json()) as { error_type: string }).error_type).toBe(
        "writeback_paused",
      );
      expect(mocks.writerMutations).toEqual([]);
      expect(state.rows[0].values[4]).toBe("999");
    });

    it("refuses a reverse_execute with the paused reason", async () => {
      const proposal = await proposeAppend();
      mocks.gateOpen = true;
      mocks.writeFlagEnabled = false;
      const reverse = await post({
        operation: "reverse_execute",
        effectHash: proposal.effects[0].effectHash,
        reversal: {
          reversalExecutionId: "rev-1",
          forwardExecutionId: "fwd-1",
          previewHash: "a".repeat(64),
          expiresAtIso: new Date(Date.now() + 60_000).toISOString(),
          kind: "delete_appended_row",
          currentRowNumber: 2,
        },
        confirm: true,
      });
      expect(reverse.status).toBe(409);
      expect(((await reverse.json()) as { error_type: string }).error_type).toBe(
        "writeback_paused",
      );
      expect(mocks.writerMutations).toEqual([]);
    });

    it("refuses proposal creation while paused without creating a backlog", async () => {
      mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
      mocks.writeFlagEnabled = false;
      const response = await post({
        operation: "propose",
        evidenceRef: "workspace:115",
        effects: [
          { kind: "row_append", leaseId: "115", tenantName: "Fresh Real Tenant" },
        ],
      });
      expect(response.status).toBe(409);
      expect((await response.json()).error_type).toBe("writeback_paused");
      expect(mocks.proposals.has("115")).toBe(false);
      expect(mocks.resolveContext).not.toHaveBeenCalled();
      expect(mocks.writerMutations).toEqual([]);
    });

    it("refuses an unexpired old confirmation after a paused release and authorized resume", async () => {
      const proposal = await proposeAppend();
      mocks.gateOpen = true;
      mocks.writeFlagEnabled = false;
      vi.stubEnv("K_REVISION", "pmi-kc-app-test-paused-b");
      await post({ operation: "status" });
      mocks.writeFlagEnabled = true;
      vi.stubEnv("K_REVISION", "pmi-kc-app-test-resumed-c");
      const response = await post({
        operation: "execute",
        previewHash: proposal.previewHash,
        effectHash: proposal.effects[0].effectHash,
        confirm: true,
      });
      expect(response.status).toBe(409);
      expect((await response.json()).error_type).toBe("runtime_stale");
      expect(mocks.writerMutations).toEqual([]);
      const status = await (await post({ operation: "status" })).json();
      expect(status.proposal.requires_fresh_review).toBe(true);
      expect(status.proposal.preview_hash).toBe(proposal.previewHash);
    });

    it("surfaces writeback_paused in status when paused and false when enabled", async () => {
      mocks.writeFlagEnabled = false;
      const paused = (await (await post({ operation: "status" })).json()) as {
        writeback_paused: boolean;
      };
      expect(paused.writeback_paused).toBe(true);
      mocks.writeFlagEnabled = true;
      const enabled = (await (await post({ operation: "status" })).json()) as {
        writeback_paused: boolean;
      };
      expect(enabled.writeback_paused).toBe(false);
      expect(mocks.writerMutations).toEqual([]);
    });

    it("keeps read-only reconcile reachable while paused (not preempted by the pause guard)", async () => {
      const proposal = await proposeAppend();
      mocks.writeFlagEnabled = false;
      const reconcile = await post({
        operation: "reconcile",
        effectHash: proposal.effects[0].effectHash,
      });
      // Reconcile reaches the service instead of the pause guard: with no durable execution it reports
      // execution_missing, never writeback_paused, and constructs no mutation.
      expect(reconcile.status).toBe(409);
      expect(((await reconcile.json()) as { error_type: string }).error_type).toBe(
        "execution_missing",
      );
      expect(mocks.writerMutations).toEqual([]);
    });
  });
});

// S116 adversarial boundary: the audience email intent is prepared only from the server roster;
// a caller cannot supply, omit or misplace the audience, and a tab without the confirmed column
// refuses before any writer exists.
describe("S116 audience email intent boundary", () => {
  beforeEach(() => {
    mocks.writeFlagEnabled = true;
    mocks.writerMutations = [];
    vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
    vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  });
  it("refuses a missing, misplaced or unknown audience without touching the provider", async () => {
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    const missing = await post({
      operation: "propose",
      intent: "update_audience_emails",
      expectedPriorPreviewHash: null,
    });
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await missing.json())).toMatch(/confirmation_invalid/);

    const misplaced = await post({
      operation: "propose",
      intent: "append_missing_row",
      audience: "owner",
      expectedPriorPreviewHash: null,
    });
    expect(misplaced.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await misplaced.json())).toMatch(/confirmation_invalid/);

    const unknown = await post({
      operation: "propose",
      intent: "update_audience_emails",
      audience: "staff",
      expectedPriorPreviewHash: null,
    });
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("refuses the audience update with the missing-column code when the tab has no confirmed header", async () => {
    mocks.user = { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" };
    const response = await post({
      operation: "propose",
      intent: "update_audience_emails",
      audience: "owner",
      expectedPriorPreviewHash: null,
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error_type?: string }).error_type).toBe(
      "email_column_missing",
    );
    expect(mocks.writerMutations).toEqual([]);
  });
});
