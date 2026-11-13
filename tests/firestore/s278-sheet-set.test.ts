import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { SheetWritebackWriter } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";

// S278 R-S278-4 / R-S278-5 / R-S278-6 (AC-S278-4, AC-S278-6) against the real Firestore emulator,
// the real workspace and operating Sheet routes and a deterministic provider double for the Sheet:
// a lease row's listed recorded cells are prepared as one proposal, confirmed once, and applied
// cell by cell, each with its own one-attempt claim, compare-and-swap write, read-back and
// receipt. A second confirmation starts no second run; a changed value refuses the whole
// confirmation with nothing written; a stopped run says what was written and needs a fresh
// preview; a single update keeps its own confirmation. Synthetic values only.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  writer: null as SheetWritebackWriter | null,
  context: null as (() => FreshOperatingSheetLeaseContext) | null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
const ACTOR = {
  uid: "s278-sheet-operator",
  email: "s278-sheet-operator@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => ACTOR,
  requireCapabilityInSpace: async () => ACTOR,
}));
vi.mock("@/lib/google-sheets/write-client", () => ({
  GoogleSheetsApiWriter: class {
    constructor() {
      return testState.writer!;
    }
  },
}));
vi.mock("@/lib/lease-renewal/sheet-writeback/workspace-resolution", async (original) => ({
  ...(await original<
    typeof import("@/lib/lease-renewal/sheet-writeback/workspace-resolution")
  >()),
  resolveFreshOperatingSheetLeaseContext: async () => testState.context!(),
}));
vi.mock("@/lib/lease-renewal/workspace-cycle-context", () => ({
  resolveLeaseOwnerRoster: async () => [],
  resolveRenewalCycleBasis: async () => ({
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  }),
  resolveRenewalWorkBasis: async () => ({
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  }),
}));

