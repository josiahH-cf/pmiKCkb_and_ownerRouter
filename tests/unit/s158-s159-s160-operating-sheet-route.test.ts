import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import type { SheetCellEvidence } from "@/lib/google-sheets/cell-evidence";
import type { SheetsValuesReader } from "@/lib/google-sheets/read-client";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import type {
  SheetWritebackDependencies,
  SheetWritebackWriter,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  RETIRED_BROAD_SHEET_WRITEBACK_KEY,
  SHEET_WRITEBACK_KEYS,
  normalRowNote,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { isSheetWritebackEnabled } from "@/lib/lease-renewal/sheet-writeback-policy";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// S158 / S159 / S160 through the actual operating-Sheet route, the actual fresh lease/row
// resolver and the actual one-attempt service, over one deterministic workbook double. Nothing
// here reaches a provider and every value is synthetic.

const TAB = "Lease Renewal";
const HEADER = [
  "Have we confirmed pricing with the owner? ",
  "Have we sent the renewal letter? ",
  "What is the Lease/Tenant name?",
  "Renewal Date",
  "Current Rent ",
  "Market Value",
];
const TENANT = 2;

interface FakeRow {
  values: string[];
  note?: string;
  /** A RentVine link carried by the tenant cell as a HYPERLINK formula. */
  link?: string;
  /** Column index to formula text for an ordinary formula cell. */
  formulas?: Record<number, string>;
}

const mocks = vi.hoisted(() => ({
  user: { uid: "editor-1", email: "editor1@pmikcmetro.com", role: "Editor" as string },
  deps: null as unknown,
  proposals: new Map<string, unknown>(),
  gateOpen: true,
  writeFlagEnabled: true,
  writerMutations: [] as string[],
  writerConstructed: 0,
  workingRecord: null as unknown,
  reader: null as unknown,
  readerFails: false,
  reviewJoins: [] as (readonly (string | null)[])[],
  decisionReads: [] as string[],
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: vi.fn(async () => mocks.user),
}));

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

// S160: none of these business records is a prerequisite any more. Each read is recorded so a
// residual dependency fails the test instead of passing by accident.
vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  getRenewalProgress: vi.fn(async () => {
    mocks.decisionReads.push("owner_response");
    return { ownerOutcome: { state: "revision_requested" } };
  }),
}));
vi.mock("@/lib/firestore/lease-renewal-resolutions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/firestore/lease-renewal-resolutions")>()),
  getLeaseRenewalResolution: vi.fn(async () => {
    mocks.decisionReads.push("resolution");
    return null;
  }),
}));
vi.mock("@/lib/firestore/lease-renewal-writeback-approvals", async (importActual) => ({
  ...(await importActual<
    typeof import("@/lib/firestore/lease-renewal-writeback-approvals")
  >()),
  getWritebackApproval: vi.fn(async () => {
    mocks.decisionReads.push("approval");
    return null;
  }),
}));

vi.mock("@/lib/firestore/renewal-sheet-working-inputs", () => ({
  readSheetWorkingRecord: vi.fn(async () => mocks.workingRecord),
}));

vi.mock("@/lib/google-sheets/write-client", () => ({
  GoogleSheetsApiWriter: class {
    constructor() {
      mocks.writerConstructed += 1;
    }
  },
}));

vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRenewalConfig: () => ({
    ok: true,
    spreadsheetId: "sheet-live-1",
    rentvineHost: "rentvine.invalid",
    sheetsReader: mocks.reader,
    rentvineClient: {
      getLease: async (leaseId: string) => ({
        leaseID: Number(leaseId),
        property: { propertyID: 84 },
        unit: { unitID: 9 },
      }),
    },
  }),
}));

vi.mock("@/lib/lease-renewal/live-run", () => ({
  runLiveRenewalReview: vi.fn(
    async (options: { tableJoinIds?: readonly (readonly (string | null)[])[] }) => {
      mocks.reviewJoins = [...(options.tableJoinIds ?? [])];
      return {
        exportComplete: true,
        pipelineInput: {
          nonSheetCandidates: [
            {
              source: "rentvine",
              joinId: "lease:115",
              joinValue: "Fresh Real Tenant",
              fields: {},
            },
          ],
        },
        run: { outcomes: [] },
      };
    },
  ),
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
        proposal: { previewHash: string },
        scope: { leaseId?: string },
        expected: string | null,
      ) => {
        const key = scope.leaseId ?? "proof";
        const current =
          (mocks.proposals.get(key) as { previewHash: string } | undefined)
            ?.previewHash ?? null;
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
    discardSheetWritebackProposal: vi.fn(async () => {
      mocks.proposals.clear();
    }),
  };
});

