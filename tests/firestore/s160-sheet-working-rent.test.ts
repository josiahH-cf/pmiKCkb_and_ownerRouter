import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import type { SheetWritebackWriter } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";

// S160 (Sheet side) with S159-7: the current-rent Sheet update is bound to the lease's working
// current rent inside the one-attempt claim, with no resolution, approval, owner response, tenant
// response or work record required. A failed Sheet update leaves the saved working values alone.
// Actual route, actual Firestore stores and claims on the emulator; the provider is a double.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  writer: null as SheetWritebackWriter | null,
  context: null as (() => FreshOperatingSheetLeaseContext) | null,
  role: "Editor",
  email: "s160-editor@pmikcmetro.com",
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => ({
    uid: "s160-editor",
    email: testState.email,
    hd: "pmikcmetro.com",
    role: testState.role,
  }),
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

import { POST } from "@/app/api/lease-renewal/operating-sheet/route";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import { LEASE_RENEWAL_COLLECTIONS } from "@/lib/firestore/lease-renewal-resolutions";
import { LEASE_RENEWAL_WRITEBACK_COLLECTIONS } from "@/lib/firestore/lease-renewal-writeback-approvals";
import {
  getRenewalWorkingRecord,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import { claimLeaseScopedS113FieldUpdate } from "@/lib/firestore/s98-sheet-writeback-claim";
import {
  buildSheetWritebackProposal,
  sheetWritebackExecutionId,
  type SheetWritebackEffectInput,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SHEET_WRITEBACK_PROPOSALS_COLLECTION,
  getSheetWritebackProposal,
  sheetWritebackProposalDocId,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import { mintSheetWorkspaceContext } from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import { workingCurrentRent } from "@/lib/lease-renewal/working-record";

const projectId = "pmi-kc-kb-s160-sheet-working-rent-test";
const LEASE = "701";
const actor = {
  uid: "s160-editor",
  email: "s160-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const scope = { kind: "lease_workspace" as const, leaseId: LEASE };
const spreadsheetId = "s160-emulator-fixture-sheet";
const header = ["What is the Lease/Tenant name?", "Market Value", "Current Rent"];
let app: App, db: Firestore, environment: RulesTestEnvironment;
let sheetRent = "1000",
  mutations = 0,
  loseResponse = false,
  token = "";

function evidence() {
  return {
    value: { numberValue: Number(sheetRent) },
    formattedValue: sheetRent,
    numberFormat: "NUMBER",
    checkbox: false,
  };
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s160-sheet-working-rent-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("RENEWAL_SHEET_ID", spreadsheetId);
  vi.stubEnv("RENEWAL_DESK_PARTY_FILTER_KEY", Buffer.alloc(32, 31).toString("base64url"));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await environment.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  sheetRent = "1000";
  mutations = 0;
  loseResponse = false;
  testState.role = "Editor";
  testState.email = actor.email;
  token = mintSheetWorkspaceContext(actor.uid, LEASE)!;
  testState.context = () => ({
    leaseId: LEASE,
    propertyId: "702",
    tenantName: "Emulator Tenant",
    sourceReadAtIso: new Date().toISOString(),
    header,
    columns: new Map([
      ["tenant_name", 0],
      ["market_value", 1],
      ["current_rent", 2],
    ]),
    tenantColumnIndex: 0,
    association: { kind: "exact_link", rowNumber: 2 },
    row: {
      rowNumber: 2,
      rowKey: null,
      anchorTenantName: "Emulator Tenant",
      currentRentValue: sheetRent,
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
      fieldValues: { market_value: "1100", current_rent: sheetRent },
      formulaFields: [],
      cellEvidence: { current_rent: evidence() },
    },
  });
  testState.writer = {
    async getValues(_id, range) {
      if (range.endsWith("A1:AZ1")) return [header];
      if (range.endsWith("A2:A2")) return [["Emulator Tenant"]];
      if (range.endsWith("C2:C2")) return [[sheetRent]];
      throw new Error("Unexpected exact read");
    },
    async getCellEvidence() {
      return evidence();
    },
    async getSheetIdByTitle() {
      return 0;
    },
    async getColumnNotes() {
      return [{ rowNumber: 2, value: "Emulator Tenant", note: "" }];
    },
    async replaceCellIfExactMatch(_id, range, before, after) {
      expect(range).toBe("'Lease Renewal'!C2");
      if (before !== sheetRent) return false;
      mutations++;
      sheetRent = after;
      if (loseResponse)
        throw new Error("Provider double lost its response after applying");
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

async function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://local.test/api/lease-renewal/operating-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceContext: token, ...body }),
    }),
  );
}
async function saveWorkingRent(value: number | null) {
  const current = await getRenewalWorkingRecord(actor, LEASE, db);
  await saveRenewalWorkingField(
    actor,
    {
      leaseId: LEASE,
      field: "current_rent",
      value,
      expectedRevision: current?.fields.current_rent?.revision ?? 0,
      operationId: crypto.randomUUID(),
    },
    db,
  );
}
async function activeProposal() {
  return (await getSheetWritebackProposal(
    actor,
    spreadsheetId,
    "Lease Renewal",
    scope,
    db,
  ))!;
}
async function proposeWorkingRent(previous: string | null = null) {
  const response = await post({
    operation: "propose",
    intent: "update_working_current_rent",
    expectedPriorPreviewHash: previous,
  });
  return response;
}
function confirmation(proposal: SheetWritebackProposal) {
  return {
    operation: "execute",
    confirm: true,
    previewHash: proposal.previewHash,
    effectHash: proposal.effects[0].effectHash,
  };
}
async function collectionSize(name: string) {
  return (await db.collection(name).get()).size;
}

function proposalFor(generationId: string, effect: SheetWritebackEffectInput) {
  return buildSheetWritebackProposal({
    runtimeBinding: {
      version: "operating-sheet-runtime/v1",
      revision: "pmi-kc-app-test-enabled-a",
      policy: "explicit-owner-enabled/v1",
    },
    generationId,
    spreadsheetId,
    tabTitle: "Lease Renewal",
    headerHash: "d".repeat(64),
    headerWidth: 3,
    tenantColumnIndex: 0,
    scope: { kind: "lease_workspace", leaseId: LEASE, propertyId: "702" },
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    sourceReadAtIso: "2026-10-02T12:00:00.000Z",
    evidenceRef: `workspace:${LEASE}:fresh-live-join`,
    effects: [effect],
    nowMs: Date.now(),
  });
}
function workingRentEffect(value: number): SheetWritebackEffectInput {
  return {
    kind: "field_update",
    field: "current_rent",
    rowNumber: 2,
    rowKey: null,
    anchorTenantName: "Emulator Tenant",
    expectedValue: "1000",
    afterValue: String(value),
    source: "Working current rent",
    staffIntent: { field: "current_rent", value, source: "Working current rent" },
  };
}
async function seedClaim(proposal: SheetWritebackProposal) {
  const effect = proposal.effects[0];
  const executionId = sheetWritebackExecutionId(proposal, effect);
  const execution: ExternalExecutionRecord = {
    id: executionId,
    dataMode: "live",
    workflowId: "s98:Lease Renewal",
    actionId: executionId,
    actionKey: effect.actionKey,
    contextHash: proposal.previewHash,
    previewHash: proposal.previewHash,
    idempotencyKey: executionId,
    state: "ready",
    attemptCount: 0,
    createdAt: "2026-10-02T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
  };
  await Promise.all([
    db
      .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
      .doc(sheetWritebackProposalDocId(spreadsheetId, "Lease Renewal", scope))
      .set({ ...proposal, updated_at: "2026-10-02T12:00:00.000Z" }),
    db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(executionId).set(execution),
  ]);
  return {
    executionId,
    previewHash: proposal.previewHash,
    effectHash: effect.effectHash,
    spreadsheetId,
    tabTitle: "Lease Renewal",
    leaseId: LEASE,
    propertyId: "702",
  };
}
async function executionState(executionId: string) {
  return (
    await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(executionId).get()
  ).data();
}

describe("S160 one-attempt claim bound to the working current rent", () => {
  it("BEH-S160-1/10: claims exactly once while the working record still holds the previewed value, with no approval or work record", async () => {
    await saveWorkingRent(1850);
    const input = await seedClaim(
      proposalFor("working-rent-claim", workingRentEffect(1850)),
    );
    expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("claimed");
    expect(await executionState(input.executionId)).toMatchObject({
      state: "running",
      attemptCount: 1,
    });
    // A second confirmation of the same attempt never claims again.
    expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("blocked");
    // None of the removed prerequisites exists for this lease.
    for (const name of [
      LEASE_RENEWAL_COLLECTIONS.resolutions,
      LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals,
      RENEWAL_WORKSPACE_COLLECTIONS.head,
      "lease_renewal_progress",
    ])
      expect(await collectionSize(name), name).toBe(0);
  });

  it.each([
    ["changed", 1900],
    ["cleared", null],
  ] as const)(
    "BEH-S160-10: a working value %s after the preview blocks the claim and leaves the attempt unused",
    async (_label, next) => {
      await saveWorkingRent(1850);
      const input = await seedClaim(
        proposalFor("working-rent-drift", workingRentEffect(1850)),
      );
      await saveWorkingRent(next);
      expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("blocked");
      expect(await executionState(input.executionId)).toMatchObject({
        state: "ready",
        attemptCount: 0,
      });
    },
  );

  it("BEH-S160-10: a lease with no working current rent never claims a current-rent update", async () => {
    const input = await seedClaim(
      proposalFor("working-rent-absent", workingRentEffect(1850)),
    );
    expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("blocked");
  });

  it("BEH-S160-1: a recognized staff field claims for a lease that has no work record or cycle", async () => {
    const input = await seedClaim(
      proposalFor("market-no-work-record", {
        kind: "field_update",
        field: "market_value",
        rowNumber: 2,
        rowKey: null,
        anchorTenantName: "Emulator Tenant",
        expectedValue: "1100",
        afterValue: "1475",
        source: "Staff entry",
        staffIntent: { field: "market_value", value: 1475, source: "Staff entry" },
      }),
    );
    expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("claimed");
    expect(await collectionSize(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(0);
  });
});

describe("S160 / S159 current-rent Sheet update through the actual route", () => {
  it("BEH-S160-1/2/4/5: an Editor saves a working current rent, previews the exact Sheet update and confirms it once", async () => {
    await saveWorkingRent(1850);
    const proposed = await proposeWorkingRent();
    expect(proposed.status).toBe(200);
    const proposal = await activeProposal();
    expect(proposal.effects[0].effect).toMatchObject({
      field: "current_rent",
      expectedValue: "1000",
      afterValue: "1850",
      staffIntent: { field: "current_rent", value: 1850 },
    });
    expect(mutations).toBe(0);

    const confirmed = await post(confirmation(proposal));
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({
      status: "executed",
      duplicate: false,
    });
    expect(mutations).toBe(1);
    expect(sheetRent).toBe("1850");
    const executionId = sheetWritebackExecutionId(proposal, proposal.effects[0]);
    expect(await executionState(executionId)).toMatchObject({
      state: "succeeded",
      receipt: { actionKey: "google_sheets.renewal_checklist.field_update" },
    });
    // A repeated confirmation returns the durable receipt and writes nothing more.
    const replay = await post(confirmation(proposal));
    expect(await replay.json()).toMatchObject({ duplicate: true });
    expect(mutations).toBe(1);
    // The working record is the staff's own value; the update did not rewrite it.
    expect(workingCurrentRent(await getRenewalWorkingRecord(actor, LEASE, db))).toBe(
      1850,
    );
    for (const name of [
      LEASE_RENEWAL_COLLECTIONS.resolutions,
      LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals,
      RENEWAL_WORKSPACE_COLLECTIONS.head,
    ])
      expect(await collectionSize(name), name).toBe(0);
  });

  it("BEH-S160-4/10: a working value changed after the preview refuses the old confirmation; a fresh preview is confirmable", async () => {
    await saveWorkingRent(1850);
    await proposeWorkingRent();
    const old = await activeProposal();
    await saveWorkingRent(1900);
    const refused = await post(confirmation(old));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error_type).toBe("working_value_changed");
    expect(mutations).toBe(0);
    expect(
      await executionState(sheetWritebackExecutionId(old, old.effects[0])),
    ).toBeUndefined();

    expect((await proposeWorkingRent(old.previewHash)).status).toBe(200);
    const fresh = await activeProposal();
    expect((await post(confirmation(fresh))).status).toBe(200);
    expect(sheetRent).toBe("1900");
    expect(mutations).toBe(1);
  });

  it("BEH-S159-7: an uncertain Sheet result keeps the saved working value and the visible unfinished result", async () => {
    await saveWorkingRent(1850);
    await proposeWorkingRent();
    const proposal = await activeProposal();
    loseResponse = true;
    const uncertain = await post(confirmation(proposal));
    expect(uncertain.status).toBe(409);
    expect((await uncertain.json()).error_type).toBe("provider_ambiguous");
    // Reopening the lease finds the same saved working value.
    const reopened = await getRenewalWorkingRecord(actor, LEASE, db);
    expect(workingCurrentRent(reopened)).toBe(1850);
    // The unfinished result stays visible and is never sent a second time.
    const status = await (await post({ operation: "status" })).json();
    expect(status.effects[0].state).toBe("ambiguous");
    loseResponse = false;
    expect((await post(confirmation(proposal))).status).toBe(409);
    expect(mutations).toBe(1);
    // Other app work still saves after the failure.
    await saveWorkingRent(1875);
    expect(workingCurrentRent(await getRenewalWorkingRecord(actor, LEASE, db))).toBe(
      1875,
    );
  });

  it("AC-S160-1: a verification account cannot dispatch the update and consumes no attempt", async () => {
    await saveWorkingRent(1850);
    await proposeWorkingRent();
    const proposal = await activeProposal();
    testState.email = "canary-editor@pmikcmetro.com";
    const refused = await post(confirmation(proposal));
    expect(refused.status).toBe(403);
    expect(mutations).toBe(0);
    expect(await collectionSize(EXTERNAL_EXECUTION_COLLECTIONS.records)).toBe(0);
  });
});