import { POST as sheetRoute } from "@/app/api/lease-renewal/operating-sheet/route";
import {
  GET as workspaceRead,
  POST as workspaceRoute,
} from "@/app/api/lease-renewal/workspace/route";
import { mintSheetWorkspaceContext } from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import { getSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import {
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import { readSheetSetRun } from "@/lib/firestore/s278-sheet-set-run";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

const projectId = "pmi-kc-kb-s278-sheet-set";
const LEASE = "702";
const spreadsheetId = "s278-emulator-fixture-sheet";
const scope = { kind: "lease_workspace" as const, leaseId: LEASE };
const header = [
  "What is the Lease/Tenant name?",
  "Have we sent the renewal letter?",
  "Have we sent the Google Form to gather info?",
  "Have the lease docs been sent out?",
];
const COLUMN_FIELDS = [
  "tenant_name",
  "renewal_letter_sent",
  "info_form_sent",
  "lease_docs_sent",
];
const LETTERS = ["A", "B", "C", "D"];
let app: App, db: Firestore, environment: RulesTestEnvironment;
let row: string[] = [];
let writes: string[] = [];
let token = "";
/** A collaborator edit applied just before one cell's compare-and-swap, when set. */
let conflictAt: string | null = null;

function evidence(value: string) {
  return {
    value: { stringValue: value },
    formattedValue: value,
    numberFormat: "TEXT",
    checkbox: false,
  };
}

function columnOf(range: string): number {
  const match = /!([A-D])2(?::[A-D]2)?$/.exec(range);
  if (!match) throw new Error(`Unexpected exact read ${range}`);
  return LETTERS.indexOf(match[1]!);
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s278-sheet-set-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("RENEWAL_SHEET_ID", spreadsheetId);
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  vi.stubEnv("RENEWAL_DESK_PARTY_FILTER_KEY", Buffer.alloc(32, 31).toString("base64url"));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await environment.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  row = ["Emulator Tenant", "Not started", "No", "Not started"];
  writes = [];
  conflictAt = null;
  token = mintSheetWorkspaceContext(ACTOR.uid, LEASE)!;
  testState.context = () => ({
    leaseId: LEASE,
    propertyId: "703",
    tenantName: "Emulator Tenant",
    sourceReadAtIso: new Date().toISOString(),
    header,
    columns: new Map(COLUMN_FIELDS.map((field, index) => [field, index])),
    tenantColumnIndex: 0,
    association: { kind: "exact_link", rowNumber: 2 },
    row: {
      rowNumber: 2,
      rowKey: null,
      anchorTenantName: row[0]!,
      currentRentValue: "1000",
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
      fieldValues: Object.fromEntries(
        COLUMN_FIELDS.slice(1).map((field, index) => [field, row[index + 1]!]),
      ),
      formulaFields: [],
      cellEvidence: Object.fromEntries(
        COLUMN_FIELDS.slice(1).map((field, index) => [field, evidence(row[index + 1]!)]),
      ),
    },
  });
  testState.writer = {
    async getValues(_id, range) {
      if (range.endsWith("A1:AZ1")) return [header];
      return [[row[columnOf(range)]!]];
    },
    async getCellEvidence(_id, range) {
      return evidence(row[columnOf(range)]!);
    },
    async getSheetIdByTitle() {
      return 0;
    },
    async getColumnNotes() {
      return [{ rowNumber: 2, value: "Emulator Tenant", note: "" }];
    },
    async replaceCellIfExactMatch(_id, range, before, after) {
      const column = columnOf(range);
      if (conflictAt === COLUMN_FIELDS[column]) row[column] = "Changed by a collaborator";
      if (row[column] !== before) return false;
      writes.push(COLUMN_FIELDS[column]!);
      row[column] = after;
      return true;
    },
    async appendRowWithNote() {
      throw new Error("Unexpected append");
    },
    async deleteExactRow() {
      throw new Error("Deletion is unavailable");
    },
  };
});

async function workspace(body: Record<string, unknown>) {
  const response = await workspaceRoute(
    new Request("http://local.test/api/lease-renewal/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}
async function sheet(body: Record<string, unknown>) {
  const response = await sheetRoute(
    new Request("http://local.test/api/lease-renewal/operating-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceContext: token, ...body }),
    }),
  );
  return { status: response.status, body: await response.json() };
}
async function proposal(): Promise<SheetWritebackProposal | null> {
  return getSheetWritebackProposal(ACTOR, spreadsheetId, "Lease Renewal", scope, db);
}
async function readState(): Promise<RenewalWorkspaceState> {
  const response = await workspaceRead(
    new Request(`http://local.test/api/lease-renewal/workspace?leaseId=${LEASE}`),
  );
  expect(response.status).toBe(200);
  return (await response.json()).state;
}

/** A cycle with three recorded staff facts, each holding one Sheet cell of the lease's row. */
async function threeRecordedFacts(): Promise<RenewalWorkspaceState> {
  const started = await workspace({
    operation: "start_cycle",
    leaseId: LEASE,
    basis: { kind: "lease_end", dateIso: "2026-12-31", source: "RentVine lease end" },
    expectedCycleId: null,
    expectedRevision: 0,
    operationId: randomUUID(),
    reason: "Reviewed fixture source context",
  });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  let state: RenewalWorkspaceState = started.body.state;
  for (const activity of ["tenant_offer", "information_form", "document_delivery"]) {
    const recorded = await workspace({
      operation: "record",
      leaseId: LEASE,
      cycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: randomUUID(),
      action: { kind: "activity", activity, outcome: "done" },
    });
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200);
    state = recorded.body.state;
  }
  expect(Object.keys(state.sourceUpdates).sort()).toEqual([
    "info_form_sent",
    "lease_docs_sent",
    "renewal_letter_sent",
  ]);
  return state;
}

async function prepareSet(state: RenewalWorkspaceState) {
  return workspace({
    operation: "prepare_source_set",
    leaseId: LEASE,
    cycleId: state.cycleId,
    entries: Object.entries(state.sourceUpdates)
      .filter(([, entry]) => entry.state !== "verified")
      .map(([field, entry]) => ({ field, eventId: entry.eventId })),
    marketValue: false,
  });
}

function confirmSet(value: SheetWritebackProposal) {
  return sheet({
    operation: "execute_set",
    confirm: true,
    previewHash: value.previewHash,
    effectHashes: value.effects.map((effect) => effect.effectHash),
  });
}

describe("S278 R-S278-4: one confirmation for a lease row's listed Sheet cells", () => {
  it("AC-S278-4: three cells, one confirmation, three claims, three one-cell writes and three receipts", async () => {
    const state = await threeRecordedFacts();
    const prepared = await prepareSet(state);
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
    expect(prepared.body.prepared).toEqual([
      "Renewal letter sent",
      "Information form sent",
      "Lease documents sent",
    ]);
    const set = (await proposal())!;
    expect(
      set.effects.map(
        (effect) => effect.effect.kind === "field_update" && effect.effect.field,
      ),
    ).toEqual(["renewal_letter_sent", "info_form_sent", "lease_docs_sent"]);
    expect(set.evidenceRef).toMatch(
      new RegExp(`^workspace:${LEASE}:cycle:${state.cycleId}:manual:set-[a-f0-9]{64}$`),
    );
    for (const entry of Object.values(
      (prepared.body.state as RenewalWorkspaceState).sourceUpdates,
    ))
      expect(entry).toMatchObject({ state: "prepared", proposalId: set.generationId });
    // Preparing writes nothing.
    expect(writes).toEqual([]);

    const applied = await confirmSet(set);
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body).toMatchObject({
      status: "executed_set",
      workspaceSynchronization: { state: "verified" },
    });
    expect(applied.body.results.map((result: { state: string }) => result.state)).toEqual(
      ["done", "done", "done"],
    );
    expect(writes).toEqual(["renewal_letter_sent", "info_form_sent", "lease_docs_sent"]);
    // Each cell has its own one-attempt claim and its own receipt.
    for (const effect of set.effects) {
      const record = await db
        .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
        .doc(sheetWritebackExecutionId(set, effect))
        .get();
      expect(record.get("state")).toBe("succeeded");
      expect(record.get("attemptCount")).toBe(1);
      expect(record.get("receipt")).toMatchObject({ actionKey: effect.actionKey });
    }
    // Every cell reads back with its receipt time.
    for (const entry of Object.values((await readState()).sourceUpdates))
      expect(entry).toMatchObject({ state: "verified", receiptAt: expect.any(String) });

    // AC-S278-4: confirming twice is one run; the second confirmation starts nothing.
    const twice = await confirmSet(set);
    expect(twice.status).toBe(409);
    expect(twice.body.error_type).toBe("set_already_confirmed");
    expect(writes).toHaveLength(3);
    expect(await readSheetSetRun(db, set.previewHash)).toMatchObject({
      state: "ran",
      effect_hashes: set.effects.map((effect) => effect.effectHash),
    });
  });

  it("BEH-S278-5: a value changed in the Sheet after the preview refuses the whole confirmation with the field named, and nothing is written", async () => {
    const state = await threeRecordedFacts();
    await prepareSet(state);
    const set = (await proposal())!;
    row[3] = "Sent by hand";
    const refused = await confirmSet(set);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error:
        "The Sheet changed since this preview: Lease documents sent. Review the updates again.",
      error_type: "sheet_changed_since_preview",
      changed: ["Lease documents sent"],
    });
    expect(writes).toEqual([]);
  });

  it("R-S278-5: a conflict on the second cell leaves the first written with its receipt, the second on its recovery and the third unattempted; a fresh preview takes the rest", async () => {
    const state = await threeRecordedFacts();
    await prepareSet(state);
    const set = (await proposal())!;
    conflictAt = "info_form_sent";
    const applied = await confirmSet(set);
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(
      applied.body.results.map((result: { label: string; state: string }) => [
        result.label,
        result.state,
      ]),
    ).toEqual([
      ["Renewal letter sent", "done"],
      ["Information form sent", "failed"],
      ["Lease documents sent", "unattempted"],
    ]);
    expect(applied.body.summary).toEqual([
      "Written: Renewal letter sent.",
      expect.stringMatching(/^Not applied: Information form sent\./),
      "Not attempted: Lease documents sent.",
      "The run stopped at the first cell that did not apply. Nothing retries on its own; prepare a fresh preview to try the rest.",
    ]);
    expect(writes).toEqual(["renewal_letter_sent"]);
    // Another attempt needs a fresh preview: the stopped run is replaced, never resumed.
    conflictAt = null;
    row[2] = "No";
    const latest = await readState();
    expect(latest.sourceUpdates.renewal_letter_sent).toMatchObject({ state: "verified" });
    const fresh = await prepareSet(latest);
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(200);
    expect(fresh.body.prepared).toEqual([
      "Information form sent",
      "Lease documents sent",
    ]);
  });

  it("AC-S278-6: a combined preview is never applied one cell at a time, and a single update keeps its own confirmation", async () => {
    const state = await threeRecordedFacts();
    await prepareSet(state);
    const set = (await proposal())!;
    const single = await sheet({
      operation: "execute",
      confirm: true,
      previewHash: set.previewHash,
      effectHash: set.effects[0]!.effectHash,
    });
    expect(single.status).toBe(409);
    expect(single.body.error_type).toBe("confirmation_invalid");
    expect(writes).toEqual([]);
    // A single recorded fact still previews and applies alone.
    const one = await workspace({
      operation: "prepare_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      field: "renewal_letter_sent",
      eventId: state.sourceUpdates.renewal_letter_sent!.eventId,
    });
    expect(one.status).toBe(200);
    // The untouched combined preview stays open: preparing one of its cells alone waits for it.
    expect(
      (one.body.state as RenewalWorkspaceState).sourceUpdates.renewal_letter_sent,
    ).toMatchObject({
      state: "unavailable",
      reason: expect.stringMatching(/Another Sheet proposal still needs review/),
    });
    const discarded = await sheet({ operation: "discard", previewHash: set.previewHash });
    expect(discarded.status).toBe(200);
    await workspace({
      operation: "prepare_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      field: "renewal_letter_sent",
      eventId: state.sourceUpdates.renewal_letter_sent!.eventId,
    });
    const alone = (await proposal())!;
    expect(alone.effects).toHaveLength(1);
    const applied = await sheet({
      operation: "execute",
      confirm: true,
      previewHash: alone.previewHash,
      effectHash: alone.effects[0]!.effectHash,
    });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(writes).toEqual(["renewal_letter_sent"]);
  });
});