vi.mock(
  "@/lib/lease-renewal/sheet-writeback/workspace-context",
  async (importActual) => ({
    ...(await importActual<
      typeof import("@/lib/lease-renewal/sheet-writeback/workspace-context")
    >()),
    verifySheetWorkspaceContext: () => ({
      leaseId: "115",
      expiresAtMs: Date.now() + 60_000,
    }),
  }),
);

import { GET, POST } from "@/app/api/lease-renewal/operating-sheet/route";

const WORKSPACE_CONTEXT = `context-115-${"x".repeat(48)}`;
const sheet = {
  tabs: {} as Record<string, { header: string[]; rows: FakeRow[] }>,
  loseResponse: false,
};
let store: MemoryExternalExecutionStore;

function grid(tabTitle: string): string[][] | null {
  const tab = sheet.tabs[tabTitle];
  return tab ? [tab.header, ...tab.rows.map((row) => row.values)] : null;
}
function columnIndex(lettersValue: string): number {
  let value = 0;
  for (const letter of lettersValue) value = value * 26 + (letter.charCodeAt(0) - 64);
  return value - 1;
}
function parseRange(range: string) {
  const match = /^'((?:[^']|'')+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range);
  if (!match) throw new Error(`unsupported fake range ${range}`);
  return {
    tabTitle: match[1].replaceAll("''", "'"),
    startColumn: columnIndex(match[2]),
    startRow: Number(match[3]),
    endColumn: columnIndex(match[4] ?? match[2]),
    endRow: Number(match[5] ?? match[3]),
  };
}
function readRange(range: string): string[][] {
  const parsed = parseRange(range);
  const cells = grid(parsed.tabTitle);
  if (!cells) throw new Error("Sheets values read failed (HTTP 400).");
  const out: string[][] = [];
  for (let row = parsed.startRow; row <= Math.min(parsed.endRow, cells.length); row += 1)
    out.push((cells[row - 1] ?? []).slice(parsed.startColumn, parsed.endColumn + 1));
  return out;
}
function evidenceAt(range: string): SheetCellEvidence {
  const parsed = parseRange(range);
  const row = sheet.tabs[parsed.tabTitle]?.rows[parsed.startRow - 2];
  const formula = row?.formulas?.[parsed.startColumn];
  const value = row?.values[parsed.startColumn] ?? "";
  return {
    value: formula ? { formulaValue: formula } : { stringValue: value },
    formattedValue: value,
    numberFormat: null,
    checkbox: false,
  };
}

function fakeReader(): SheetsValuesReader {
  const guard = () => {
    if (mocks.readerFails) throw new Error("Sheets values read failed (HTTP 503).");
  };
  return {
    async listTabTitles() {
      guard();
      return Object.keys(sheet.tabs);
    },
    async getTabId() {
      return 0;
    },
    async batchGet(_spreadsheetId, ranges) {
      guard();
      return {
        valueRanges: ranges.map((range) => ({
          range,
          values: range.includes("!") ? readRange(range) : (grid(range) ?? []),
        })),
      };
    },
    async batchGetFormulas(_spreadsheetId, ranges) {
      guard();
      return {
        valueRanges: ranges.map((range) => {
          const tab = sheet.tabs[range];
          return {
            range,
            values: [
              tab.header,
              ...tab.rows.map((row) =>
                row.values.map((value, index) =>
                  index === TENANT && row.link
                    ? `=HYPERLINK("${row.link}","${value}")`
                    : (row.formulas?.[index] ?? value),
                ),
              ),
            ],
          };
        }),
      };
    },
    async batchGetNotes(_spreadsheetId, titles) {
      guard();
      return Object.fromEntries(
        titles.map((title) => [
          title,
          [
            sheet.tabs[title].header.map(() => null),
            ...sheet.tabs[title].rows.map((row) =>
              row.values.map((_value, index) =>
                index === TENANT ? (row.note ?? null) : null,
              ),
            ),
          ],
        ]),
      );
    },
    async batchGetRichLinks(_spreadsheetId, titles) {
      guard();
      return Object.fromEntries(
        titles.map((title) => [
          title,
          [
            sheet.tabs[title].header.map(() => []),
            ...sheet.tabs[title].rows.map((row) => row.values.map(() => [])),
          ],
        ]),
      );
    },
    async getCellEvidence(_spreadsheetId, range) {
      guard();
      return evidenceAt(range);
    },
  };
}

