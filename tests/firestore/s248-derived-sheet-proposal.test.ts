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

// S248 R-S248-11 against the real Firestore emulator, the real workspace and operating Sheet routes
// and a provider double for the Sheet: a derived tenant offer (the app's own accepted tenant
// message, with no staff entry) prepares the same operating Sheet update proposal a staff record
// of the tenant offer prepares (the renewal letter field, Done), bound to that exact message.
// Preparing is a deliberate step; nothing is prepared or applied by reading. Applying keeps its own
// exact confirmation, one-attempt claim and receipt; the receipt marks the Finish up item verified.
// "This was not the renewal outreach" withdraws an unconfirmed value and its update cannot apply.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  writer: null as SheetWritebackWriter | null,
  context: null as (() => FreshOperatingSheetLeaseContext) | null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
const ACTOR = {
  uid: "s248-sheet-operator",
  email: "s248-sheet-operator@pmikcmetro.com",
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
import { POST as workspaceRoute } from "@/app/api/lease-renewal/workspace/route";
import { correctRenewalOutreach } from "@/lib/firestore/renewal-outreach-records";
import { mintSheetWorkspaceContext } from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import { getSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import type { SheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { derivedSourceEventId } from "@/lib/lease-renewal/workspace-sheet-sync";
import { projectRenewalStage } from "@/lib/lease-renewal/renewal-stage";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

const projectId = "pmi-kc-kb-s248-derived-sheet";
const LEASE = "701";
const spreadsheetId = "s248-emulator-fixture-sheet";
const scope = { kind: "lease_workspace" as const, leaseId: LEASE };
const header = ["What is the Lease/Tenant name?", "Have we sent the renewal letter?"];
let app: App, db: Firestore, environment: RulesTestEnvironment;
let cellValue = "",
  mutations = 0,
  token = "";

function cell() {
  return {
    value: { stringValue: cellValue },
    formattedValue: cellValue,
    numberFormat: "TEXT",
    checkbox: false,
  };
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s248-derived-sheet-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("RENEWAL_SHEET_ID", spreadsheetId);
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  vi.stubEnv("RENEWAL_DESK_PARTY_FILTER_KEY", Buffer.alloc(32, 29).toString("base64url"));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await environment.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  cellValue = "Not started";
  mutations = 0;
  token = mintSheetWorkspaceContext(ACTOR.uid, LEASE)!;
  testState.context = () => ({
    leaseId: LEASE,
    propertyId: "702",
    tenantName: "Emulator Tenant",
    sourceReadAtIso: new Date().toISOString(),
    header,
    columns: new Map([
      ["tenant_name", 0],
      ["renewal_letter_sent", 1],
    ]),
    tenantColumnIndex: 0,
    association: { kind: "exact_link", rowNumber: 2 },
    row: {
      rowNumber: 2,
      rowKey: null,
      anchorTenantName: "Emulator Tenant",
      currentRentValue: "1000",
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
      fieldValues: { renewal_letter_sent: cellValue },
      formulaFields: [],
      cellEvidence: { renewal_letter_sent: cell() },
    },
  });
  testState.writer = {
    async getValues(_id, range) {
      if (range.endsWith("A1:AZ1")) return [header];
      if (range.endsWith("A2:A2")) return [["Emulator Tenant"]];
      if (range.endsWith("B2:B2")) return [[cellValue]];
      throw new Error("Unexpected exact read");
    },
    async getCellEvidence() {
      return cell();
    },
    async getSheetIdByTitle() {
      return 0;
    },
    async getColumnNotes() {
      return [{ rowNumber: 2, value: "Emulator Tenant", note: "" }];
    },
    async replaceCellIfExactMatch(_id, range, before, after) {
      expect(range).toBe("'Lease Renewal'!B2");
      if (before !== cellValue) return false;
      mutations++;
      cellValue = after;
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
async function startCycle(): Promise<RenewalWorkspaceState> {
  const result = await workspace({
    operation: "start_cycle",
    leaseId: LEASE,
    basis: { kind: "lease_end", dateIso: "2026-12-31", source: "RentVine lease end" },
    expectedCycleId: null,
    expectedRevision: 0,
    operationId: randomUUID(),
    reason: "Reviewed fixture source context",
  });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.state;
}
async function proposal(): Promise<SheetWritebackProposal | null> {
  return getSheetWritebackProposal(ACTOR, spreadsheetId, "Lease Renewal", scope, db);
}
async function confirm(value: SheetWritebackProposal) {
  const response = await sheetRoute(
    new Request("http://local.test/api/lease-renewal/operating-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceContext: token,
        operation: "execute",
        confirm: true,
        previewHash: value.previewHash,
        effectHash: value.effects[0]!.effectHash,
      }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

/** The app's own accepted tenant offer for this cycle, as the communication store holds it. */
async function seedAcceptedTenantOffer(cycleId: string) {
  const sequenceId = randomUUID();
  const occurrenceId = "d".repeat(60) + "0001";
  const sentAtMs = Date.now() - 60 * 60_000;
  await db
    .collection("gmail_communication_sequences")
    .doc(sequenceId)
    .set({
      schemaVersion: "workflow-communication-sequence/v1",
      context: {
        lane: "renewals",
        entityType: "renewal_lease",
        entityId: LEASE,
        purpose: "renewal_tenant",
        actionKey: "gmail.renewal_notice.send",
        sourceRefs: [],
      },
      state: "completed",
      createdAtMs: sentAtMs - 60_000,
      noticeCycleId: cycleId,
      threads: [
        {
          senderEmail: ACTOR.email,
          threadId: "thread-1",
          messageId: "provider-1",
          rfcMessageId: `<pmi-${occurrenceId}@pmikcmetro.com>`,
          sentAtMs,
        },
      ],
      inbound: [],
      authorization: {
        revision: 1,
        approvedByUid: ACTOR.uid,
        senderEmail: ACTOR.email,
        approvedAtMs: sentAtMs - 30_000,
        payloadHash: "b".repeat(64),
        schedule: null,
      },
      confirmedCount: 1,
      nextDueAtMs: null,
      unresolvedOccurrenceId: null,
    });
  return { sequenceId, occurrenceId };
}

describe("S248 R-S248-11: a derived record prepares the staff record's Sheet update", () => {
  it("the staff record and the derived record prepare the same field, row and Done", async () => {
    // The staff record of the tenant offer and its prepared update.
    let state = await startCycle();
    const recorded = await workspace({
      operation: "record",
      leaseId: LEASE,
      cycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: randomUUID(),
      action: { kind: "activity", activity: "tenant_offer", outcome: "done" },
    });
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200);
    state = recorded.body.state;
    const staffEvent = state.sourceUpdates.renewal_letter_sent!.eventId;
    const staffPrepared = await workspace({
      operation: "prepare_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      field: "renewal_letter_sent",
      eventId: staffEvent,
    });
    expect(staffPrepared.status).toBe(200);
    const staff = (await proposal())!;

    // A fresh lease state: no staff entry, and the app's own accepted tenant offer.
    await environment.clearFirestore();
    state = await startCycle();
    const message = await seedAcceptedTenantOffer(state.cycleId);
    // Reading never prepares anything.
    expect(await proposal()).toBeNull();
    const derivedPrepared = await workspace({
      operation: "prepare_derived_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      audience: "tenant",
      ...message,
    });
    expect(derivedPrepared.status, JSON.stringify(derivedPrepared.body)).toBe(200);
    const derived = (await proposal())!;
    const staffEffect = staff.effects[0]!.effect;
    const derivedEffect = derived.effects[0]!.effect;
    for (const key of ["kind", "field", "rowNumber", "expectedValue"] as const)
      expect((derivedEffect as unknown as Record<string, unknown>)[key]).toEqual(
        (staffEffect as unknown as Record<string, unknown>)[key],
      );
    expect(derivedEffect.kind === "field_update" && derivedEffect.field).toBe(
      "renewal_letter_sent",
    );
    expect(String((staffEffect as { afterValue: string }).afterValue)).toMatch(/^Done/);
    expect((derivedEffect as { afterValue: string }).afterValue).toBe(
      "Done, from the app's confirmed send",
    );
    // Bound to the exact message, in the staff value's own identity shape.
    expect(derived.evidenceRef).toBe(
      `workspace:${LEASE}:cycle:${state.cycleId}:manual:${derivedSourceEventId(message.occurrenceId)}`,
    );
    const entry = (derivedPrepared.body.state as RenewalWorkspaceState).sourceUpdates
      .renewal_letter_sent!;
    expect(entry).toMatchObject({
      state: "prepared",
      derivedFrom: message,
      intent: { source: "From the app's confirmed send" },
    });
    expect(mutations).toBe(0);
  });

  it("applying it keeps its own confirmation, one attempt and receipt, and the receipt marks Finish up", async () => {
    const state = await startCycle();
    const message = await seedAcceptedTenantOffer(state.cycleId);
    await workspace({
      operation: "prepare_derived_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      audience: "tenant",
      ...message,
    });
    const prepared = (await proposal())!;
    expect(mutations).toBe(0);
    const applied = await confirm(prepared);
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body).toMatchObject({
      status: "executed",
      workspaceSynchronization: { state: "verified" },
    });
    expect(cellValue).toBe("Done, from the app's confirmed send");
    expect(mutations).toBe(1);
    const again = await confirm(prepared);
    expect(again.body).toMatchObject({ duplicate: true });
    expect(mutations).toBe(1);
    // The verified receipt marks the Finish up item done, verified by the provider.
    const current = (
      await workspace({
        operation: "prepare_derived_source",
        leaseId: LEASE,
        cycleId: state.cycleId,
        audience: "tenant",
        ...message,
      })
    ).body.state as RenewalWorkspaceState;
    expect(current.sourceUpdates.renewal_letter_sent!.state).toBe("verified");
    const stage = projectRenewalStage(current, {
      leaseId: LEASE,
      staffRecordUnavailable: false,
      standingAgreement: null,
      housingAssistance: null,
      numbers: { verified: true, openDifferences: 0 },
      term: { monthToMonth: false, reviewNeeded: false },
      moveOutInitiated: false,
      sourceRenewal: null,
      verification: null,
      handStatus: null,
      lastContactAtIso: null,
      threadCheck: null,
      outreach: null,
    });
    expect(
      stage.finishUp.find((item) => item.key === "sheet:renewal_letter_sent"),
    ).toMatchObject({ done: true, origin: "provider_verified" });
    expect(mutations).toBe(1);
  });

  it("This was not the renewal outreach withdraws the unconfirmed value, and its update cannot apply", async () => {
    const state = await startCycle();
    const message = await seedAcceptedTenantOffer(state.cycleId);
    await workspace({
      operation: "prepare_derived_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      audience: "tenant",
      ...message,
    });
    const prepared = (await proposal())!;
    await correctRenewalOutreach(
      ACTOR,
      {
        leaseId: LEASE,
        cycleId: state.cycleId,
        audience: "tenant",
        ...message,
        reason: "That message went to a different tenant.",
        operationId: randomUUID(),
      },
      db,
    );
    const refused = await confirm(prepared);
    expect(refused.status).toBe(409);
    expect(mutations).toBe(0);
    expect(cellValue).toBe("Not started");
    // And it cannot be prepared again from the removed message.
    const again = await workspace({
      operation: "prepare_derived_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      audience: "tenant",
      ...message,
    });
    expect(again.status).toBe(409);
  });

  it("owner outreach has no Sheet column, for a derived record exactly as for a staff one", async () => {
    const state = await startCycle();
    const result = await workspace({
      operation: "prepare_derived_source",
      leaseId: LEASE,
      cycleId: state.cycleId,
      audience: "owner",
      sequenceId: randomUUID(),
      occurrenceId: "e".repeat(64),
    });
    expect(result.status).toBe(409);
    expect(await proposal()).toBeNull();
  });
});