function fakeDeps(): SheetWritebackDependencies {
  const appendLifecycles = new Map<string, string>();
  const writer: SheetWritebackWriter = {
    async getValues(_spreadsheetId, range) {
      return readRange(range);
    },
    async getCellEvidence(_spreadsheetId, range) {
      return evidenceAt(range);
    },
    async getSheetIdByTitle() {
      return 77;
    },
    async appendRowWithNote(input) {
      mocks.writerMutations.push("append");
      sheet.tabs[TAB].rows.push({ values: [...input.values], note: input.note });
    },
    async deleteExactRow() {
      mocks.writerMutations.push("delete");
    },
    async getColumnNotes(input) {
      return sheet.tabs[TAB].rows
        .map((row, index) => ({
          rowNumber: index + 2,
          value: row.values[input.columnIndex] ?? "",
          note: row.note ?? "",
        }))
        .filter(
          (entry) =>
            entry.rowNumber >= input.startRowNumber &&
            entry.rowNumber <= input.endRowNumber,
        );
    },
    async replaceCellIfExactMatch(_spreadsheetId, range, expected, replacement) {
      const parsed = parseRange(range);
      const row = sheet.tabs[parsed.tabTitle]?.rows[parsed.startRow - 2];
      if (!row || (row.values[parsed.startColumn] ?? "") !== expected) return false;
      mocks.writerMutations.push(`cas:${range}`);
      row.values[parsed.startColumn] = replacement;
      if (sheet.loseResponse) throw new Error("provider double lost its response");
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
      appendLifecycles.set(
        `${input.spreadsheetId}:${input.tabTitle}:${input.leaseId}`,
        input.state,
      );
    },
  };
}

function working(fields: Record<string, unknown>): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "115",
    revision: Math.max(1, Object.keys(fields).length),
    fields: Object.fromEntries(
      Object.entries(fields).map(([field, value], index) => [
        field,
        {
          value: value as never,
          revision: index + 1,
          eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000000${index + 1}`,
          recordedAt: "2026-10-02T15:00:00.000Z",
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: "staff_entry" as const,
        },
      ]),
    ),
  };
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/lease-renewal/operating-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceContext: WORKSPACE_CONTEXT, ...body }),
    }),
  );
}
function lookup() {
  return GET(
    new Request("http://localhost/api/lease-renewal/operating-sheet", {
      headers: {
        "x-renewal-workspace-context": WORKSPACE_CONTEXT,
        "x-renewal-sheet-read": "lookup",
      },
    }),
  );
}
function status() {
  return GET(
    new Request("http://localhost/api/lease-renewal/operating-sheet", {
      headers: { "x-renewal-workspace-context": WORKSPACE_CONTEXT },
    }),
  );
}
const activeProposal = () => mocks.proposals.get("115") as SheetWritebackProposal;
function propose(body: Record<string, unknown>) {
  return post({
    operation: "propose",
    expectedPriorPreviewHash: mocks.proposals.has("115")
      ? activeProposal().previewHash
      : null,
    ...body,
  });
}
function confirm(proposal = activeProposal()) {
  return post({
    operation: "execute",
    previewHash: proposal.previewHash,
    effectHash: proposal.effects[0].effectHash,
    confirm: true,
  });
}
async function payloadOf(response: Response) {
  // Response bodies are inspected loosely on purpose; each assertion names its exact shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await response.json()) as Record<string, any>;
}

beforeEach(() => {
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  mocks.user = { uid: "editor-1", email: "editor1@pmikcmetro.com", role: "Editor" };
  store = new MemoryExternalExecutionStore();
  mocks.proposals.clear();
  mocks.gateOpen = true;
  mocks.writeFlagEnabled = true;
  mocks.writerMutations = [];
  mocks.writerConstructed = 0;
  mocks.workingRecord = null;
  mocks.readerFails = false;
  mocks.reviewJoins = [];
  mocks.decisionReads = [];
  sheet.loseResponse = false;
  sheet.tabs = {
    [TAB]: {
      header: [...HEADER],
      rows: [
        // Row 2: the automatic match (an exact RentVine lease link).
        {
          values: ["yes", "", "Fresh Real Tenant", "8/31/2026", "1000", "1100"],
          link: "https://rentvine.invalid/leases/115",
        },
        // Row 3: another lease's row.
        {
          values: ["", "", "Other Tenant", "9/30/2026", "1500", "1600"],
          link: "https://rentvine.invalid/leases/900",
        },
        // Row 4: an unlinked row the operator knows is this lease's current row.
        { values: ["", "", "F. R. Tenant", "8/31/2026", "1200", "1300"] },
        // Row 5: a row whose market value is a formula.
        {
          values: ["", "", "Formula Tenant", "", "1400", "1450"],
          formulas: { 5: "=E5+50" },
        },
      ],
    },
    "Archive 2025": {
      header: ["Unit", "Reviewed rent", "Reviewer note"],
      rows: [{ values: ["Unit 4", "1175", "Synthetic archive note"] }],
    },
    "Door Codes": {
      header: ["WiFi Name", "WiFi Password", "Garage Spot"],
      rows: [{ values: ["synthetic-network", "synthetic-secret", "12"] }],
    },
  };
  mocks.reader = fakeReader();
  mocks.deps = fakeDeps();
});

describe("S158 operator-selected lookup through the route", () => {
  it("BEH-S158-1/4/8: a lookup is a provider read through GET; it returns the observed selected range and dispatches no Sheet write", async () => {
    mocks.workingRecord = working({
      sheet_row: { tabTitle: "Archive 2025", rowNumber: 2 },
      "sheet_cell.market_value": { tabTitle: TAB, cell: "F4" },
    });
    const response = await lookup();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { lookup: view } = await payloadOf(response);
    expect(view.tabs).toEqual({ state: "available", titles: [TAB, "Archive 2025"] });
    expect(view.row).toMatchObject({
      tabTitle: "Archive 2025",
      rowNumber: 2,
      state: "read",
      provenance: "operator_selected",
      selectedBy: "editor1@pmikcmetro.com",
    });
    expect(view.row.cells.map((cell: { value: string }) => cell.value)).toEqual([
      "Unit 4",
      "1175",
      "Synthetic archive note",
    ]);
    expect(view.cells).toEqual([
      expect.objectContaining({ field: "market_value", cell: "F4", value: "1300" }),
    ]);
    // Selecting and reading never constructs or calls a Sheet writer.
    expect(mocks.writerConstructed).toBe(0);
    expect(mocks.writerMutations).toEqual([]);
    expect(store.records.size).toBe(0);
    expect(mocks.proposals.size).toBe(0);
  });

  it("BEH-S158-7, AC-S158-2: an unreadable selection reports its problem, keeps the selection and leaves other work available", async () => {
    mocks.workingRecord = working({
      sheet_row: { tabTitle: "Removed Tab", rowNumber: 9 },
      current_rent: 1850,
    });
    const first = await payloadOf(await lookup());
    expect(first.lookup.row).toMatchObject({
      state: "problem",
      tabTitle: "Removed Tab",
      rowNumber: 9,
    });
    expect(first.lookup.row.problem).toMatch(/Removed Tab/);
    // The working record is untouched and unrelated reads still answer.
    expect(mocks.workingRecord).toEqual(
      working({
        sheet_row: { tabTitle: "Removed Tab", rowNumber: 9 },
        current_rent: 1850,
      }),
    );
    expect((await status()).status).toBe(200);
    // The whole workbook being unavailable is still a 200 with a named problem, not a failure.
    mocks.readerFails = true;
    const second = await lookup();
    expect(second.status).toBe(200);
    expect((await payloadOf(second)).lookup.tabs.state).toBe("unavailable");
  });

  it("BEH-S158-9, BEH-S159-5: an update prepared from a selected row targets that freshly resolved row, and the confirmed dispatch matches the preview", async () => {
    mocks.workingRecord = working({ sheet_row: { tabTitle: TAB, rowNumber: 4 } });
    const proposed = await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    expect(proposed.status).toBe(200);
    const effect = (await payloadOf(proposed)).proposal.effects[0].effect;
    expect(effect).toMatchObject({
      field: "market_value",
      rowNumber: 4,
      anchorTenantName: "F. R. Tenant",
      expectedValue: "1300",
      afterValue: "1475",
    });
    // The selection also wins in the read pipeline's join: row 4 carries the lease, and the
    // earlier automatic row no longer does.
    expect(mocks.reviewJoins[0][3]).toBe("lease:115");
    expect(mocks.reviewJoins[0][1]).not.toBe("lease:115");

    const confirmed = await confirm();
    expect(confirmed.status).toBe(200);
    expect(mocks.writerMutations).toEqual([`cas:'${TAB}'!F4`]);
    expect(sheet.tabs[TAB].rows[2].values[5]).toBe("1475");
    // The automatic row and every other cell are unchanged.
    expect(sheet.tabs[TAB].rows[0].values).toEqual([
      "yes",
      "",
      "Fresh Real Tenant",
      "8/31/2026",
      "1000",
      "1100",
    ]);
  });

  it("BEH-S158-9: changing the selection after the preview refuses the old confirmation without a Sheet change", async () => {
    mocks.workingRecord = working({ sheet_row: { tabTitle: TAB, rowNumber: 4 } });
    await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    mocks.workingRecord = null;
    const confirmed = await confirm();
    expect(confirmed.status).toBe(409);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("BEH-S158-10, AC-S158-3: a readable identity, formula or unrecognized cell is never a write target, and the limit is reported only on that update", async () => {
    for (const [cell, tabTitle] of [
      ["C4", TAB], // identity column
      ["F5", TAB], // formula cell
      ["B2", "Archive 2025"], // unrecognized column on another tab
      ["F1", TAB], // header row
    ] as const) {
      mocks.proposals.clear();
      mocks.workingRecord = working({
        "sheet_cell.market_value": { tabTitle, cell },
      });
      const refused = await propose({
        intent: "update_field",
        fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
      });
      expect(refused.status, `${tabTitle}!${cell}`).toBe(409);
      const body = await payloadOf(refused);
      expect(body.error_type).toMatch(/selected_cell_not_writable|selected_target/);
      expect(body.error).toMatch(/readable/i);
      expect(mocks.proposals.size).toBe(0);
      // The same cell is still read for the operator.
      const read = (await payloadOf(await lookup())).lookup.cells[0];
      expect(read).toMatchObject({ state: "read", cell });
    }
    expect(mocks.writerMutations).toEqual([]);
    // Only the selected field is limited: another field still prepares against the lease's row.
    mocks.workingRecord = working({
      "sheet_cell.market_value": { tabTitle: TAB, cell: "C4" },
    });
    const other = await propose({
      intent: "update_field",
      fieldIntent: { field: "renewal_letter_sent", value: "Sent", source: "Staff entry" },
    });
    expect(other.status).toBe(200);
    expect((await payloadOf(other)).proposal.effects[0].effect.rowNumber).toBe(2);
  });

  it("AC-S158-3: a selected row that carries another lease's link, or the app's proof note, is refused as a target", async () => {
    mocks.workingRecord = working({ sheet_row: { tabTitle: TAB, rowNumber: 3 } });
    const refused = await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    expect(refused.status).toBe(409);
    expect((await payloadOf(refused)).error_type).toBe("selected_row_not_writable");
    // A selected row also never becomes a reason to add a second row.
    const append = await propose({ intent: "append_missing_row" });
    expect(append.status).toBe(409);
    expect(mocks.writerMutations).toEqual([]);
  });
});

describe("S159 Sheet state stays local to the one Sheet update", () => {
  it("BEH-S159-4: the server-owned switch is on only for the exact value true", () => {
    for (const [value, enabled] of [
      ["true", true],
      [" true ", true],
      ["TRUE", false],
      ["1", false],
      ["yes", false],
      ["", false],
      ["false", false],
    ] as const) {
      vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", value);
      expect(isSheetWritebackEnabled(), JSON.stringify(value)).toBe(enabled);
    }
  });

  it("BEH-S159-1/2, AC-S159-1: while the switch is off, reads, the lookup and status continue and only the Sheet update is declined", async () => {
    mocks.writeFlagEnabled = false;
    vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "false");
    mocks.workingRecord = working({ sheet_row: { tabTitle: TAB, rowNumber: 4 } });
    expect((await lookup()).status).toBe(200);
    const read = await payloadOf(await status());
    expect(read).toMatchObject({ status: "ok", writeback_paused: true });
    const refused = await propose({ intent: "append_missing_row" });
    expect(refused.status).toBe(409);
    expect(await payloadOf(refused)).toMatchObject({ error_type: "writeback_paused" });
    expect(mocks.proposals.size).toBe(0);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("BEH-S159-1, AC-S159-1: an unresolved row match declines the Sheet update in plain words and nothing else", async () => {
    // Two rows link to the same lease: the association is ambiguous.
    sheet.tabs[TAB].rows[2].link = "https://rentvine.invalid/leases/115";
    const refused = await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    expect(refused.status).toBe(409);
    const body = await payloadOf(refused);
    expect(body.error_type).toBe("row_join_ambiguous");
    expect(body.error).not.toMatch(/refused \(/);
    expect((await status()).status).toBe(200);
    expect((await lookup()).status).toBe(200);
    // The operator resolves it in the app by selecting the row; the update then prepares.
    mocks.workingRecord = working({ sheet_row: { tabTitle: TAB, rowNumber: 4 } });
    expect(
      (
        await propose({
          intent: "update_field",
          fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
        })
      ).status,
    ).toBe(200);
  });

  it("BEH-S159-3/9: an enabled switch and the exact keys let staff append one row and update one recognized field, each at most once", async () => {
    // Append for a lease with no row.
    sheet.tabs[TAB].rows = [sheet.tabs[TAB].rows[1]];
    expect((await propose({ intent: "append_missing_row" })).status).toBe(200);
    const appendProposal = activeProposal();
    expect(appendProposal.effects[0].actionKey).toBe(
      "google_sheets.renewal_checklist.row_append",
    );
    const appended = await confirm(appendProposal);
    expect(appended.status).toBe(200);
    expect(await payloadOf(appended)).toMatchObject({
      status: "executed",
      duplicate: false,
    });
    const replay = await confirm(appendProposal);
    expect(await payloadOf(replay)).toMatchObject({ duplicate: true });
    expect(mocks.writerMutations).toEqual(["append"]);
    const note = sheet.tabs[TAB].rows[1].note ?? "";
    expect(note).toBe(
      normalRowNote({
        operationId: String(
          (appendProposal.effects[0].effect as { operationId: string }).operationId,
        ),
        leaseId: "115",
        propertyId: "84",
      }),
    );
    // Only the existing narrow provider calls were used: no tombstone, idempotency or delete.
    expect(mocks.writerMutations).not.toContain("delete");
  });

  it("BEH-S159-6/7: a target conflict fails only the attempted update; reads continue and the saved working values are unchanged", async () => {
    mocks.workingRecord = working({ current_rent: 1850 });
    await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    // A collaborator changes the cell after the preview.
    sheet.tabs[TAB].rows[0].values[5] = "1125";
    const refused = await confirm();
    expect(refused.status).toBe(409);
    expect((await payloadOf(refused)).error).not.toMatch(/refused \(/);
    expect(mocks.writerMutations).toEqual([]);
    expect(sheet.tabs[TAB].rows[0].values[5]).toBe("1125");
    expect(mocks.workingRecord).toEqual(working({ current_rent: 1850 }));
    expect((await status()).status).toBe(200);
    expect((await lookup()).status).toBe(200);
  });

  it("BEH-S159-6: an unavailable Sheet declines the attempted update with its own message", async () => {
    mocks.readerFails = true;
    const refused = await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    expect(refused.status).toBe(409);
    const body = await payloadOf(refused);
    expect(body.error_type).toBe("source_unavailable");
    expect(body.error).toMatch(/Sheet/);
    expect(body.error).not.toMatch(/refused \(/);
  });

  it("BEH-S159-8, AC-S159-3: an uncertain Sheet result leaves an earlier RentVine result exactly as it was", async () => {
    const rentvine = {
      id: "s97:115:rentvine-effect",
      dataMode: "live" as const,
      workflowId: "s97:115",
      actionId: "s97:115:rentvine-effect",
      actionKey: "rentvine.lease.recurring_charge.update",
      contextHash: "a".repeat(64),
      previewHash: "a".repeat(64),
      idempotencyKey: "s97:115:rentvine-effect",
      state: "succeeded" as const,
      attemptCount: 1 as const,
      createdAt: "2026-10-02T15:00:00.000Z",
      updatedAt: "2026-10-02T15:00:01.000Z",
      receipt: {
        actionKey: "rentvine.lease.recurring_charge.update",
        dataMode: "live" as const,
        liveEvidenceEligible: true,
        providerRef: "rentvine-charge:synthetic",
        resultHash: "b".repeat(64),
        reconciled: false,
        createdAt: "2026-10-02T15:00:01.000Z",
      },
    };
    store.records.set(rentvine.id, structuredClone(rentvine));
    await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    sheet.loseResponse = true;
    const uncertain = await confirm();
    expect(uncertain.status).toBe(409);
    expect((await payloadOf(uncertain)).error_type).toBe("provider_ambiguous");
    // Each destination keeps its own true result.
    expect(store.records.get(rentvine.id)).toEqual(rentvine);
    const sheetRecords = [...store.records.values()].filter((record) =>
      record.id.startsWith("s98:"),
    );
    expect(sheetRecords.map((record) => record.state)).toEqual(["ambiguous"]);
    // The uncertain attempt is never sent again.
    sheet.loseResponse = false;
    expect((await confirm()).status).toBe(409);
    expect(mocks.writerMutations).toHaveLength(1);
  });

  it("BEH-S159-10, AC-S159-2: a proposal saved before a release is never dispatched by enablement; it needs a fresh preview", async () => {
    await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    const old = activeProposal();
    // A new release revision with the switch enabled.
    vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-b");
    const read = await payloadOf(await status());
    expect(read.proposal.requires_fresh_review).toBe(true);
    expect(mocks.writerMutations).toEqual([]);
    const refused = await confirm(old);
    expect(refused.status).toBe(409);
    expect((await payloadOf(refused)).error_type).toBe("runtime_stale");
    expect(mocks.writerMutations).toEqual([]);
    // A fresh preview on the current revision is confirmable.
    mocks.proposals.clear();
    await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475, source: "Staff entry" },
    });
    expect((await confirm()).status).toBe(200);
    expect(mocks.writerMutations).toEqual([`cas:'${TAB}'!F2`]);
  });

  it("AC-S159-2: enabling the supported operations opens no legacy generic key", () => {
    expect(SHEET_WRITEBACK_KEYS).toEqual([
      "google_sheets.renewal_checklist.row_append",
      "google_sheets.renewal_checklist.field_update",
    ]);
    const retired = ACTION_REGISTRY_SEED.find(
      (entry) => entry.key === RETIRED_BROAD_SHEET_WRITEBACK_KEY,
    );
    expect(retired?.production_allowed).toBe(false);
  });
});

describe("S160 ordinary staff confirm supported Sheet updates", () => {
  it("BEH-S160-1/5, AC-S160-1: an Editor appends the row with no owner response, approval, acceptance or cycle record", async () => {
    sheet.tabs[TAB].rows = [sheet.tabs[TAB].rows[1]];
    expect((await propose({ intent: "append_missing_row" })).status).toBe(200);
    const confirmed = await confirm();
    expect(confirmed.status).toBe(200);
    expect(mocks.writerMutations).toEqual(["append"]);
    // No business approval or response record was consulted on the way.
    expect(mocks.decisionReads).toEqual([]);
  });

  it("BEH-S160-2/3: the current-rent update is prepared from the working current rent without retyping or any approval record", async () => {
    mocks.workingRecord = working({ current_rent: 1850 });
    const proposed = await propose({ intent: "update_working_current_rent" });
    expect(proposed.status).toBe(200);
    const proposal = (await payloadOf(proposed)).proposal;
    expect(proposal.tab_title).toBe(TAB);
    expect(proposal.effects[0].effect).toMatchObject({
      kind: "field_update",
      field: "current_rent",
      rowNumber: 2,
      expectedValue: "1000",
      afterValue: "1850",
      staffIntent: { field: "current_rent", value: 1850 },
    });
    expect(proposal.effects[0].effect.authorization).toBeUndefined();
    expect(mocks.decisionReads).toEqual([]);
    // The earlier intent name an open page may still send prepares the same working value.
    mocks.proposals.clear();
    const legacy = await propose({
      intent: "update_approved_current_rent",
      expectedCurrentRent: 1850,
    });
    expect(legacy.status).toBe(200);
    expect((await payloadOf(legacy)).proposal.effects[0].effect.afterValue).toBe("1850");
    // A browser amount that is not the working value is refused, never written.
    mocks.proposals.clear();
    expect(
      (
        await propose({
          intent: "update_approved_current_rent",
          expectedCurrentRent: 1900,
        })
      ).status,
    ).toBe(409);
    expect(mocks.writerMutations).toEqual([]);
  });

  it("BEH-S160-2: with no working current rent the operator is told to enter one, on this update only", async () => {
    const refused = await propose({ intent: "update_working_current_rent" });
    expect(refused.status).toBe(409);
    const body = await payloadOf(refused);
    expect(body.error_type).toBe("working_value_missing");
    expect(body.error).toMatch(/working current rent/i);
    expect(mocks.proposals.size).toBe(0);
    expect((await status()).status).toBe(200);
  });

  it("BEH-S160-4/10: the Editor's confirmation is bound to the exact preview; a changed working value needs a fresh preview", async () => {
    mocks.workingRecord = working({ current_rent: 1850 });
    await propose({ intent: "update_working_current_rent" });
    const first = activeProposal();
    mocks.workingRecord = working({ current_rent: 1900 });
    const refused = await confirm(first);
    expect(refused.status).toBe(409);
    expect((await payloadOf(refused)).error_type).toBe("working_value_changed");
    expect(mocks.writerMutations).toEqual([]);
    expect(store.records.size).toBe(0);

    await propose({ intent: "update_working_current_rent" });
    const confirmed = await confirm();
    expect(confirmed.status).toBe(200);
    expect(mocks.writerMutations).toEqual([`cas:'${TAB}'!E2`]);
    expect(sheet.tabs[TAB].rows[0].values[4]).toBe("1900");
    // A repeated confirmation returns the durable receipt and writes nothing more.
    expect(await payloadOf(await confirm())).toMatchObject({ duplicate: true });
    expect(mocks.writerMutations).toHaveLength(1);
  });

  it("BEH-S160-10: a lost response is reconciled from Sheet state and never sent again", async () => {
    mocks.workingRecord = working({ current_rent: 1850 });
    await propose({ intent: "update_working_current_rent" });
    sheet.loseResponse = true;
    expect((await confirm()).status).toBe(409);
    sheet.loseResponse = false;
    const reconciled = await post({
      operation: "reconcile",
      effectHash: activeProposal().effects[0].effectHash,
    });
    // A matching field cannot prove this attempt wrote it; the route reports that honestly.
    expect(reconciled.status).toBe(409);
    expect((await payloadOf(reconciled)).error_type).toBe("reconcile_not_proven");
    expect(mocks.writerMutations).toHaveLength(1);
  });

  it("AC-S160-1: a verification account never dispatches or reconciles, whatever its role", async () => {
    mocks.workingRecord = working({ current_rent: 1850 });
    await propose({ intent: "update_working_current_rent" });
    const proposal = activeProposal();
    for (const role of ["Editor", "Admin"]) {
      mocks.user = { uid: "canary", email: "canary-editor@pmikcmetro.com", role };
      const refused = await confirm(proposal);
      expect(refused.status).toBe(403);
      expect((await payloadOf(refused)).error).toMatch(/verification account/i);
      expect(
        (
          await post({
            operation: "reconcile",
            effectHash: proposal.effects[0].effectHash,
          })
        ).status,
      ).toBe(403);
    }
    expect(mocks.writerMutations).toEqual([]);
    expect(store.records.size).toBe(0);
  });

  it("BEH-S160-11: an unsupported precise operation is declined locally and other work continues", async () => {
    mocks.workingRecord = working({ current_rent: 1850 });
    // A typed current rent does not bypass the working value.
    const typed = await propose({
      intent: "update_field",
      fieldIntent: { field: "current_rent", value: 1900, source: "Staff entry" },
    });
    expect(typed.status).toBe(409);
    // A field outside the recognized contract, a caller-chosen cell and a row delete or restore
    // are refused at the boundary.
    expect(
      (
        await propose({
          intent: "update_field",
          fieldIntent: { field: "tenant_name", value: "Someone Else" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await propose({
          intent: "update_field",
          fieldIntent: { field: "market_value", value: 1475 },
          cell: "F9",
        })
      ).status,
    ).toBe(400);
    await propose({ intent: "update_working_current_rent" });
    const reverse = await post({
      operation: "reverse_preview",
      effectHash: activeProposal().effects[0].effectHash,
    });
    expect(reverse.status).toBe(409);
    expect((await payloadOf(reverse)).error_type).toBe("provider_capability_unavailable");
    expect(mocks.writerMutations).toEqual([]);
    expect((await status()).status).toBe(200);
  });

  it("BEH-S160-4: a source note is optional; the server supplies a plain default label", async () => {
    const proposed = await propose({
      intent: "update_field",
      fieldIntent: { field: "market_value", value: 1475 },
    });
    expect(proposed.status).toBe(200);
    const effect = (await payloadOf(proposed)).proposal.effects[0].effect;
    expect(effect.source).toBe("Staff entry");
    expect(effect.staffIntent.source).toBe("Staff entry");
  });
});
