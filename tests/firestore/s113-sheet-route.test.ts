import { readIndependentDecisionFacts } from "../../scripts/run-production-reconciliation";
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { createPendingRequestTracker } from "../helpers/pending-requests";
import { runAfterImmediateSourceDrain } from "../helpers/immediate-source-drain";
import {
  clearLiveLeaseCache,
  invalidateLiveLeaseCache,
} from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import type { SheetWritebackWriter } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import type { SheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  writer: null as SheetWritebackWriter | null,
  context: null as (() => FreshOperatingSheetLeaseContext) | null,
  role: "Admin",
  uid: "s113-operator",
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => ({
    uid: testState.uid,
    email: "s113-operator@pmikcmetro.com",
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

import { GET, POST } from "@/app/api/lease-renewal/operating-sheet/route";
import { GET as getNoticeReviewRoute } from "@/app/api/lease-renewal/notice-review/route";
import { GET as getRentSuggestionRoute } from "@/app/api/lease-renewal/rent-suggestion/route";
import { mintSheetWorkspaceContext } from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import {
  getSheetWritebackProposal,
  listSheetWritebackProposalHistory,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import { sheetWritebackExecutionId } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

// Only the two pending Dotloop keys are opened in this isolated test module; production seed stays closed.
vi.mock("@/lib/integrations/action-registry-seed", async (original) => {
  const actual =
    await original<typeof import("@/lib/integrations/action-registry-seed")>();
  return {
    ...actual,
    ACTION_REGISTRY_SEED: actual.ACTION_REGISTRY_SEED.map((entry) =>
      ["dotloop.loop.create_from_template", "dotloop.document.upload"].includes(entry.key)
        ? {
            ...entry,
            production_allowed: true,
            readiness: "Approved for Execution",
            evidence_status: "Documented",
          }
        : entry,
    ),
  };
});
const packetTransport = vi.hoisted(() => ({
  runtime: null as unknown,
  loseReadback: false,
}));
vi.mock("@/lib/connections/dotloop-runtime", async (original) => {
  const actual = await original<typeof import("@/lib/connections/dotloop-runtime")>();
  return {
    ...actual,
    createDotloopRuntime: () => packetTransport.runtime,
    readDotloopRuntimeReadiness: async () =>
      packetTransport.runtime
        ? { state: "connected", reasons: [] }
        : { state: "disconnected", reasons: ["account_connection"] },
    // S106: provider-write admission refreshes the labeled observation before dispatch.
    refreshDotloopResourceReadiness: async () => ({
      readiness: packetTransport.runtime
        ? { state: "connected", reasons: [] }
        : { state: "disconnected", reasons: ["account_connection"] },
      observation: null,
    }),
  };
});

const projectId = "pmi-kc-kb-s113-sheet-route-test";
const actor = {
  uid: "s113-operator",
  email: "s113-operator@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const scope = { kind: "lease_workspace" as const, leaseId: "701" };
const spreadsheetId = "s113-emulator-fixture-sheet";
const header = ["What is the Lease/Tenant name?", "Market Value", "Current Rent"];
let app: App, db: Firestore, environment: RulesTestEnvironment;
const REQUEST_DRAIN_TIMEOUT_MS = 5_000;
const JOURNEY_SETTLE_TIMEOUT_MS = 30_000;
let mountedRequests = createPendingRequestTracker();
let mountedReadDiagnostics: () => Record<string, unknown> = () => ({});
let assertMountedReadbacks: () => void = () => undefined;
let observeMountedTransaction:
  | ((request: Promise<unknown>, callerStack: string) => void)
  | null = null;
let marketValue = "1000",
  mutations = 0,
  loseResponse = false,
  token = "";
function evidence() {
  return {
    value: { numberValue: Number(marketValue) },
    formattedValue: marketValue,
    numberFormat: "NUMBER",
    checkbox: false,
  };
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s113-sheet-route-${process.pid}`);
  db = getFirestore(app);
  const runTransaction = db.runTransaction;
  db.runTransaction = function (
    this: Firestore,
    ...args: Parameters<Firestore["runTransaction"]>
  ) {
    const observer = observeMountedTransaction;
    const callerStack = observer ? (new Error().stack ?? "") : "";
    // Exact receiver, callback, options and returned promise are unchanged. Terminal observers
    // only record fixed categories; no transaction document, body or raw stack is retained.
    const request = Reflect.apply(runTransaction, this, args) as Promise<unknown>;
    observer?.(request, callerStack);
    return request;
  } as Firestore["runTransaction"];
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("RENEWAL_SHEET_ID", spreadsheetId);
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  vi.stubEnv("RENEWAL_DESK_PARTY_FILTER_KEY", Buffer.alloc(32, 29).toString("base64url"));
});
afterAll(async () => {
  await runAfterImmediateSourceDrain(
    mountedRequests,
    async () => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await deleteApp(app);
      await environment.cleanup();
    },
    REQUEST_DRAIN_TIMEOUT_MS,
  );
});
beforeEach(async () => {
  // A failed afterEach must not let a later test clear a store still owned by a request.
  await runAfterImmediateSourceDrain(
    mountedRequests,
    async () => {
      vi.unstubAllGlobals();
      await environment.clearFirestore();
    },
    REQUEST_DRAIN_TIMEOUT_MS,
  );
  mountedRequests = createPendingRequestTracker();
  mountedReadDiagnostics = () => ({});
  assertMountedReadbacks = () => undefined;
  observeMountedTransaction = null;
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
  marketValue = "1000";
  packetTransport.runtime = null;
  messageTransport.creates = 0;
  messageTransport.raw = "";
  messageTransport.disconnected = false;
  messageTransport.loseResponse = false;
  mutations = 0;
  loseResponse = false;
  testState.role = "Admin";
  testState.uid = actor.uid;
  token = mintSheetWorkspaceContext(actor.uid, "701")!;
  testState.context = () => ({
    leaseId: "701",
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
      currentRentValue: "1000",
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
      fieldValues: { market_value: marketValue, current_rent: "1000" },
      formulaFields: [],
      cellEvidence: { market_value: evidence() },
    },
  });
  testState.writer = {
    async getValues(_id, range) {
      if (range.endsWith("A1:AZ1")) return [header];
      if (range.endsWith("A2:A2")) return [["Emulator Tenant"]];
      if (range.endsWith("B2:B2")) return [[marketValue]];
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
      expect(range).toBe("'Lease Renewal'!B2");
      if (before !== marketValue) return false;
      mutations++;
      marketValue = after;
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
async function propose(
  value: number,
  previous: string | null = null,
): Promise<SheetWritebackProposal> {
  const response = await post({
    operation: "propose",
    intent: "update_field",
    expectedPriorPreviewHash: previous,
    fieldIntent: {
      field: "market_value",
      value,
      source: "Reviewed emulator comparables",
    },
  });
  expect(response.status).toBe(200);
  return (await getSheetWritebackProposal(
    actor,
    spreadsheetId,
    "Lease Renewal",
    scope,
    db,
  ))!;
}
function confirmation(proposal: SheetWritebackProposal) {
  return {
    operation: "execute",
    confirm: true,
    previewHash: proposal.previewHash,
    effectHash: proposal.effects[0].effectHash,
  };
}

describe("S113 actual Sheet backend with persisted attempt and provider double", () => {
  it("previews, confirms once, rereads a persisted receipt, and preserves the first correction history", async () => {
    const proposal = await propose(1100);
    expect(mutations).toBe(0);
    const status = await (await post({ operation: "status" })).json();
    expect(status.effects[0]).toMatchObject({
      effect_executable: true,
      state: "not_started",
    });
    const response = await post(confirmation(proposal));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "pmi_renewal_source_refresh_after=",
    );
    const result = await response.json();
    expect(result).toMatchObject({ status: "executed", duplicate: false });
    expect(marketValue).toBe("1100");
    expect(mutations).toBe(1);
    const executionId = sheetWritebackExecutionId(proposal, proposal.effects[0]);
    const persisted = (
      await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(executionId).get()
    ).data();
    expect(persisted).toMatchObject({
      state: "succeeded",
      attemptCount: 1,
      receipt: { resultHash: result.receipt.result_hash },
    });
    const duplicate = await (await post(confirmation(proposal))).json();
    expect(duplicate).toMatchObject({ duplicate: true, receipt: result.receipt });
    expect(mutations).toBe(1);
    const statusRead = await GET(
      new Request("http://local.test/api/lease-renewal/operating-sheet", {
        headers: { "x-renewal-workspace-context": token },
      }),
    );
    expect(statusRead.status).toBe(200);
    expect((await statusRead.json()).effects[0]).toMatchObject({
      state: "succeeded",
      attempt_count: 1,
    });
    expect(mutations).toBe(1);
    const correction = await propose(1150, proposal.previewHash);
    expect(correction.effects[0].effect).toMatchObject({
      expectedValue: "1100",
      afterValue: "1150",
    });
    expect(mutations).toBe(1);
    const history = await listSheetWritebackProposalHistory(
      actor,
      spreadsheetId,
      "Lease Renewal",
      scope,
      db,
    );
    expect(history[0]).toMatchObject({
      executionId,
      proposal: { previewHash: proposal.previewHash },
    });
    expect((await post(confirmation(correction))).status).toBe(200);
    expect(mutations).toBe(2);
    expect(marketValue).toBe("1150");
  });
  it("leaves a lost response ambiguous and prevents retry, replacement, or invented success", async () => {
    const proposal = await propose(1100);
    loseResponse = true;
    expect((await post(confirmation(proposal))).status).toBe(409);
    const status = await (await post({ operation: "status" })).json();
    expect(status.effects[0]).toMatchObject({ state: "ambiguous", attempt_count: 1 });
    expect(status.effects[0].receipt).toBeUndefined();
    expect((await post(confirmation(proposal))).status).toBe(409);
    expect(
      (
        await post({
          operation: "propose",
          intent: "update_field",
          expectedPriorPreviewHash: proposal.previewHash,
          fieldIntent: {
            field: "market_value",
            value: 1200,
            source: "Reviewed emulator comparables",
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (await post({ operation: "discard", previewHash: proposal.previewHash })).status,
    ).toBe(409);
    expect(mutations).toBe(1);
    expect(marketValue).toBe("1100");
  });
  it("S160: lets an Editor confirm the exact update once (the verification-account refusal is pinned in s160-sheet-working-rent)", async () => {
    const proposal = await propose(1100);
    const executionId = sheetWritebackExecutionId(proposal, proposal.effects[0]);
    testState.role = "Editor";
    expect((await post(confirmation(proposal))).status).toBe(200);
    expect(mutations).toBe(1);
    expect(
      (
        await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(executionId).get()
      ).get("state"),
    ).toBe("succeeded");
  });
});

// Resource settings use the actual HTTP boundary and persisted Admin-owned settings on this emulator.
import {
  GET as getResourceRoute,
  POST as postResourceRoute,
} from "@/app/api/lease-renewal/resource-locations/route";
import { RENEWAL_RESOURCE_COLLECTIONS } from "@/lib/firestore/renewal-resource-locations";
function resourceRequest(body: unknown) {
  return new Request("http://local.test/api/lease-renewal/resource-locations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("S113 resource locations persisted through the actual route", () => {
  it("accepts blank input, saves and replaces a link, and rereads private audit history", async () => {
    expect(await (await getResourceRoute()).json()).toMatchObject({
      settings: { version: 0, entries: {} },
    });
    const blank = {
      expectedVersion: 0,
      operationId: "8d8ff190-b11f-4306-a28f-3ddcf3a96f38",
      resource: { id: "insurance_flyer", url: "", verified: false },
    };
    expect((await postResourceRoute(resourceRequest(blank))).status).toBe(200);
    expect(await (await postResourceRoute(resourceRequest(blank))).json()).toMatchObject({
      duplicate: true,
      settings: { version: 1 },
    });
    const saved = {
      ...blank,
      expectedVersion: 1,
      operationId: "e831eb89-2f0e-4bde-8cbc-ecff377cf664",
      resource: { ...blank.resource, url: "https://example.org/flyer.pdf" },
    };
    expect((await postResourceRoute(resourceRequest(saved))).status).toBe(200);
    expect(
      (
        await postResourceRoute(
          resourceRequest({
            ...saved,
            resource: { ...saved.resource, url: "https://example.org/changed.pdf" },
          }),
        )
      ).status,
    ).toBe(409);
    const replace = {
      ...saved,
      expectedVersion: 2,
      operationId: "f42aaf5a-63de-485a-86cc-ebdc4b2c92d9",
      resource: {
        ...saved.resource,
        url: "https://fixture-rental.net/new-flyer.pdf",
        verified: true,
      },
    };
    expect((await postResourceRoute(resourceRequest(replace))).status).toBe(200);
    expect(await (await getResourceRoute()).json()).toMatchObject({
      settings: { version: 3, entries: { insurance_flyer: replace.resource } },
    });
    const history = await db.collection(RENEWAL_RESOURCE_COLLECTIONS.activity).get();
    expect(history.size).toBe(3);
    expect(
      history.docs.find((doc) => doc.id === replace.operationId)?.data(),
    ).toMatchObject({
      prior: saved.resource,
      next: replace.resource,
      actor_uid: actor.uid,
    });
  });
  it("refuses invalid links and Editor saves without creating a settings record", async () => {
    const body = {
      expectedVersion: 0,
      operationId: "8d8ff190-b11f-4306-a28f-3ddcf3a96f38",
      resource: { id: "insurance_flyer", url: "javascript:alert(1)", verified: true },
    };
    expect((await postResourceRoute(resourceRequest(body))).status).toBe(400);
    testState.role = "Editor";
    expect(
      (
        await postResourceRoute(
          resourceRequest({
            ...body,
            resource: { ...body.resource, url: "https://fixture-rental.net/flyer.pdf" },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await db.collection(RENEWAL_RESOURCE_COLLECTIONS.settings).get()).empty).toBe(
      true,
    );
  });
});

import { randomUUID } from "node:crypto";
import {
  POST as postWorkspaceRoute,
  GET as getWorkspaceRoute,
} from "@/app/api/lease-renewal/workspace/route";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import {
  MANUAL_ACTIVITIES,
  manualRenewalSummary,
  type RenewalWorkspaceState,
  type RenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
vi.mock("@/lib/lease-renewal/workspace-cycle-context", () => ({
  resolveRenewalCycleBasis: async () => ({
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  }),
  // S154: the first saved work establishes the record from the same deterministic basis.
  resolveRenewalWorkBasis: async () => ({
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  }),
}));
function workspaceRequest(body: unknown) {
  return new Request("http://local.test/api/lease-renewal/workspace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function startManual(prior: RenewalWorkspaceState | null = null) {
  const response = await postWorkspaceRoute(
    workspaceRequest({
      operation: "start_cycle",
      leaseId: "701",
      basis: { kind: "lease_end", dateIso: "2026-12-31", source: "RentVine lease end" },
      expectedCycleId: prior?.cycleId ?? null,
      expectedRevision: prior?.revision ?? 0,
      operationId: randomUUID(),
      reason: "Reviewed fixture source context",
    }),
  );
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result.state as RenewalWorkspaceState;
}
/** S66 (AC-S66-8): an owner approval covers the Working terms saved before it is recorded. */
async function saveWorkingTerms(terms: {
  rent: number;
  effectiveDate: string;
  endDate: string;
}) {
  const { getRenewalWorkingRecord, saveRenewalWorkingField } =
    await import("@/lib/firestore/renewal-working-record");
  for (const [field, value] of [
    ["terms_rent", terms.rent],
    ["terms_effective_date", terms.effectiveDate],
    ["terms_end_date", terms.endDate],
  ] as const) {
    const current = await getRenewalWorkingRecord(actor, "701", db);
    await saveRenewalWorkingField(
      actor,
      {
        leaseId: "701",
        field,
        value,
        expectedRevision: current?.fields[field]?.revision ?? 0,
        operationId: randomUUID(),
      },
      db,
    );
  }
}
async function recordManual(
  state: RenewalWorkspaceState,
  action: RenewalWorkspaceAction,
) {
  const input = {
    operation: "record",
    leaseId: state.leaseId,
    cycleId: state.cycleId,
    expectedRevision: state.revision,
    operationId: randomUUID(),
    action,
  };
  const response = await postWorkspaceRoute(workspaceRequest(input));
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return { ...result, state: result.state as RenewalWorkspaceState, input };
}
/** S155/S160: a recorded value stays pending until staff deliberately prepare its Sheet update. */
async function prepareSource(
  state: RenewalWorkspaceState,
  field: string,
  eventId: string,
) {
  const response = await postWorkspaceRoute(
    workspaceRequest({
      operation: "prepare_source",
      leaseId: state.leaseId,
      cycleId: state.cycleId,
      field,
      eventId,
    }),
  );
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result.state as RenewalWorkspaceState;
}
describe("S113 actual manual route and durable cycle state", () => {
  it("records a complete staff journey without creating provider receipts or changing legacy completion", async () => {
    testState.role = "Editor";
    await db.collection("lease_renewal_progress").doc("701").set({
      lease_id: "701",
      complete: false,
      preserved_evidence: "fixture legacy record",
    });
    let state = await startManual();
    state = (
      await recordManual(state, {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Recorded phone approval",
      })
    ).state;
    state = (
      await recordManual(state, {
        kind: "tenant_response",
        outcome: "accepted",
        source: "Recorded tenant email",
      })
    ).state;
    for (const [activity, definition] of Object.entries(MANUAL_ACTIVITIES)) {
      if (activity === "non_renewal_handoff") continue;
      state = (
        await recordManual(state, {
          kind: "activity",
          activity: activity as keyof typeof MANUAL_ACTIVITIES,
          outcome: definition.conditional ? "not_applicable" : "done",
          ...(definition.conditional
            ? { applicabilityPolicy: "Emulator approved follow-up policy" }
            : {}),
          source: "Reviewed fixture lease and completed external work",
          ...(definition.conditional
            ? { reason: "Reviewed source confirms this follow-up does not apply" }
            : {}),
        })
      ).state;
    }
    const final = await recordManual(state, {
      kind: "complete",
      source: "Reviewed applicable checklist",
    });
    state = final.state;
    expect(manualRenewalSummary(state)).toMatchObject({
      complete: true,
      label: "Completed: recorded by staff",
    });
    expect(manualRenewalSummary(state).pendingSourceUpdates).toBeGreaterThan(0);
    expect(
      (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).get()).empty,
    ).toBe(true);
    expect(
      (await db.collection("lease_renewal_progress").doc("701").get()).data(),
    ).toEqual({
      lease_id: "701",
      complete: false,
      preserved_evidence: "fixture legacy record",
    });
    const duplicate = await postWorkspaceRoute(workspaceRequest(final.input));
    expect(await duplicate.json()).toMatchObject({
      duplicate: true,
      state: { revision: state.revision },
    });
    const read = await getWorkspaceRoute(
      new Request("http://local.test/api/lease-renewal/workspace?leaseId=701"),
    );
    const persisted = await read.json();
    expect(persisted.state).toEqual(state);
    expect(persisted.activity).toHaveLength(state.revision + 1);
    const next = await startManual(state);
    expect(next.cycleId).not.toBe(state.cycleId);
    expect(next.ownerResponse).toBeNull();
    expect(manualRenewalSummary(next).complete).toBe(false);
    expect(
      (
        await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(state.cycleId).get()
      ).data(),
    ).toEqual(state);
  });
  it("rejects changed duplicate requests and stale concurrent edits, and preserves terms history", async () => {
    let state = await startManual();
    const action: RenewalWorkspaceAction = {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      source: "Owner email",
    };
    const first = await recordManual(state, action);
    expect(
      (
        await postWorkspaceRoute(
          workspaceRequest({
            ...first.input,
            action: { ...action, source: "Changed source" },
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await postWorkspaceRoute(
          workspaceRequest({ ...first.input, operationId: randomUUID() }),
        )
      ).status,
    ).toBe(409);
    state = (
      await recordManual(first.state, {
        kind: "activity",
        activity: "tenant_offer",
        outcome: "done",
        source: "Email",
      })
    ).state;
    state = (
      await recordManual(state, {
        ...action,
        terms: { rent: 1300, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      })
    ).state;
    expect(state.activities.tenant_offer?.termsRevision).not.toBe(state.termsRevision);
    expect(
      (
        await db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
          .doc(first.input.operationId)
          .get()
      ).get("next_state.ownerResponse.terms.rent"),
    ).toBe(1250);
  });
  it("records an approval without terms (S156) and refuses browser-forged provider fields before persisting", async () => {
    const state = await startManual();
    const base = {
      operation: "record",
      leaseId: "701",
      cycleId: state.cycleId,
      expectedRevision: 0,
      operationId: randomUUID(),
    };
    // S156 BEH-4: the approval is the recorded answer; exact terms live on the working record.
    expect(
      (
        await postWorkspaceRoute(
          workspaceRequest({
            ...base,
            action: {
              kind: "owner_response",
              outcome: "approved_terms",
              source: "Email",
            },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await postWorkspaceRoute(
          workspaceRequest({
            ...base,
            action: {
              kind: "preparation",
              source: "Typed",
              provider: { source: "RentCast", pointEstimate: 1300 },
            },
          }),
        )
      ).status,
    ).toBe(400);
    // The cycle start and the recorded approval; nothing from the refused provider fields.
    expect((await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).get()).size).toBe(
      2,
    );
  });
});

import {
  POST as compRoute,
  resetMarketCompsCacheForTests,
} from "@/app/api/lease-renewal/market-comps/route";
import { RENTCAST_USAGE_COLLECTION } from "@/lib/firestore/rentcast-usage";
vi.mock("@/lib/lease-renewal/market-comp-query-resolver", () => ({
  resolveCurrentMarketCompQueryBasis: async (_actor: unknown, leaseId: string) => ({
    leaseId,
    addressLabel: "Emulator subject address",
    policy: {
      maxRadiusMiles: 2,
      requestedCompCount: 15,
      lookupSubjectAttributes: true,
      providerVersion: "rentcast-avm-long-term-v1",
    },
    query: { bedrooms: 2 },
    attributes: [],
    baseRent: {
      status: "verified",
      value: 1200,
      sourcePath: "lease detail baseRentAmount",
    },
    trendPostalCode: "64118",
  }),
}));
describe("S113 comp route through actual adapter and retained preparation", () => {
  it("meters deterministic comp/trend responses and reloads their exact attributed basis before owner approval", async () => {
    const savedFetch = globalThis.fetch,
      oldProvider = process.env.MARKET_COMP_PROVIDER,
      oldKey = process.env.RENTCAST_API_KEY;
    process.env.MARKET_COMP_PROVIDER = "rentcast";
    process.env.RENTCAST_API_KEY = "emulator-transport-fixture";
    let requests = 0,
      fail = false;
    vi.stubGlobal("fetch", async (url: string) => {
      requests++;
      if (fail) return new Response("unavailable", { status: 503 });
      return Response.json(
        String(url).includes("/markets")
          ? { history: { "2026-08": { averageRent: 1275, medianRent: 1250 } } }
          : {
              rent: 1300,
              rentRangeLow: 1200,
              rentRangeHigh: 1400,
              comparables: [
                { price: 1250, correlation: 0.91 },
                { price: 1350, correlation: 0.84 },
                { price: 1300, correlation: 0.79 },
              ],
              subjectProperty: { bedrooms: 2 },
            },
      );
    });
    const call = (body: unknown) =>
      compRoute(
        new Request("http://local.test/api/lease-renewal/market-comps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    try {
      resetMarketCompsCacheForTests();
      let state = await startManual();
      const response = await call({
        leaseId: "701",
        capture: { cycleId: state.cycleId },
      });
      const comps = await response.json();
      expect(response.status, JSON.stringify(comps)).toBe(200);
      expect(comps).toMatchObject({
        source: "RentCast",
        confidence: "Likely",
        pointEstimate: 1300,
      });
      expect(comps.observationId).toBeTypeOf("string");
      const trend = await (
        await call({
          leaseId: "701",
          operation: "trend",
          capture: { cycleId: state.cycleId, compObservationId: comps.observationId },
        })
      ).json();
      expect(trend.observationId).toBeTypeOf("string");
      state = (
        await recordManual(state, {
          kind: "preparation",
          source: "Reviewed provider results and separate staff range",
          rangeLow: 1100,
          rangeHigh: 1200,
          observationId: comps.observationId,
          trendObservationId: trend.observationId,
        })
      ).state;
      expect(state.ownerResponse).toBeNull();
      expect(state.preparation?.market).toMatchObject({
        rangeLow: 1100,
        rangeHigh: 1200,
        provider: {
          source: "RentCast",
          pointEstimate: 1300,
          comps: [
            { rent: 1250, correlation: 0.91 },
            { rent: 1350, correlation: 0.84 },
            { rent: 1300, correlation: 0.79 },
          ],
          trend: { months: { "2026-08": { averageRent: 1275, medianRent: 1250 } } },
        },
      });
      const reread = await (
        await getWorkspaceRoute(
          new Request("http://local.test/api/lease-renewal/workspace?leaseId=701"),
        )
      ).json();
      expect(reread.state).toEqual(state);
      expect(reread.observations).toHaveLength(1);
      expect(requests).toBe(2);
      expect(
        (await db.collection(RENTCAST_USAGE_COLLECTION).get()).docs[0].get(
          "billed_calls",
        ),
      ).toBe(2);
      resetMarketCompsCacheForTests();
      fail = true;
      const failed = await (
        await call({ leaseId: "701", capture: { cycleId: state.cycleId } })
      ).json();
      expect(failed).toMatchObject({
        confidence: "Needs Verification",
        reason: "http_error",
      });
      const retained = await (
        await getWorkspaceRoute(
          new Request("http://local.test/api/lease-renewal/workspace?leaseId=701"),
        )
      ).json();
      expect(retained.state.preparation).toEqual(state.preparation);
      expect(
        (
          await call({
            leaseId: "701",
            operation: "trend",
            capture: { cycleId: state.cycleId, compObservationId: randomUUID() },
          })
        ).status,
      ).toBe(409);
      expect(requests).toBe(3);
    } finally {
      vi.stubGlobal("fetch", savedFetch);
      if (oldProvider === undefined) delete process.env.MARKET_COMP_PROVIDER;
      else process.env.MARKET_COMP_PROVIDER = oldProvider;
      if (oldKey === undefined) delete process.env.RENTCAST_API_KEY;
      else process.env.RENTCAST_API_KEY = oldKey;
      resetMarketCompsCacheForTests();
    }
  });
});

describe("S118 saved comparison preparation prepares the Sheet market value for separate confirmation", () => {
  it("AC-S118-3: an Editor's saved PMI recommendation becomes the exact prepared Market value; withdrawing it removes the unconfirmed update and nothing is written", async () => {
    testState.role = "Editor";
    let state = await startManual();
    state = (
      await recordManual(state, {
        kind: "preparation",
        source: "Reviewed RentCast result and two listings",
        rangeLow: 1450,
        rangeHigh: 1650,
        pmiNumber: 1550,
        rangeBasis: "provider",
        recommendationBasis: "provider",
      })
    ).state;
    expect(state.preparation?.market).toMatchObject({
      pmiNumber: 1550,
      rangeBasis: "provider",
      recommendationBasis: "provider",
    });
    expect(Object.keys(state.sourceUpdates)).toEqual(["market_value"]);
    // S155: saving reads and writes no Sheet; the value waits until staff prepare it.
    expect(state.sourceUpdates.market_value.state).toBe("pending");
    state = await prepareSource(
      state,
      "market_value",
      state.sourceUpdates.market_value.eventId,
    );
    expect(state.sourceUpdates.market_value).toMatchObject({
      state: "prepared",
      intent: {
        field: "market_value",
        value: 1550,
        source: "Reviewed RentCast result and two listings",
      },
    });
    expect(mutations).toBe(0);
    const proposal = (await getSheetWritebackProposal(
      actor,
      spreadsheetId,
      "Lease Renewal",
      scope,
      db,
    ))!;
    expect(proposal.effects).toHaveLength(1);
    expect(proposal.effects[0].effect).toMatchObject({
      kind: "field_update",
      staffIntent: { field: "market_value", value: 1550 },
    });
    // The low/high range never becomes a Sheet column; only the recommendation is proposed.
    // The content hash is hex and can contain either digit run by chance, so it is excluded.
    const effectsWithoutHash = proposal.effects.map((effect) => ({
      ...effect,
      effectHash: undefined,
    }));
    expect(JSON.stringify(effectsWithoutHash)).not.toMatch(/1450|1650/);
    // Withdrawing the recommendation removes the unconfirmed Sheet update; the range stays.
    state = (
      await recordManual(state, {
        kind: "preparation",
        source: "Second review without a recommendation",
        rangeLow: 1450,
        rangeHigh: 1650,
        rangeBasis: "reviewed",
      })
    ).state;
    expect(state.sourceUpdates.market_value).toBeUndefined();
    expect(state.preparation?.market).toEqual({
      rangeLow: 1450,
      rangeHigh: 1650,
      rangeBasis: "reviewed",
    });
    expect(mutations).toBe(0);
    expect(marketValue).toBe("1000");
  });
});
function usePetField() {
  const original = testState.context!,
    sheetHeader = [
      "What is the Lease/Tenant name?",
      "Have they registered their pet if needed",
    ];
  marketValue = "Not started";
  const cell = () => ({
    value: { stringValue: marketValue },
    formattedValue: marketValue,
    numberFormat: "TEXT",
    checkbox: false,
  });
  testState.context = () => {
    const base = original();
    return {
      ...base,
      header: sheetHeader,
      columns: new Map([
        ["tenant_name", 0],
        ["pet_registered", 1],
      ]),
      row: {
        ...base.row!,
        fieldValues: { pet_registered: marketValue },
        cellEvidence: { pet_registered: cell() },
      },
    };
  };
  const oldGet = testState.writer!.getValues.bind(testState.writer!);
  testState.writer!.getValues = async (id, range) =>
    range.endsWith("A1:AZ1") ? [sheetHeader] : oldGet(id, range);
  testState.writer!.getCellEvidence = async () => cell();
}
describe("S113 recorded activity prepares its value for separate source confirmation", () => {
  it("saves app progress during the Sheet pause without creating a proposal or execution backlog", async () => {
    usePetField();
    const state = await startManual();
    vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "false");
    const saved = await recordManual(state, {
      kind: "activity",
      activity: "pet",
      outcome: "done",
      source: "Reviewed local fixture pet record",
    });
    expect(saved).toMatchObject({ writeback_paused: true });
    expect(saved.state.activities.pet.outcome).toBe("done");
    expect(saved.state.sourceUpdates.pet_registered.state).toBe("pending");
    expect(saved.state.sourceUpdates.pet_registered.proposalId).toBeUndefined();
    expect((await db.collection("operating_sheet_proposals").get()).empty).toBe(true);
    expect(
      (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).get()).empty,
    ).toBe(true);
    expect(mutations).toBe(0);
    const read = await (
      await getWorkspaceRoute(
        new Request("http://local.test/api/lease-renewal/workspace?leaseId=701"),
      )
    ).json();
    expect(read.writeback_paused).toBe(true);
    expect(read.state.activities.pet.outcome).toBe("done");
    const explicit = await postWorkspaceRoute(
      workspaceRequest({
        operation: "prepare_source",
        leaseId: "701",
        cycleId: saved.state.cycleId,
        field: "pet_registered",
        eventId: saved.input.operationId,
      }),
    );
    expect(explicit.status).toBe(409);
    expect((await db.collection("operating_sheet_proposals").get()).empty).toBe(true);
    expect(
      (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).get()).empty,
    ).toBe(true);
    expect(mutations).toBe(0);
  });

  it("lets an Editor record once, then confirm and read back the same typed field", async () => {
    usePetField();
    testState.role = "Editor";
    let state = await startManual();
    const recorded = await recordManual(state, {
      kind: "activity",
      activity: "pet",
      outcome: "done",
      source: "Reviewed pet registration",
    });
    state = recorded.state;
    expect(state.sourceUpdates.pet_registered.state).toBe("pending");
    state = await prepareSource(state, "pet_registered", recorded.input.operationId);
    expect(state.sourceUpdates.pet_registered).toMatchObject({
      state: "prepared",
      intent: {
        field: "pet_registered",
        value: "Done — recorded by staff",
        source: "Reviewed pet registration",
      },
    });
    expect(mutations).toBe(0);
    const proposal = (await getSheetWritebackProposal(
      actor,
      spreadsheetId,
      "Lease Renewal",
      scope,
      db,
    ))!;
    // S160: the Editor who recorded the fact confirms the exact Sheet update; no Admin hand-off.
    const confirmed = await post(confirmation(proposal));
    expect(await confirmed.json()).toMatchObject({
      status: "executed",
      workspaceSynchronization: { state: "verified" },
    });
    expect(confirmed.status).toBe(200);
    expect(mutations).toBe(1);
    expect(marketValue).toBe("Done — recorded by staff");
    const current = await (
      await getWorkspaceRoute(
        new Request("http://local.test/api/lease-renewal/workspace?leaseId=701"),
      )
    ).json();
    expect(current.state.sourceUpdates.pet_registered).toMatchObject({
      state: "verified",
      executionId: sheetWritebackExecutionId(proposal, proposal.effects[0]),
    });
    expect(current.state.activities.pet.outcome).toBe("done");
    expect(current.state.completion).toBeNull();
    expect((await post(confirmation(proposal))).status).toBe(200);
    expect(mutations).toBe(1);
  });
  it("supersedes an unattempted stale staff proposal, preserving the record and refusing the old confirmation", async () => {
    usePetField();
    let state = await startManual();
    const first = await recordManual(state, {
      kind: "activity",
      activity: "pet",
      outcome: "done",
      source: "Pet record",
    });
    state = await prepareSource(first.state, "pet_registered", first.input.operationId);
    const old = (await getSheetWritebackProposal(
      actor,
      spreadsheetId,
      "Lease Renewal",
      scope,
      db,
    ))!;
    const second = await recordManual(state, {
      kind: "activity",
      activity: "pet",
      outcome: "waiting",
      source: "Corrected current pet record",
    });
    state = await prepareSource(second.state, "pet_registered", second.input.operationId);
    expect((await post(confirmation(old))).status).toBe(404);
    expect(mutations).toBe(0);
    const fresh = (await getSheetWritebackProposal(
      actor,
      spreadsheetId,
      "Lease Renewal",
      scope,
      db,
    ))!;
    expect(fresh.generationId).not.toBe(old.generationId);
    expect(state.sourceUpdates.pet_registered.state).toBe("prepared");
    expect((await post(confirmation(fresh))).status).toBe(200);
    expect(mutations).toBe(1);
    expect(marketValue).toBe("Waiting — recorded by staff");
  });
});

describe("S113 current-rent Editor review handoff", () => {
  it("persists the typed proposal for Admin reload, refuses stale sources, and grants no resolution or provider effect", async () => {
    const prior = testState.context!;
    testState.context = () => {
      const value = prior();
      return {
        ...value,
        row: { ...value.row!, currentRentCandidateFingerprint: "c".repeat(64) },
      };
    };
    const { POST: saveReview } =
      await import("@/app/api/lease-renewal/correction-review/route");
    const body = {
      schemaVersion: "renewal-current-rent-review/v1",
      leaseId: "701",
      value: 1050,
      source: "Emulator executed lease reviewed",
      destination: "both",
      candidateFingerprint: "c".repeat(64),
    };
    testState.role = "Editor";
    const response = await saveReview(messageRequest(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      review: {
        value: 1050,
        source: body.source,
        destination: "both",
        recordedByUid: actor.uid,
      },
    });
    testState.role = "Admin";
    const { listRenewalDiscrepancyDispositions } =
      await import("@/lib/firestore/renewal-discrepancy-dispositions");
    const { currentRentReviewFromDisposition } =
      await import("@/lib/lease-renewal/correction-review");
    const records = await listRenewalDiscrepancyDispositions(actor, "701", db);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("proposed");
    expect(currentRentReviewFromDisposition(records[0])).toMatchObject({
      value: 1050,
      destination: "both",
    });
    expect((await db.collection("lease_renewal_resolutions").get()).empty).toBe(true);
    expect(
      (
        await saveReview(
          messageRequest({ ...body, candidateFingerprint: "d".repeat(64) }),
        )
      ).status,
    ).toBe(409);
    expect(await listRenewalDiscrepancyDispositions(actor, "701", db)).toHaveLength(1);
    expect(mutations).toBe(0);
  });
});
describe("S113 supplied copy publication uses the existing content store", () => {
  it("publishes a new version with real approver fields, reads back exact bytes and preserves old templates", async () => {
    const { publishSuppliedRenewalTemplate, getSuppliedRenewalPublication } =
      await import("@/lib/firestore/renewal-message-publication");
    const { createTemplate, getTemplate } = await import("@/lib/firestore/editable");
    const old = await createTemplate(
      actor,
      "lease-renewals",
      {
        name: "Historical owner copy",
        body: "Unrelated historical version",
        status: "Draft",
      },
      db,
    );
    await expect(
      publishSuppliedRenewalTemplate({ ...actor, role: "Editor" }, "owner", db),
    ).rejects.toMatchObject({ status: 403 });
    const before = await getSuppliedRenewalPublication(actor, "owner", db);
    expect(before.status).toBe("unpublished");
    const published = await publishSuppliedRenewalTemplate(actor, "owner", db);
    expect(published).toMatchObject({
      status: "approved",
      duplicate: false,
      approvedByUid: actor.uid,
    });
    expect(published.ref).toBe("owner-renewal:v2.0");
    expect(await publishSuppliedRenewalTemplate(actor, "owner", db)).toMatchObject({
      status: "approved",
      duplicate: true,
    });
    expect(await getTemplate(actor, old.id, db)).toMatchObject({
      status: "Draft",
      body: "Unrelated historical version",
    });
    if (published.status !== "approved") throw new Error("Publication readback missing");
    expect(await getTemplate(actor, published.templateId, db)).toMatchObject({
      status: "Approved",
      approved_by_uid: actor.uid,
      body: published.body,
    });
  });
});

const messageTransport = vi.hoisted(() => ({
  creates: 0,
  raw: "",
  disconnected: false,
  loseResponse: false,
}));
// Full deterministic source adapter: real mapping, cache admission and Firestore markers stay active.
vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      rows: [
        {
          lease: {
            leaseID: 701,
            leaseStatusID: "2",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            leaseType: "Fixed Term",
            baseRentAmount: "1000.00",
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "703",
                name: "Emulator Tenant",
                // S163: the provider first-name field feeds the greeting.
                firstName: "Emulator",
                email: "tenant@fixture-rental.net",
              },
            ],
          },
          unit: { unitID: "702", rent: "1400.00" },
          property: { propertyID: 702, streetName: "701 Emulator Avenue" },
          portfolio: {
            owners: [{ name: "Emulator Owner", email: "owner@fixture-rental.net" }],
          },
        },
      ],
      pages: 1,
      complete: true,
    }),
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Emulator Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ],
  });
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({ ok: false, reason: "test_source_not_configured" }),
  };
});
vi.mock("@/lib/gmail-hub/dependencies", async (original) => ({
  ...(await original<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: (subject: string) => {
    if (messageTransport.disconnected)
      throw new Error("Managed Gmail unavailable in fixture");
    return {
      subject,
      createDraft: async (
        input: Parameters<
          typeof import("@/lib/gmail-runtime/raw-message").encodeRawDraft
        >[0],
      ) => {
        messageTransport.creates++;
        const { encodeRawDraft } = await import("@/lib/gmail-runtime/raw-message");
        messageTransport.raw = encodeRawDraft({ ...input, from: subject });
        if (messageTransport.loseResponse)
          throw new Error("Fixture response lost after create");
        return { draftId: "fixture-unsent-draft" };
      },
      getDraftById: async () => ({
        draftId: "fixture-unsent-draft",
        raw: messageTransport.raw,
      }),
      findDraftByRfcMessageId: async () =>
        messageTransport.raw
          ? { draftId: "fixture-unsent-draft", raw: messageTransport.raw }
          : null,
    };
  },
}));
import {
  GET as getMessageRoute,
  POST as postMessageRoute,
} from "@/app/api/lease-renewal/message-preparation/route";
import { MESSAGE_PREPARATION_COLLECTIONS } from "@/lib/firestore/renewal-message-preparations";
import { decodeRawDraft } from "@/lib/gmail-runtime/raw-message";
function messageRequest(body: unknown) {
  return new Request("http://local.test/api/lease-renewal/message-preparation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function readMessage() {
  const result = await getMessageRoute(
    new Request(
      "http://local.test/api/lease-renewal/message-preparation?leaseId=701&channel=tenant",
    ),
  );
  expect(result.status).toBe(200);
  return result.json();
}
async function preparedMessage() {
  let state = await startManual();
  state = (
    await recordManual(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1100, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      source: "Emulator exact owner approval",
    })
  ).state;
  const resource = await postResourceRoute(
    resourceRequest({
      expectedVersion: 0,
      operationId: randomUUID(),
      resource: {
        id: "renewal_information_form",
        url: "https://fixture-rental.net/form",
        verified: true,
      },
    }),
  );
  expect(resource.status).toBe(200);
  const publication = await postMessageRoute(
    messageRequest({ kind: "publish", channel: "tenant" }),
  );
  expect(publication.status).toBe(200);
  const current = await readMessage();
  const inputs = {
    ...current.inputs,
    edits: { responseRequest: "Please let us know your preferred next step." },
    charges: current.inputs.charges.map((value: Record<string, unknown>) => ({
      ...value,
      applicable: false,
      source: "Emulator original lease reviewed",
    })),
    leaseOrigin: { kind: "pmi", source: "Emulator original lease" },
    signature: {
      name: "Emulator Staff",
      role: "PMI KC Metro",
      phone: null,
      hours: null,
      website: null,
      source: "Emulator signed-in staff declaration",
    },
  };
  const save = {
    kind: "save",
    leaseId: "701",
    cycleId: state.cycleId,
    channel: "tenant",
    expectedRevision: 0,
    operationId: randomUUID(),
    sourceFingerprint: current.sourceFingerprint,
    reviewed: true,
    inputs,
  };
  const response = await postMessageRoute(messageRequest(save));
  expect(response.status).toBe(200);
  return { state, save, result: await response.json() };
}
describe("S113 message HTTP paths, persisted preparation and existing governed Gmail service", () => {
  it("adopts a saved signature only through an explicit current actor instruction", async () => {
    const { state, result } = await preparedMessage();
    const { saveMessagePreparation } =
      await import("@/lib/firestore/renewal-message-preparations");
    const { currentRenewalMessage } =
      await import("@/lib/lease-renewal/current-renewal-message");
    const nextActor = {
      ...actor,
      uid: "second-s113-operator",
      email: "second-s113-operator@pmikcmetro.com",
    };
    const current = await currentRenewalMessage(nextActor, "701", "tenant", db);
    expect(current.signatureMatchesActor).toBe(false);
    const body = {
      leaseId: "701",
      cycleId: state.cycleId,
      channel: "tenant",
      expectedRevision: 1,
      operationId: randomUUID(),
      inputs: result.inputs,
    };
    const preserved = await saveMessagePreparation(nextActor, body, {}, db);
    expect(preserved.record?.signatureActorUid).toBe(actor.uid);
    const adopted = await saveMessagePreparation(
      nextActor,
      { ...body, expectedRevision: 2, operationId: randomUUID(), adoptSignature: true },
      {},
      db,
    );
    expect(adopted.record?.signatureActorUid).toBe(nextActor.uid);
    expect(adopted.record?.signatureEmail).toBe(nextActor.email);
    expect(messageTransport.creates).toBe(0);
  });
  it("retains an ambiguous earlier-cycle Gmail attempt and recovers its original content after a new cycle starts", async () => {
    const { state } = await preparedMessage();
    const preview = await (
      await postMessageRoute(
        messageRequest({ kind: "draft", leaseId: "701", channel: "tenant" }),
      )
    ).json();
    messageTransport.loseResponse = true;
    const attempt = await (
      await postMessageRoute(
        messageRequest({
          kind: "draft",
          leaseId: "701",
          channel: "tenant",
          confirm: { executionId: preview.executionId, previewHash: preview.previewHash },
        }),
      )
    ).json();
    expect(attempt.status, JSON.stringify(attempt)).toBe("needs_reconciliation");
    await startManual(state);
    const current = await readMessage();
    expect(current.draftAttempt).toBeNull();
    expect(current.previousDraftAttempts).toMatchObject([
      {
        executionId: preview.executionId,
        cycleId: state.cycleId,
        state: "Needs reconciliation",
        recoveryAvailable: true,
      },
    ]);
    const recovered = await (
      await postMessageRoute(
        messageRequest({
          kind: "draft",
          leaseId: "701",
          channel: "tenant",
          reconcile: { executionId: preview.executionId },
        }),
      )
    ).json();
    expect(recovered).toMatchObject({ status: "reconciliation", resolution: "created" });
    expect(messageTransport.creates).toBe(1);
    expect((await readMessage()).previousDraftAttempts).toEqual([]);
  });

  beforeEach(() => {
    messageTransport.creates = 0;
    messageTransport.raw = "";
    messageTransport.disconnected = false;
    messageTransport.loseResponse = false;
  });
  it.each(["terms", "links", "publication"])(
    "refuses a %s race at the actual unstarted S20 claim",
    async (changed) => {
      const { state } = await preparedMessage();
      const preview = await (
        await postMessageRoute(
          messageRequest({ kind: "draft", leaseId: "701", channel: "tenant" }),
        )
      ).json();
      expect(preview.status).toBe("preview");
      const execution = await db
        .collection("action_executions")
        .doc(preview.executionId)
        .get();
      // Simulate the change after route preflight, directly before the real transactional claim.
      if (changed === "terms")
        await recordManual(state, {
          kind: "owner_response",
          outcome: "approved_terms",
          terms: { rent: 1200, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
          source: "Emulator simultaneous owner revision",
        });
      if (changed === "links")
        await db.collection("renewal_resource_locations").doc("current").update({
          "entries.renewal_information_form.url": "https://fixture-rental.net/changed",
        });
      if (changed === "publication") {
        const published = (await db.collection("templates").get()).docs[0];
        await db
          .collection("templates")
          .doc("duplicate-fixture-publication")
          .set({ ...published.data(), name: published.get("name").toUpperCase() });
        expect((await readMessage()).publication.status).toBe("unpublished");
      }
      const { claimActionExecution } = await import("@/lib/firestore/action-executions");
      await expect(
        claimActionExecution(
          actor,
          preview.executionId,
          preview.previewHash,
          db,
          execution.get("context_hash"),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const unchanged = await execution.ref.get();
      expect(unchanged.get("attempt_count")).toBe(0);
      expect(unchanged.get("state")).toBe("Ready");
      expect(messageTransport.creates).toBe(0);
    },
  );
  it("retains edits and publication through reload, then verifies rich MIME and one receipt", async () => {
    const { save, result } = await preparedMessage();
    expect(messageTransport.creates).toBe(0);
    expect(result.content.missing).toEqual([]);
    expect(result.content.plainText.startsWith("Hello Emulator,")).toBe(true);
    expect(result.publication.status).toBe("approved");
    expect((await (await postMessageRoute(messageRequest(save))).json()).duplicate).toBe(
      true,
    );
    expect((await readMessage()).saved).toEqual(result.saved);
    const previewResponse = await postMessageRoute(
      messageRequest({ kind: "draft", leaseId: "701", channel: "tenant" }),
    );
    expect(
      previewResponse.status,
      JSON.stringify(await previewResponse.clone().json()),
    ).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.status, JSON.stringify(preview)).toBe("preview");
    expect(preview.htmlBody).toContain("<strong>Emulator Staff</strong>");
    const request = {
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      confirm: { executionId: preview.executionId, previewHash: preview.previewHash },
    };
    const created = await (await postMessageRoute(messageRequest(request))).json();
    expect(created.status).toBe("created");
    expect(messageTransport.creates).toBe(1);
    const decoded = decodeRawDraft(messageTransport.raw);
    expect(decoded.htmlBody).toBe(preview.htmlBody);
    expect(decoded.body).toBe(preview.body);
    expect(decoded.to).toBe("tenant@fixture-rental.net");
    expect(decoded.from).toBe(actor.email);
    expect((await (await postMessageRoute(messageRequest(request))).json()).status).toBe(
      "created",
    );
    expect(messageTransport.creates).toBe(1);
    const execution = await db
      .collection("action_executions")
      .doc(preview.executionId)
      .get();
    expect(execution.get("state")).toBe("Succeeded");
    expect(execution.get("result_code")).toMatch(
      /^external_receipt:succeeded:[a-f0-9]{64}$/,
    );
    // S161: there is no review record; the stored field keeps its shape for the previous release.
    expect((await readMessage()).saved.reviewedSourceFingerprint).toBeNull();
    expect(
      (await db.collection(MESSAGE_PREPARATION_COLLECTIONS.activity).get()).size,
    ).toBe(1);
  });
  it("preserves prose after changed owner terms, refuses the stale confirmation exactly and keeps copy after Gmail failure", async () => {
    const { state, save, result } = await preparedMessage();
    const preview = await (
      await postMessageRoute(
        messageRequest({ kind: "draft", leaseId: "701", channel: "tenant" }),
      )
    ).json();
    const next = await recordManual(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1200, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      source: "Emulator revised owner approval",
    });
    const reread = await readMessage();
    expect(reread.inputs).toEqual(result.inputs);
    expect(reread.content.plainText).toContain("$1,200.00");
    // S161: changed terms never refuse a save, and the saved entries stay exactly as they were.
    const resaved = await postMessageRoute(
      messageRequest({
        ...save,
        cycleId: next.state.cycleId,
        operationId: randomUUID(),
        expectedRevision: 1,
      }),
    );
    expect(resaved.status).toBe(200);
    expect((await resaved.json()).inputs).toEqual(result.inputs);
    // S162: the earlier preview no longer reads as the current message, so confirming it is
    // refused exactly, before any Gmail call; a new preview is needed.
    const refusedResponse = await postMessageRoute(
      messageRequest({
        kind: "draft",
        leaseId: "701",
        channel: "tenant",
        confirm: { executionId: preview.executionId, previewHash: preview.previewHash },
      }),
    );
    expect(refusedResponse.status).toBe(409);
    expect((await refusedResponse.json()).error).toContain("changed after this preview");
    expect(messageTransport.creates).toBe(0);
    const fresh = await (
      await postMessageRoute(
        messageRequest({ kind: "draft", leaseId: "701", channel: "tenant" }),
      )
    ).json();
    messageTransport.disconnected = true;
    const failedResponse = await postMessageRoute(
      messageRequest({
        kind: "draft",
        leaseId: "701",
        channel: "tenant",
        confirm: { executionId: fresh.executionId, previewHash: fresh.previewHash },
      }),
    );
    expect(failedResponse.status).toBe(409);
    expect((await failedResponse.json()).error).toContain(
      "saved message remains copyable",
    );
    expect((await readMessage()).content.plainText).toContain("$1,200.00");
    expect(messageTransport.creates).toBe(0);
    const pending = await db.collection("action_executions").doc(fresh.executionId).get();
    expect(pending.get("state")).toBe("Ready");
    messageTransport.disconnected = false;
    const retried = await (
      await postMessageRoute(
        messageRequest({
          kind: "draft",
          leaseId: "701",
          channel: "tenant",
          confirm: { executionId: fresh.executionId, previewHash: fresh.previewHash },
        }),
      )
    ).json();
    expect(retried.status).toBe("created");
    expect(messageTransport.creates).toBe(1);
  });
  it("recovers the immutable rich attempt after a lost response, reload and changed owner terms without creating twice", async () => {
    const { state } = await preparedMessage();
    const preview = await (
      await postMessageRoute(
        messageRequest({ kind: "draft", leaseId: "701", channel: "tenant" }),
      )
    ).json();
    expect(preview.status, JSON.stringify(preview)).toBe("preview");
    messageTransport.loseResponse = true;
    const uncertain = await (
      await postMessageRoute(
        messageRequest({
          kind: "draft",
          leaseId: "701",
          channel: "tenant",
          confirm: { executionId: preview.executionId, previewHash: preview.previewHash },
        }),
      )
    ).json();
    expect(uncertain.status).toBe("needs_reconciliation");
    expect(messageTransport.creates).toBe(1);
    expect((await readMessage()).draftAttempt).toMatchObject({
      executionId: preview.executionId,
      state: "Needs reconciliation",
    });
    await recordManual(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1300, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      source: "Emulator subsequent owner terms",
    });
    expect((await readMessage()).content.plainText).toContain("$1,300.00");
    const recovered = await (
      await postMessageRoute(
        messageRequest({
          kind: "draft",
          leaseId: "701",
          channel: "tenant",
          reconcile: { executionId: preview.executionId },
        }),
      )
    ).json();
    expect(recovered).toMatchObject({
      status: "reconciliation",
      resolution: "created",
      draftId: "fixture-unsent-draft",
    });
    expect(messageTransport.creates).toBe(1);
    expect((await readMessage()).draftAttempt.state).toBe("Succeeded");
    expect(decodeRawDraft(messageTransport.raw).body).toContain("$1,100.00");
    expect((await readMessage()).content.plainText).toContain("$1,300.00");
  });
});

describe("S113 normal S66 packet resolver and S106/S34 handoff", () => {
  it("reads blank pending resources without inventing forms, then evaluates persisted approved mappings against actual publication heads", async () => {
    const state = await startManual();
    await saveWorkingTerms({
      rent: 1100,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    const approved = (
      await recordManual(state, {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1100, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Emulator exact owner terms",
      })
    ).state;
    const { resolveLivePacketInput } = await import("@/lib/lease-documents/live-input");
    const { POST: evaluateRoute } =
      await import("@/app/api/lease-renewal/packet-truth/route");
    const { GET: readHandoff, POST: packetAction } =
      await import("@/app/api/lease-renewal/document-handoff/route");
    const pending = await readHandoff(
      new Request("http://local.test/api/lease-renewal/document-handoff?leaseId=701"),
    );
    expect(pending.status).toBe(200);
    expect((await pending.json()).blockers.join(" ")).toMatch(/B-DL3/);
    const initial = await resolveLivePacketInput(
      actor,
      "701",
      "701",
      new Date().toISOString(),
      db,
    );
    expect(initial.input.catalog.artifacts).toEqual([]);
    expect((await getResourceRoute()).status).toBe(200);
    const fixture = await seedPacketSources(approved, initial.leaseSourceHash);
    const evaluated = await evaluateRoute(
      messageRequest({
        action: "evaluate",
        leaseId: "701",
        transactionId: "701",
        expectedCurrentSnapshotId: null,
      }),
    );
    expect(evaluated.status, JSON.stringify(await evaluated.clone().json())).toBe(200);
    const snapshot = (await evaluated.json()).snapshot;
    expect(snapshot.state).toBe("Ready for preview");
    expect(snapshot.manifest.fields).toContainEqual(
      expect.objectContaining({
        factKey: "lease.monthly_rent_cents",
        normalizedValue: 123456,
      }),
    );
    const { getCurrentPacketSnapshot } =
      await import("@/lib/firestore/lease-document-packet-snapshots");
    expect((await getCurrentPacketSnapshot(actor, "701", "701", db))?.payloadHash).toBe(
      snapshot.payloadHash,
    );
    const action = await packetAction(
      messageRequest({ kind: "preview", leaseId: "701", operation: "loop_create" }),
    );
    expect(action.status).toBe(409);
    expect((await db.collection("action_executions").get()).empty).toBe(true);
    const excluded = fixture.catalog.artifacts.find((a) => a.kind === "standard_lease")!;
    await db
      .collection("publication_resources")
      .doc(excluded.artifactId)
      .update({ activeVersionId: "changed-excluded-publication" });
    const { evaluateRenewalPacket } =
      await import("@/lib/lease-documents/evaluate-packet");
    expect(
      evaluateRenewalPacket(
        (await resolveLivePacketInput(actor, "701", "701", new Date().toISOString(), db))
          .input,
      ).state,
    ).toBe("Ready for preview");
    const included = fixture.catalog.artifacts.find(
      (a) => a.kind === "renewal_extension",
    )!;
    await db
      .collection("publication_resources")
      .doc(included.artifactId)
      .update({ activeVersionId: "changed-included-publication" });
    const missingPublication = await resolveLivePacketInput(
      actor,
      "701",
      "701",
      new Date().toISOString(),
      db,
    );
    expect(evaluateRenewalPacket(missingPublication.input).state).toBe("Needs input");
    expect(missingPublication.notices.join(" ")).toContain("unavailable or changed");
    await saveWorkingTerms({
      rent: 1200,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    const reapproved = (
      await recordManual(approved, {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1200, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Emulator revised terms",
      })
    ).state;
    expect(reapproved.termsRevision).toBeGreaterThan(approved.termsRevision);
    const stale = await resolveLivePacketInput(
      actor,
      "701",
      "701",
      new Date().toISOString(),
      db,
    );
    expect(stale.sources).toBeNull();
    expect(stale.notices.join(" ")).toContain("stale");
    await db
      .collection("publication_resources")
      .doc(fixture.catalog.artifacts[0].artifactId)
      .update({ activeVersionId: "changed-publication" });
    // The now-unclassified packet still needs current facts; an excluded standard-lease file is not a renewal-wide blocker.
    expect(
      (await resolveLivePacketInput(actor, "701", "701", new Date().toISOString(), db))
        .sources,
    ).toBeNull();
    expect(messageTransport.creates).toBe(0);
    expect(mutations).toBe(0);
  });
});

describe("S66 ordinary packet inputs reach the evaluator (AC-S66-1, AC-S66-4, AC-S66-9)", () => {
  it("an Editor saves inputs through the route, the packet evaluates them without an Admin mapping, and a correction creates a successor", async () => {
    testState.role = "Editor";
    const { PACKET_SOURCE_COLLECTIONS } =
      await import("@/lib/lease-documents/live-input");
    const { readyS66Input } = await import("@/tests/fixtures/s66-packet");
    const { POST: saveInputs, GET: readInputs } =
      await import("@/app/api/lease-renewal/packet-inputs/route");
    const { POST: evaluateRoute } =
      await import("@/app/api/lease-renewal/packet-truth/route");
    const { publishChargePolicy } = await import("@/lib/firestore/lease-charge-policy");
    const fixture = readyS66Input();
    // Only the Admin-approved catalog exists; no per-lease mapping is written by anyone.
    for (const artifact of fixture.catalog.artifacts) {
      artifact.signerRoles = [artifact.audience];
      if (artifact.kind === "renewal_extension")
        artifact.fieldBindings = [
          {
            fieldId: "Rent",
            factKey: "renewal.approved_rent",
            required: true,
            allowedSourceSystems: ["staff_recorded_owner_approval"],
          },
        ];
      const publicationId = artifact.publicationSource.reference.slice(
        "publication:".length,
      );
      await db.collection("publication_versions").doc(publicationId).set({
        id: publicationId,
        validated: true,
        data_mode: "live",
        spaceId: "renewals",
        contentHash: artifact.contentHash,
        resourceId: artifact.artifactId,
      });
      await db
        .collection("publication_resources")
        .doc(artifact.artifactId)
        .set({ activeVersionId: publicationId });
    }
    await db.collection(PACKET_SOURCE_COLLECTIONS.catalog).doc("current").set({
      schemaVersion: "approved-lease-catalog/v1",
      data_mode: "live",
      approvedByUid: "admin-1",
      approvedAt: new Date().toISOString(),
      catalog: fixture.catalog,
    });
    await publishChargePolicy(
      { ...actor, uid: "admin-1", role: "Admin" },
      {
        content: { residentBenefitPackage: null, insuranceProgram: null, animals: null },
        effectiveFrom: "2026-10-01",
        expectedVersion: 0,
        operationId: randomUUID(),
      },
      db,
    );
    const post = async (body: Record<string, unknown>) => {
      const response = await saveInputs(
        new Request("http://local.test/api/lease-renewal/packet-inputs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leaseId: "701", operationId: randomUUID(), ...body }),
        }),
      );
      const value = await response.json();
      expect(response.status, JSON.stringify(value)).toBe(200);
      return value;
    };
    // A draft with missing facts saves; the packet names exactly what it still needs.
    await post({
      facts: [
        { fieldKey: "transaction.type", expectedRevision: 0, value: "existing_renewal" },
      ],
    });
    const draftView = await (
      await readInputs(
        new Request("http://local.test/api/lease-renewal/packet-inputs?leaseId=701"),
      )
    ).json();
    expect(
      draftView.questions
        .filter((question: { reason: string }) => question.reason === "missing")
        .map((question: { fieldKey: string }) => question.fieldKey),
      // Classification asks in order: the next decisive fact is named, never guessed.
    ).toEqual(["management.origin"]);
    await post({
      facts: [
        { fieldKey: "management.origin", expectedRevision: 0, value: "pmi_managed" },
        { fieldKey: "active_lease.executed", expectedRevision: 0, value: true },
        {
          fieldKey: "active_lease.form_family",
          expectedRevision: 0,
          value: "fixture-standard-family",
        },
        {
          fieldKey: "insurance.coverage_method",
          expectedRevision: 0,
          value: "not_applicable_under_policy",
        },
        { fieldKey: "property.year_built", expectedRevision: 0, value: 1990 },
        {
          fieldKey: "property.city_addendum_applicable",
          expectedRevision: 0,
          value: false,
        },
        { fieldKey: "property.hoa_applicable", expectedRevision: 0, value: false },
      ],
      people: {
        expectedRevision: 0,
        entries: [
          {
            personId: "20000000-0000-4000-8000-000000000001",
            kind: "person",
            fullName: "Emulator Tenant",
            email: "tenant@fixture-rental.net",
            emailBasis: "staff_reviewed",
            contactRef: null,
            roles: [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }],
          },
        ],
      },
    });
    await saveWorkingTerms({
      rent: 1100,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    await recordManual(await startManual(), {
      kind: "owner_response",
      outcome: "approved_terms",
      source: "Emulator owner call",
    });
    const evaluate = async (expectedCurrentSnapshotId: string | null) => {
      const response = await evaluateRoute(
        messageRequest({
          action: "evaluate",
          leaseId: "701",
          transactionId: "701",
          expectedCurrentSnapshotId,
        }),
      );
      const value = await response.json();
      expect(response.status, JSON.stringify(value)).toBe(200);
      return value.snapshot;
    };
    const first = await evaluate(null);
    expect(first.blockers).toEqual([]);
    expect(first.state).toBe("Ready for preview");
    expect(
      first.manifest.participants.map(
        (entry: { participantId: string }) => entry.participantId,
      ),
    ).toEqual(["20000000-0000-4000-8000-000000000001:tenant"]);
    expect(first.manifest.fields).toContainEqual(
      expect.objectContaining({
        factKey: "renewal.approved_rent",
        normalizedValue: 1100,
      }),
    );
    // Evaluating unchanged inputs again keeps the same snapshot identity.
    expect((await evaluate(first.snapshotId)).snapshotId).toBe(first.snapshotId);
    // A correction makes the lead disclosure apply and creates a successor; the first is unchanged.
    const saved = (
      await (
        await readInputs(
          new Request("http://local.test/api/lease-renewal/packet-inputs?leaseId=701"),
        )
      ).json()
    ).record;
    await post({
      facts: [
        {
          fieldKey: "property.year_built",
          expectedRevision: saved.facts["property.year_built"].revision,
          value: 1965,
        },
      ],
    });
    const second = await evaluate(first.snapshotId);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(second.previousSnapshotId).toBe(first.snapshotId);
    expect(
      second.manifest.includedArtifacts
        .map((artifact: { kind: string }) => artifact.kind)
        .sort(),
    ).toEqual(["lead_disclosure", "renewal_extension"]);
    const stored = await db
      .collection("lease_document_packet_snapshots")
      .doc(first.snapshotId)
      .get();
    expect(stored.get("payload_hash") ?? stored.get("payloadHash")).toBe(
      first.payloadHash,
    );
    // Saving inputs and calculating charges wrote no RentVine, Sheet, Gmail or Dotloop effect.
    expect(mutations).toBe(0);
    expect(messageTransport.creates).toBe(0);
    expect((await db.collection("action_executions").get()).empty).toBe(true);
  });
});

async function seedPacketSources(
  approved: RenewalWorkspaceState,
  leaseSourceHash: string,
) {
  const { PACKET_SOURCE_COLLECTIONS } = await import("@/lib/lease-documents/live-input");
  const { renewalWorkspaceDocId } = await import("@/lib/firestore/renewal-workspace");
  const { readyS66Input } = await import("@/tests/fixtures/s66-packet");
  const fixture = readyS66Input();
  for (const artifact of fixture.catalog.artifacts) {
    const publicationId = artifact.publicationSource.reference.slice(
      "publication:".length,
    );
    await db.collection("publication_versions").doc(publicationId).set({
      id: publicationId,
      validated: true,
      data_mode: "live",
      spaceId: "renewals",
      contentHash: artifact.contentHash,
      resourceId: artifact.artifactId,
    });
    await db
      .collection("publication_resources")
      .doc(artifact.artifactId)
      .set({ activeVersionId: publicationId });
  }
  await db.collection(PACKET_SOURCE_COLLECTIONS.catalog).doc("current").set({
    schemaVersion: "approved-lease-catalog/v1",
    data_mode: "live",
    approvedByUid: actor.uid,
    approvedAt: new Date().toISOString(),
    catalog: fixture.catalog,
  });
  await db
    .collection(PACKET_SOURCE_COLLECTIONS.sources)
    .doc(renewalWorkspaceDocId("701"))
    .set({
      schemaVersion: "approved-renewal-packet-sources/v1",
      data_mode: "live",
      leaseId: "701",
      cycleId: approved.cycleId,
      termsRevision: approved.termsRevision,
      leaseSourceHash: leaseSourceHash,
      approvedByUid: actor.uid,
      approvedAt: new Date().toISOString(),
      source: fixture.catalog.source,
      facts: fixture.facts,
      participants: fixture.participants,
      charges: fixture.charges,
      animals: fixture.animals,
      contacts: fixture.participants.map((participant, index) => ({
        participantRef: participant.providerBindings!.dotloopParticipantRef,
        fullName: `Emulator Person ${index}`,
        email: `person${index}@fixture-rental.net`,
        role: participant.kind === "tenant" ? "TENANT" : "LANDLORD",
      })),
    });
  return fixture;
}

describe("S113 normal packet route through the actual S20 ledger and Dotloop HTTP adapter", () => {
  it("creates once, persists its receipt, recovers projection, uploads actual approved bytes and reads metadata without claiming signatures", async () => {
    await saveWorkingTerms({
      rent: 1100,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    const approved = (
      await recordManual(await startManual(), {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1100, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Fixture owner approval",
      })
    ).state;
    const { resolveLivePacketInput } = await import("@/lib/lease-documents/live-input");
    const initial = await resolveLivePacketInput(
      actor,
      "701",
      "701",
      new Date().toISOString(),
      db,
    );
    const fixture = await seedPacketSources(approved, initial.leaseSourceHash);
    const { createHash } = await import("node:crypto");
    const { FirestorePublicationContentStore } =
      await import("@/lib/publication/content");
    const bytes = new TextEncoder().encode(
      "Emulator-only approved artifact bytes; no legal content.",
    );
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const contentRef = await new FirestorePublicationContentStore(db).put({
      content: bytes,
      contentHash,
      contentId: "s113-fixture-content",
    });
    for (const artifact of fixture.catalog.artifacts) {
      artifact.contentHash = contentHash;
      const id = artifact.publicationSource.reference.slice("publication:".length);
      await db.collection("publication_versions").doc(id).update({
        contentHash,
        contentRef,
        contentByteSize: bytes.byteLength,
        fileName: "fixture-form.txt",
        detectedMimeType: "text/plain",
      });
    }
    await db
      .collection("lease_artifact_catalogs")
      .doc("current")
      .update({ catalog: fixture.catalog });
    const { selectDotloopRenewalSettings } =
      await import("@/lib/firestore/dotloop-renewal-settings");
    await selectDotloopRenewalSettings(
      actor,
      {
        profile_id: "profile-1",
        profile_label: "Fixture profile",
        template_id: "fixture-template-renewal_extension",
        template_label: "Fixture template",
        transaction_type: "LEASE_OFFER",
        initial_status: "PRE_OFFER",
      },
      db,
    );
    const { createDotloopLoopFake } = await import("@/tests/helpers/dotloop-loop-fake");
    const { DotloopClient } = await import("@/lib/integrations/dotloop/client");
    const fake = createDotloopLoopFake();
    const client = new DotloopClient({
      transport: fake,
      tokens: { accessToken: async () => "fixture-token", refresh: async () => null },
      sleep: async () => undefined,
    });
    packetTransport.runtime = { client };
    const { POST: evaluateRoute } =
      await import("@/app/api/lease-renewal/packet-truth/route");
    const { POST: packetRoute, GET: readHandoff } =
      await import("@/app/api/lease-renewal/document-handoff/route");
    const call = async (body: Record<string, unknown>) => {
      const response = await packetRoute(messageRequest({ leaseId: "701", ...body }));
      const data = await response.json();
      expect(response.status, JSON.stringify(data)).toBe(200);
      return data;
    };
    const evaluated = await evaluateRoute(
      messageRequest({
        action: "evaluate",
        leaseId: "701",
        transactionId: "701",
        expectedCurrentSnapshotId: null,
      }),
    );
    const evaluatedData = await evaluated.json();
    expect(evaluated.status, JSON.stringify(evaluatedData)).toBe(200);
    testState.role = "Editor";
    testState.uid = "packet-editor";
    const preview = await call({ kind: "preview", operation: "loop_create" });
    expect(preview.state).toBe("Awaiting Admin");
    expect(preview.participants).toHaveLength(2);
    expect(fake.createCount).toBe(0);
    testState.role = "Admin";
    testState.uid = actor.uid;
    const reviewed = await call({ kind: "preview", operation: "loop_create" });
    expect(reviewed.executionId).toBe(preview.executionId);
    const { getActionExecution, approveActionExecution, claimActionExecution } =
      await import("@/lib/firestore/action-executions");
    const originalExecution = await getActionExecution(actor, preview.executionId, db);
    await approveActionExecution(
      actor,
      preview.executionId,
      {
        previewHash: preview.previewHash,
        contextHash: originalExecution.context_hash,
        reason: "Reviewed exact fixture packet",
      },
      db,
    );
    const activeArtifact = fixture.catalog.artifacts.find(
      (a) => a.kind === "renewal_extension",
    )!;
    const activeRef = db
      .collection("publication_resources")
      .doc(activeArtifact.artifactId);
    const activeVersion = (await activeRef.get()).get("activeVersionId");
    await activeRef.update({ activeVersionId: "fixture-new-publication-after-preview" });
    await expect(
      claimActionExecution(
        actor,
        preview.executionId,
        preview.previewHash,
        db,
        originalExecution.context_hash,
      ),
    ).rejects.toThrow(/packet.*changed/i);
    expect((await getActionExecution(actor, preview.executionId, db)).attempt_count).toBe(
      0,
    );
    expect(fake.createCount).toBe(0);
    await activeRef.update({ activeVersionId: activeVersion });
    const effect = await call({
      kind: "confirm",
      executionId: preview.executionId,
      previewHash: preview.previewHash,
      reason: "Reviewed fixture exact packet",
    });
    expect(effect.execution.state).toBe("Succeeded");
    expect(fake.createCount).toBe(1);
    const { getCurrentPacketSnapshot, LEASE_DOCUMENT_PACKET_COLLECTIONS } =
      await import("@/lib/firestore/lease-document-packet-snapshots");
    let current = (await getCurrentPacketSnapshot(actor, "701", "701", db))!;
    expect(current.execution?.loopLink?.loopId).toBe("loop-1");
    expect(current.execution?.state).toBe("Partially executed");
    // S34 (ARCH-S34-2): the created loop is the lease's current loop through its own reservation.
    const { readLoopAssociation } =
      await import("@/lib/firestore/lease-document-loop-association");
    expect(await readLoopAssociation("701", db)).toMatchObject({
      state: "current",
      origin: "app_created",
      loopId: "loop-1",
      createExecutionId: preview.executionId,
      documents: [],
    });
    // A lease with a current loop never previews another creation.
    const again = await packetRoute(
      messageRequest({ leaseId: "701", kind: "preview", operation: "loop_create" }),
    );
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/already has a linked Dotloop loop/);
    expect(
      (
        await db
          .collection("lease_document_action_snapshots")
          .doc(preview.executionId)
          .get()
      ).get("effectReceipt.providerRef"),
    ).toBe("loop-1");
    await db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.executionProjections)
      .doc(current.snapshotId)
      .delete();
    await call({ kind: "reconcile", executionId: preview.executionId });
    current = (await getCurrentPacketSnapshot(actor, "701", "701", db))!;
    expect(current.execution?.loopLink?.loopId).toBe("loop-1");
    expect(fake.createCount).toBe(1);
    const document = fixture.catalog.artifacts.find(
      (a) => a.kind === "renewal_extension",
    )!;
    const { GET: download } =
      await import("@/app/api/lease-renewal/document-artifact/route");
    const downloaded = await download(
      new Request(
        `http://local.test/api/lease-renewal/document-artifact?leaseId=701&documentRef=${document.providerBindings!.dotloopDocumentRef}`,
      ),
    );
    expect(downloaded.status).toBe(200);
    expect(Array.from(new Uint8Array(await downloaded.arrayBuffer()))).toEqual(
      Array.from(bytes),
    );
    // S34 (AC-S34-1): an upload preview names its exact loop link. After staff correct and relink
    // the loop, that preview is refused and a fresh preview prepares a new attempt.
    const stale = await call({
      kind: "preview",
      operation: "document_upload",
      documentRef: document.providerBindings!.dotloopDocumentRef,
    });
    const firstReview = await call({ kind: "loop_review", loopId: "loop-1" });
    const firstCorrection = await call({
      kind: "loop_unlink",
      expectedLinkRevision: firstReview.expectedLinkRevision,
      reason: "Fixture correction before the first upload",
    });
    await call({
      kind: "loop_link",
      loopId: "loop-1",
      observationHash: firstReview.observationHash,
      reason: "Reviewed fixture loop",
      expectedLinkRevision: firstCorrection.association.linkRevision,
      reuseAcrossCycles: false,
    });
    const staleConfirm = await packetRoute(
      messageRequest({
        leaseId: "701",
        kind: "confirm",
        executionId: stale.executionId,
        previewHash: stale.previewHash,
        reason: "Reviewed fixture exact file",
      }),
    );
    expect(staleConfirm.status).toBe(409);
    expect(fake.uploadAuthorizations).toHaveLength(0);
    const upload = await call({
      kind: "preview",
      operation: "document_upload",
      documentRef: document.providerBindings!.dotloopDocumentRef,
    });
    expect(upload.executionId).not.toBe(stale.executionId);
    const uploaded = await call({
      kind: "confirm",
      executionId: upload.executionId,
      previewHash: upload.previewHash,
      reason: "Reviewed fixture exact file",
    });
    expect(uploaded.execution.state).toBe("Succeeded");
    expect(fake.uploadAuthorizations).toHaveLength(1);
    await call({ kind: "reconcile", executionId: upload.executionId });
    expect(fake.uploadAuthorizations).toHaveLength(1);
    // S34 (AC-S34-6/7): the upload is one version in the lease's loop, in the durable folder.
    const linked = (await readLoopAssociation("701", db))!;
    expect(linked.folder?.dotloopFolderId).toBe("folder-1");
    expect(linked.documents).toEqual([
      expect.objectContaining({
        documentRef: document.providerBindings!.dotloopDocumentRef,
        contentHash,
        receiptId: upload.executionId,
        supersedesContentHash: null,
      }),
    ]);
    const duplicate = await packetRoute(
      messageRequest({
        leaseId: "701",
        kind: "preview",
        operation: "document_upload",
        documentRef: document.providerBindings!.dotloopDocumentRef,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toMatch(/already in the linked loop/);
    const readback = await call({ kind: "readback" });
    expect(readback.evidenceLevel).toBe("loop_metadata_only");
    expect(readback.association).toMatchObject({
      loopId: "loop-1",
      readback: { loopStatus: "PRE_OFFER" },
    });
    current = (await getCurrentPacketSnapshot(actor, "701", "701", db))!;
    expect(current.execution?.documentEvidence).toEqual([
      expect.objectContaining({
        evidenceLevel: "presence_only",
        submittedContentHash: contentHash,
      }),
    ]);
    expect(current.execution?.state).toBe("Partially executed");
    // S34 (AC-S34-5/10): staff review the loop, correct the link without touching Dotloop, then
    // link the reviewed loop again; the app-created origin and its upload history are kept.
    const review = await call({ kind: "loop_review", loopId: "loop-1" });
    expect(review).toMatchObject({
      recordedForOtherLease: false,
      servedEarlierCycle: false,
      archived: false,
    });
    const refusedLink = await packetRoute(
      messageRequest({
        leaseId: "701",
        kind: "loop_link",
        loopId: "loop-1",
        observationHash: review.observationHash,
        reason: "Reviewed fixture loop",
        expectedLinkRevision: review.expectedLinkRevision,
        reuseAcrossCycles: false,
      }),
    );
    expect(refusedLink.status).toBe(409);
    const corrected = await call({
      kind: "loop_unlink",
      expectedLinkRevision: review.expectedLinkRevision,
      reason: "Fixture correction of the lease link",
    });
    expect(corrected.association).toMatchObject({ state: "unlinked", loopId: "loop-1" });
    const relinked = await call({
      kind: "loop_link",
      loopId: "loop-1",
      observationHash: review.observationHash,
      reason: "Reviewed fixture loop again",
      expectedLinkRevision: corrected.association.linkRevision,
      reuseAcrossCycles: false,
    });
    expect(relinked.association).toMatchObject({
      state: "current",
      origin: "app_created",
      loopId: "loop-1",
    });
    expect(relinked.association.documents).toHaveLength(1);
    expect(fake.createCount).toBe(1);
    expect(fake.uploadAuthorizations).toHaveLength(1);
    expect(
      (
        await getWorkspaceRoute(
          new Request("http://local.test/api/lease-renewal/workspace?leaseId=701"),
        )
      ).status,
    ).toBe(200);
    expect(manualRenewalSummary(approved).complete).toBe(false);
    const handoff = await readHandoff(
      new Request("http://local.test/api/lease-renewal/document-handoff?leaseId=701"),
    );
    // The create, the stale upload preview (never executed) and the upload.
    const attempts = (await handoff.json()).attempts as Array<{
      executionId: string;
      state: string;
    }>;
    expect(attempts).toHaveLength(3);
    expect(
      attempts.find((attempt) => attempt.executionId === stale.executionId)?.state,
    ).not.toBe("Succeeded");
    expect(messageTransport.creates).toBe(0);
    expect(mutations).toBe(0);
  });
});

// H1/H2/H7/H8: mounted dashboard -> actual HTTP handlers -> Firestore -> owning desk projection.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
describe("S113 mounted operator journey with persisted backend state", () => {
  afterEach(async () => {
    (await import("@testing-library/react")).cleanup();
    try {
      await runAfterImmediateSourceDrain(
        mountedRequests,
        () => vi.unstubAllGlobals(),
        REQUEST_DRAIN_TIMEOUT_MS,
      );
      expect(
        mountedRequests.snapshot().rejected,
        "A tracked HTTP request or transaction rejected",
      ).toBe(0);
      assertMountedReadbacks();
    } catch (error) {
      throw new Error(
        `S113 cleanup diagnostics: ${JSON.stringify({
          requests: mountedRequests.snapshot(),
          ...mountedReadDiagnostics(),
        })}`,
        { cause: error },
      );
    }
  });
  it.each(["fresh", "already underway"])(
    "resumes %s work, handles a counteroffer and records manual completion independently of provider receipts",
    async (start) => {
      const { createElement: h } = await import("react");
      const { render, screen, fireEvent, waitFor, within, cleanup } =
        await import("@testing-library/react");
      const { RenewalWorkspace } =
        await import("@/components/lease-renewal/RenewalWorkspace");
      const { RenewalDeskReturnLink } =
        await import("@/components/lease-renewal/RenewalDeskReturnLink");
      const { RenewalResourceLocations } =
        await import("@/components/lease-renewal/RenewalResourceLocations");
      const { RenewalCorrections } =
        await import("@/components/lease-renewal/RenewalCorrections");
      const { OperatingSheetPanel } =
        await import("@/components/lease-renewal/OperatingSheetPanel");
      const { getRenewalResourceLocations } =
        await import("@/lib/firestore/renewal-resource-locations");
      const journeyRole = start === "fresh" ? "Admin" : "Editor";
      testState.role = journeyRole;
      vi.stubEnv("MARKET_COMP_PROVIDER", "rentcast");
      vi.stubEnv("RENTCAST_API_KEY", "emulator-transport-fixture");
      resetMarketCompsCacheForTests();
      let compRequests = 0,
        failComps = false;
      const { getRenewalWorkspace } = await import("@/lib/firestore/renewal-workspace");
      const { loadLiveRenewalLeaseWorkspace, loadLiveRenewalDesk } =
        await import("@/lib/lease-renewal/live-desk");
      const { buildLiveRentVineConfig } = await import("@/lib/lease-renewal/live-config");
      const { clearLiveLeaseCache } =
        await import("@/lib/lease-renewal/live-lease-cache");
      const { clearLeaseStatusTableCache } =
        await import("@/lib/lease-renewal/lease-status-table");
      const { GET: documentGet } =
        await import("@/app/api/lease-renewal/document-handoff/route");
      const { GET: screenshotGet } =
        await import("@/app/api/lease-renewal/comp-screenshot/route");
      const { GET: getWorkingRecordRoute, POST: postWorkingRecordRoute } =
        await import("@/app/api/lease-renewal/working-record/route");
      const { getRenewalWorkingRecord } =
        await import("@/lib/firestore/renewal-working-record");
      const { workingEntry } = await import("@/lib/lease-renewal/working-record");
      const { getMessagePreparation } =
        await import("@/lib/firestore/renewal-message-preparations");
      const leaseSource = buildLiveRentVineConfig();
      if (!leaseSource.ok) throw new Error("Deterministic source missing");
      const sheet = [header, ["Emulator Tenant", "1000", "1000"]];
      const formulas = [
        header,
        [
          '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/701","Emulator Tenant")',
          "1000",
          "1000",
        ],
      ];
      const config = {
        ok: true as const,
        rentvineHost: "pmikcmetro.rentvine.com",
        spreadsheetId,
        rentvineClient: leaseSource.rentvineClient,
        sheetsReader: {
          listTabTitles: async () => ["Lease Renewal"],
          batchGet: async () => ({
            valueRanges: [{ range: "Lease Renewal", values: sheet }],
          }),
          batchGetFormulas: async () => ({
            valueRanges: [{ range: "Lease Renewal", values: formulas }],
          }),
        },
      };
      clearLiveLeaseCache();
      clearLeaseStatusTableCache();
      if (start === "already underway") {
        await recordManual(await startManual(), {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Recorded prior phone outreach",
        });
      }
      const requests: string[] = [];
      const journeyRequests = mountedRequests;
      // Each mount's owning reads (owner/tenant message preparation, notice review) run a
      // read-modify-write notice-safety transaction on the same marker document. Overlapping one
      // batch with the next mount's reads, or with a staff write this journey times, resolves only
      // through the emulator's fixed 2 s lock-acquire timeout and SDK retry backoff. Let the
      // previous batch settle first; this never cancels a request or changes its result.
      const settleJourneyRequests = () =>
        journeyRequests.drain(JOURNEY_SETTLE_TIMEOUT_MS);
      // Bodyless diagnostics preserve the assertion budget and distinguish an unsettled owning
      // read from a detached testing-library scope when this mounted journey fails under load.
      type MessageReadPhase =
        | "route_started"
        | "route_returned"
        | "clone_parse"
        | "completed";
      const messageReadCounts: Record<
        MessageReadPhase | "parse_failed" | "threw",
        number
      > = {
        route_started: 0,
        route_returned: 0,
        clone_parse: 0,
        completed: 0,
        parse_failed: 0,
        threw: 0,
      };
      let messageReadCountsSaturated = false;
      function countMessageRead(key: keyof typeof messageReadCounts) {
        if (messageReadCounts[key] < 4096) messageReadCounts[key]++;
        else messageReadCountsSaturated = true;
      }
      function messageReadError(error: unknown) {
        let name: unknown;
        let code: unknown;
        let message: unknown;
        try {
          if (typeof error === "object" && error !== null) {
            const value = error as { name?: unknown; code?: unknown; message?: unknown };
            name = value.name;
            code = value.code;
            message = value.message;
          }
        } catch {
          return { errorName: "Other", errorCode: null, errorCategory: "other" };
        }
        const names = [
          "Error",
          "TypeError",
          "SyntaxError",
          "AbortError",
          "TimeoutError",
          "RangeError",
          "ReferenceError",
          "InvalidStateError",
        ];
        const codes = [
          "ABORTED",
          "DEADLINE_EXCEEDED",
          "UNAVAILABLE",
          "ECONNRESET",
          "ETIMEDOUT",
          "ERR_INVALID_STATE",
        ];
        return {
          // Only fixed source-site categories leave this helper; never an error message.
          errorCategory:
            typeof message === "string" &&
            message.startsWith("Unexpected journey HTTP path:")
              ? "unhandled_fixture_route"
              : message === "The admitted notice source changed during its bounded read."
                ? "admission_changed"
                : message === "The admitted notice source is unavailable or expired."
                  ? "admission_unavailable"
                  : message ===
                      "The held admitted lease source is unavailable or expired."
                    ? "held_lease_unavailable"
                    : message ===
                        "The held admitted status source is unavailable or expired."
                      ? "held_status_unavailable"
                      : message === "The client has already been terminated."
                        ? "client_terminated"
                        : "other",
          errorName: typeof name === "string" && names.includes(name) ? name : "Other",
          errorCode:
            typeof code === "number" && Number.isInteger(code) && code >= 0 && code <= 16
              ? code
              : typeof code === "string" && codes.includes(code)
                ? code
                : code === undefined
                  ? null
                  : "Other",
        };
      }
      const messageReads: Array<{
        channel: "owner" | "tenant" | "unknown";
        phase: MessageReadPhase;
        startedAt: number;
        elapsedMs: number | null;
        status: number | null;
        contentPresent: boolean;
        errorPresent: boolean;
        cloneParseFailed: boolean;
        errorName: string | null;
        errorCode: string | number | null;
        errorCategory: string | null;
        threw: boolean;
      }> = [];
      const routePaths = {
        "/api/lease-renewal/workspace": "workspace",
        "/api/lease-renewal/message-preparation": "message_preparation",
        "/api/lease-renewal/notice-review": "notice_review",
        "/api/lease-renewal/rent-suggestion": "rent_suggestion",
        "/api/lease-renewal/operating-sheet": "operating_sheet",
        "/api/lease-renewal/market-comps": "market_comps",
        "/api/lease-renewal/resource-locations": "resource_locations",
        "/api/lease-renewal/document-handoff": "document_handoff",
        "/api/lease-renewal/comp-screenshot": "comp_screenshot",
        "/api/lease-renewal/working-record": "working_record",
      } as const;
      type BridgeRoute =
        | (typeof routePaths)[keyof typeof routePaths]
        | "rentcast"
        | "other";
      const routeCounts = Object.fromEntries(
        [...Object.values(routePaths), "rentcast", "other"].map((route) => [
          route,
          { started: 0, completed: 0, rejected: 0 },
        ]),
      ) as Record<BridgeRoute, { started: number; completed: number; rejected: number }>;
      const routeFailures = Object.fromEntries(
        [...Object.values(routePaths), "rentcast", "other"].map((route) => [route, {}]),
      ) as Record<BridgeRoute, Record<string, number>>;
      let routeCountsSaturated = false;
      const noticeReads = { returned: 0, http200: 0, ready: 0 };
      const rentSuggestionReads = { returned: 0, http200: 0 };
      const owningGetRoutes = [
        "message_preparation",
        "notice_review",
        "rent_suggestion",
      ] as const;
      type OwningGetRoute = (typeof owningGetRoutes)[number];
      const owningGetCounts = Object.fromEntries(
        owningGetRoutes.map((route) => [
          route,
          {
            started: 0,
            returned: 0,
            http200: 0,
            parsedObject: 0,
            noTopError: 0,
            completed: 0,
            parseFailed: 0,
          },
        ]),
      ) as Record<
        OwningGetRoute,
        Record<
          | "started"
          | "returned"
          | "http200"
          | "parsedObject"
          | "noTopError"
          | "completed"
          | "parseFailed",
          number
        >
      >;
      let owningGetCountsSaturated = false;
      function countOwningGet(
        route: OwningGetRoute,
        key: keyof (typeof owningGetCounts)[OwningGetRoute],
      ) {
        if (owningGetCounts[route][key] < 4096) owningGetCounts[route][key]++;
        else owningGetCountsSaturated = true;
      }
      function owningGetReturned(route: OwningGetRoute, response: Response) {
        countOwningGet(route, "returned");
        if (response.status === 200) countOwningGet(route, "http200");
      }
      function owningGetParsed(route: OwningGetRoute, body: unknown) {
        if (body === null || typeof body !== "object" || Array.isArray(body)) return;
        countOwningGet(route, "parsedObject");
        if (!Object.prototype.hasOwnProperty.call(body, "error"))
          countOwningGet(route, "noTopError");
      }
      type BridgeRead = {
        route: BridgeRoute;
        method: "GET" | "POST" | "other";
        phase: MessageReadPhase;
        startedAt: number;
        elapsedMs: number | null;
        status: number | null;
        errorName: string | null;
        errorCode: string | number | null;
        errorCategory: string | null;
        threw: boolean;
      };
      const bridgeReads: BridgeRead[] = [];
      type TransactionSite = "reserve" | "admit" | "observe" | "save_notice" | "other";
      const transactionCounts = Object.fromEntries(
        ["reserve", "admit", "observe", "save_notice", "other"].map((site) => [
          site,
          {
            started: 0,
            completed: 0,
            rejected: 0,
            active: 0,
            maxElapsedMs: 0,
            codes: {},
          },
        ]),
      ) as Record<
        TransactionSite,
        {
          started: number;
          completed: number;
          rejected: number;
          active: number;
          maxElapsedMs: number;
          codes: Record<string, number>;
        }
      >;
      let transactionCountsSaturated = false;
      const transactionReads: Array<{
        site: TransactionSite;
        startedAt: number;
        elapsedMs: number | null;
        state: "pending" | "completed" | "rejected";
        errorCode: string | number | null;
      }> = [];
      observeMountedTransaction = (request, stack) => {
        // Own the original promise, including detached stale-cache admission. After it settles,
        // this fixture's export/detail readers use immediate synthetic promises only; the reset
        // fence lets their microtask-only cache publication complete. This is not a general
        // network/timer/background-job drain, and no additional source read is started here.
        journeyRequests.track(request);
        const site: TransactionSite = /\breserveRenewalNoticeLease\s*\(/.test(stack)
          ? "reserve"
          : /\bobserveRenewalNotice\s*\(/.test(stack)
            ? "observe"
            : /\bsaveRenewalNoticeReview\s*\(/.test(stack)
              ? "save_notice"
              : /\badmit\s*\(/.test(stack) && stack.includes("renewal-notice-safety")
                ? "admit"
                : "other";
        const read: (typeof transactionReads)[number] = {
          site,
          startedAt: Date.now(),
          elapsedMs: null,
          state: "pending",
          errorCode: null,
        };
        const counts = transactionCounts[site];
        if (counts.started < 4096) counts.started++;
        else transactionCountsSaturated = true;
        counts.active++;
        transactionReads.push(read);
        if (transactionReads.length > 32) transactionReads.shift();
        function terminal(
          state: "completed" | "rejected",
          errorCode: string | number | null,
        ) {
          read.state = state;
          read.elapsedMs = Date.now() - read.startedAt;
          read.errorCode = errorCode;
          counts.active--;
          if (counts[state] < 4096) counts[state]++;
          else transactionCountsSaturated = true;
          counts.maxElapsedMs = Math.max(counts.maxElapsedMs, read.elapsedMs);
          if (state === "rejected") {
            const code = String(errorCode ?? "none");
            if ((counts.codes[code] ?? 0) < 4096)
              counts.codes[code] = (counts.codes[code] ?? 0) + 1;
            else transactionCountsSaturated = true;
          }
        }
        void request.then(
          () => terminal("completed", null),
          (error: unknown) => terminal("rejected", messageReadError(error).errorCode),
        );
      };
      function countRoute(
        route: BridgeRoute,
        key: keyof (typeof routeCounts)[BridgeRoute],
      ) {
        if (routeCounts[route][key] < 4096) routeCounts[route][key]++;
        else routeCountsSaturated = true;
      }
      mountedReadDiagnostics = () => ({
        routeCounts,
        routeFailures,
        routeCountsSaturated,
        owningGetCounts,
        owningGetCountsSaturated,
        noticeReads,
        rentSuggestionReads,
        messageReadCounts,
        messageReadCountsSaturated,
        transactionCounts,
        transactionCountsSaturated,
        transactionReads: transactionReads.slice(-16).map(({ startedAt, ...read }) => ({
          ...read,
          pendingMs: read.elapsedMs === null ? Date.now() - startedAt : null,
        })),
        messageReads: messageReads.slice(-16).map(({ startedAt, ...read }) => ({
          ...read,
          pendingMs: read.elapsedMs === null ? Date.now() - startedAt : null,
        })),
        bridgeReads: bridgeReads.slice(-16).map(({ startedAt, ...read }) => ({
          ...read,
          pendingMs: read.elapsedMs === null ? Date.now() - startedAt : null,
        })),
      });
      assertMountedReadbacks = () => {
        expect(routeCountsSaturated, "Route diagnostics remained complete").toBe(false);
        expect(messageReadCountsSaturated, "Message diagnostics remained complete").toBe(
          false,
        );
        expect(owningGetCountsSaturated, "Owning GET counts remained complete").toBe(
          false,
        );
        expect(transactionCountsSaturated, "Transaction counts remained complete").toBe(
          false,
        );
        for (const route of owningGetRoutes) {
          const counts = owningGetCounts[route];
          expect(counts.started, `${route} owning GETs issued`).toBeGreaterThan(0);
          for (const key of [
            "returned",
            "http200",
            "parsedObject",
            "noTopError",
            "completed",
          ] as const)
            expect(counts[key], `${route} every GET ${key}`).toBe(counts.started);
          expect(counts.parseFailed, `${route} JSON parse failures`).toBe(0);
        }
        expect(
          routeCounts.notice_review.started,
          "Mounted owning notice GETs",
        ).toBeGreaterThan(0);
        expect(noticeReads.http200, "Real notice route returned HTTP200").toBeGreaterThan(
          0,
        );
        expect(noticeReads.ready, "Real notice source was ready").toBeGreaterThan(0);
        expect(
          routeCounts.rent_suggestion.started,
          "Mounted rent suggestion GETs",
        ).toBeGreaterThan(0);
        expect(
          rentSuggestionReads.http200,
          "Real rent suggestion route returned HTTP200",
        ).toBeGreaterThan(0);
        // Aggregate successful readback evidence only; no source values or response bodies.
        console.info(
          "S113 owning GET readbacks",
          JSON.stringify({
            owningGetCounts,
            noticeReady: noticeReads.ready,
            tracked: journeyRequests.snapshot(),
            transactionCounts,
          }),
        );
      };
      const originalFetch = globalThis.fetch;
      const routeBridge = async (
        input: string | Request,
        init: RequestInit | undefined,
        bridgeRead: BridgeRead,
      ) => {
        const url = new URL(
          typeof input === "string" ? input : input.url,
          "http://local.test",
        );
        if (url.hostname === "api.rentcast.io") {
          compRequests++;
          if (failComps) return new Response("unavailable", { status: 503 });
          return Response.json(
            url.pathname.includes("/markets")
              ? { history: { "2026-08": { averageRent: 1275, medianRent: 1250 } } }
              : {
                  rent: 1300,
                  rentRangeLow: 1200,
                  rentRangeHigh: 1400,
                  comparables: [
                    { price: 1250, correlation: 0.91 },
                    { price: 1350, correlation: 0.84 },
                    { price: 1300, correlation: 0.79 },
                  ],
                  subjectProperty: { bedrooms: 2 },
                },
          );
        }
        if (!url.pathname.startsWith("/api/lease-renewal/"))
          return originalFetch(input, init);
        const request = new Request(url, init);
        requests.push(`${request.method} ${url.pathname}`);
        if (url.pathname.endsWith("/workspace"))
          return request.method === "GET"
            ? getWorkspaceRoute(request)
            : postWorkspaceRoute(request);
        if (url.pathname.endsWith("/message-preparation")) {
          if (request.method !== "GET") return postMessageRoute(request);
          const channel = url.searchParams.get("channel");
          const read: (typeof messageReads)[number] = {
            channel: channel === "owner" || channel === "tenant" ? channel : "unknown",
            phase: "route_started",
            startedAt: Date.now(),
            elapsedMs: null,
            status: null,
            contentPresent: false,
            errorPresent: false,
            cloneParseFailed: false,
            errorName: null,
            errorCode: null,
            errorCategory: null,
            threw: false,
          };
          countMessageRead("route_started");
          messageReads.push(read);
          if (messageReads.length > 32) messageReads.shift();
          try {
            const response = await getMessageRoute(request);
            owningGetReturned("message_preparation", response);
            read.status = response.status;
            bridgeRead.status = response.status;
            read.phase = "route_returned";
            bridgeRead.phase = "route_returned";
            countMessageRead("route_returned");
            read.phase = "clone_parse";
            bridgeRead.phase = "clone_parse";
            countMessageRead("clone_parse");
            const body = (await response
              .clone()
              .json()
              .catch((error: unknown) => {
                read.cloneParseFailed = true;
                Object.assign(read, messageReadError(error));
                countMessageRead("parse_failed");
                countOwningGet("message_preparation", "parseFailed");
                return null;
              })) as {
              content?: { htmlBody?: unknown };
              error?: unknown;
            } | null;
            owningGetParsed("message_preparation", body);
            read.contentPresent = typeof body?.content?.htmlBody === "string";
            read.errorPresent = typeof body?.error === "string";
            read.phase = "completed";
            countMessageRead("completed");
            return response;
          } catch (error) {
            read.threw = true;
            Object.assign(read, messageReadError(error));
            countMessageRead("threw");
            throw error;
          } finally {
            read.elapsedMs = Date.now() - read.startedAt;
          }
        }
        if (url.pathname.endsWith("/notice-review") && request.method === "GET") {
          const response = await getNoticeReviewRoute(request);
          owningGetReturned("notice_review", response);
          bridgeRead.status = response.status;
          bridgeRead.phase = "route_returned";
          noticeReads.returned = Math.min(4096, noticeReads.returned + 1);
          if (response.status === 200) {
            noticeReads.http200 = Math.min(4096, noticeReads.http200 + 1);
          }
          bridgeRead.phase = "clone_parse";
          const result: unknown = await response
            .clone()
            .json()
            .catch((error: unknown) => {
              countOwningGet("notice_review", "parseFailed");
              throw error;
            });
          owningGetParsed("notice_review", result);
          if (
            response.status === 200 &&
            result !== null &&
            typeof result === "object" &&
            "ready" in result &&
            result.ready === true
          ) {
            noticeReads.ready = Math.min(4096, noticeReads.ready + 1);
          }
          return response;
        }
        if (url.pathname.endsWith("/rent-suggestion") && request.method === "GET") {
          const response = await getRentSuggestionRoute(request);
          owningGetReturned("rent_suggestion", response);
          bridgeRead.status = response.status;
          bridgeRead.phase = "route_returned";
          rentSuggestionReads.returned = Math.min(4096, rentSuggestionReads.returned + 1);
          if (response.status === 200) {
            rentSuggestionReads.http200 = Math.min(4096, rentSuggestionReads.http200 + 1);
          }
          bridgeRead.phase = "clone_parse";
          const result: unknown = await response
            .clone()
            .json()
            .catch((error: unknown) => {
              countOwningGet("rent_suggestion", "parseFailed");
              throw error;
            });
          owningGetParsed("rent_suggestion", result);
          return response;
        }
        if (url.pathname.endsWith("/operating-sheet"))
          return request.method === "GET" ? GET(request) : POST(request);
        if (url.pathname.endsWith("/market-comps")) return compRoute(request);
        if (url.pathname.endsWith("/resource-locations"))
          return postResourceRoute(request);
        if (url.pathname.endsWith("/document-handoff")) return documentGet(request);
        if (url.pathname.endsWith("/comp-screenshot")) return screenshotGet(request);
        if (url.pathname.endsWith("/working-record"))
          return request.method === "GET"
            ? getWorkingRecordRoute(request)
            : postWorkingRecordRoute(request);
        throw new Error(`Unexpected journey HTTP path: ${url.pathname}`);
      };
      vi.stubGlobal("fetch", (input: string | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input.url,
          "http://local.test",
        );
        const method = init?.method ?? (typeof input === "string" ? "GET" : input.method);
        const read: BridgeRead = {
          route:
            url.hostname === "api.rentcast.io"
              ? "rentcast"
              : (routePaths[url.pathname as keyof typeof routePaths] ?? "other"),
          method: method === "GET" || method === "POST" ? method : "other",
          phase: "route_started",
          startedAt: Date.now(),
          elapsedMs: null,
          status: null,
          errorName: null,
          errorCode: null,
          errorCategory: null,
          threw: false,
        };
        bridgeReads.push(read);
        if (bridgeReads.length > 32) bridgeReads.shift();
        countRoute(read.route, "started");
        const owningGet =
          read.method === "GET" && owningGetRoutes.includes(read.route as OwningGetRoute)
            ? (read.route as OwningGetRoute)
            : null;
        if (owningGet) countOwningGet(owningGet, "started");
        return journeyRequests.track(
          (async () => {
            try {
              const response = await routeBridge(input, init, read);
              read.status = response.status;
              read.phase = "completed";
              countRoute(read.route, "completed");
              if (owningGet) countOwningGet(owningGet, "completed");
              return response;
            } catch (error) {
              read.threw = true;
              const failure = messageReadError(error);
              Object.assign(read, failure);
              const failures = routeFailures[read.route];
              const classification = `${failure.errorName}:${failure.errorCode ?? "none"}:${failure.errorCategory}`;
              const key =
                classification in failures || Object.keys(failures).length < 32
                  ? classification
                  : "Other";
              failures[key] = Math.min(4096, (failures[key] ?? 0) + 1);
              countRoute(read.route, "rejected");
              throw error;
            } finally {
              read.elapsedMs = Date.now() - read.startedAt;
            }
          })(),
        );
      });
      const now = new Date().toISOString();
      async function mountCurrent() {
        await settleJourneyRequests();
        const state = await getRenewalWorkspace(actor, "701", db);
        const workingRecord = await getRenewalWorkingRecord(actor, "701", db);
        const loaded = await loadLiveRenewalLeaseWorkspace(
          "701",
          now,
          config as never,
          null,
          null,
          [],
          null,
          undefined,
          null,
          undefined,
          null,
          state,
        );
        expect(loaded.status).toBe("ok");
        if (loaded.status !== "ok") throw new Error(loaded.status);
        const sheetStatus = await (await post({ operation: "status" })).json();
        const resources = await getRenewalResourceLocations(actor, db);
        const result = render(
          h(
            "div",
            null,
            h(RenewalDeskReturnLink, { deskView: "v=2&scope=all&month=2026-12" }),
            h(RenewalWorkspace, {
              workspace: loaded.workspace,
              role: journeyRole,
              correctionPanel: h(RenewalCorrections, {
                leaseId: "701",
                role: journeyRole,
                dataCheck: loaded.workspace.dataCheck,
                sheetValues: { market_value: marketValue },
                workspaceContext: token,
                inventory: null,
                sheetPreviewHash: sheetStatus.proposal?.preview_hash ?? null,
                rentvinePreviewHash: null,
                reviewHref: null,
              }),
              operatingSheetPanel: h(OperatingSheetPanel, {
                role: journeyRole,
                association: { kind: "exact_link", rowNumber: 2 },
                workspaceContext: token,
                initialProposal: sheetStatus.proposal,
                initialEffects: sheetStatus.effects,
                initialFieldValues: { market_value: marketValue },
              }),
              selectedStepId: "verify-renewal",
              deskView: "v=2&scope=all&month=2026-12",
              manualState: state,
              manualCycleBasis: {
                kind: "lease_end",
                dateIso: "2026-12-31",
                source: "RentVine lease end",
              },
              workingRecord,
              resourceLocationsPanel: h(RenewalResourceLocations, {
                role: journeyRole,
                initialSettings: resources,
              }),
            }),
          ),
        );
        // S152: the lease opens in Focus view, which hides the Full view regions in place. This
        // journey works the Full view, as a person who chose it does; the choice saves nothing.
        fireEvent.click(screen.getByRole("button", { name: "Full view" }));
        await screen.findByRole("region", { name: "Lease details" });
        return result;
      }
      let mounted = await mountCurrent();
      for (const name of [
        "Lease details",
        "Market rent comparison",
        "Owner approval",
        "Tenant offer and response",
        "Documents and completion",
      ])
        expect(screen.getByRole("region", { name })).toBeInTheDocument();
      expect(screen.getByLabelText("Insurance flyer")).toHaveValue("");
      expect(screen.getByLabelText("Renewal information form")).toHaveValue("");
      expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
      // S154: there is no cycle step. Opening the lease records nothing; the first saved work
      // establishes the work record from the lease's real basis.
      if (start === "fresh")
        expect(await getRenewalWorkspace(actor, "701", db)).toBeNull();
      await within(
        screen.getByRole("region", { name: "Owner approval" }),
      ).findByLabelText("Owner response");
      const change = (node: HTMLElement, value: string) =>
        fireEvent.change(node, { target: { value } });
      // S155: a text entry saves by itself when the person leaves the control.
      const enter = (node: HTMLElement, value: string) => {
        change(node, value);
        fireEvent.blur(node);
      };
      const currentRevision = async () =>
        (await getRenewalWorkspace(actor, "701", db))?.revision ?? -1;
      const tenantCard = () => document.getElementById("renewal-card-message-tenant")!;
      // Each autosave round-trips the emulator; the same budget as the journey's other waits.
      async function savedAfter(before: number) {
        await waitFor(
          async () => expect(await currentRevision()).toBeGreaterThan(before),
          { timeout: 10_000 },
        );
        return currentRevision();
      }
      if (start === "fresh") {
        // S154/S155: the staff member records the outreach call they made. This first saved
        // work establishes the lease's work record from its real basis; no cycle was chosen.
        const outreach = within(
          document.getElementById("renewal-manual-owner_outreach")! as HTMLElement,
        );
        change(outreach.getByLabelText("Owner outreach outcome"), "done");
        await savedAfter(-1);
        const established = (await getRenewalWorkspace(actor, "701", db))!;
        expect(established.basis).toEqual({
          kind: "lease_end",
          dateIso: "2026-12-31",
          source: "RentVine lease end",
        });
        expect(established.activities.owner_outreach?.outcome).toBe("done");
        expect(
          (
            await db
              .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
              .where("cycle_id", "==", established.cycleId)
              .get()
          ).docs.map((entry) => entry.get("action.reason")),
        ).toContain("Established by the first saved work");
        await waitFor(
          () =>
            expect(
              document
                .getElementById("renewal-manual-owner_outreach")!
                .querySelector('[data-autosave="saved"]'),
            ).not.toBeNull(),
          { timeout: 10_000 },
        );

        // Mounted correction, proposal reload and confirmation use the normal backend.
        change(screen.getByLabelText("Fact to correct"), "market_value");
        change(screen.getByLabelText("Reviewed market value"), "1100");
        change(
          screen.getByLabelText("Source or context (optional)"),
          "Reviewed fixture market analysis",
        );
        fireEvent.click(
          screen.getByRole("button", { name: "Prepare selected destination previews" }),
        );
        await screen.findByText(/Saved: review and confirm its exact effect below/);
        expect(mutations).toBe(0);
        mounted.unmount();
        mounted = await mountCurrent();
        fireEvent.click(screen.getByRole("button", { name: "Review and confirm…" }));
        fireEvent.click(
          screen.getByRole("button", { name: "Confirm this exact effect once" }),
        );
        await screen.findByText(
          "Applied to the operating Sheet with a receipt and exact readback.",
          {},
          { timeout: 10_000 },
        );
        expect(marketValue).toBe("1100");
        expect(mutations).toBe(1);
        const actualProposal = (await getSheetWritebackProposal(
          actor,
          spreadsheetId,
          "Lease Renewal",
          scope,
          db,
        ))!;
        const receiptState = await db
          .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
          .doc(sheetWritebackExecutionId(actualProposal, actualProposal.effects[0]))
          .get();
        expect(receiptState.get("state")).toBe("succeeded");
        mounted.unmount();
        mounted = await mountCurrent();
        expect(
          await screen.findByText("Applied with receipt", {}, { timeout: 10_000 }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Confirm this exact effect once" }),
        ).toBeNull();

        // No owner decision is needed for the restored operator-triggered lookup.
        const comps = within(
          screen.getByRole("region", { name: "Market rent comparison" }),
        );
        fireEvent.click(
          await comps.findByRole(
            "button",
            { name: "Look up market comps (reference only)" },
            { timeout: 10_000 },
          ),
        );
        // S154: the lookup is retained on the work record in the emulator before the route
        // answers, and the trend call follows that answer; the same budget as the other
        // emulator-backed waits in this journey.
        await waitFor(() => expect(compRequests).toBe(2), {
          timeout: 10_000,
          onTimeout: (error) =>
            new Error(
              `Comp lookup diagnostics: ${JSON.stringify({
                compRequests,
                marketComps: routeCounts.market_comps,
                marketCompsFailures: routeFailures.market_comps,
                workspace: routeCounts.workspace,
                retentionFailed: comps.queryAllByText(/saving its evidence failed/)
                  .length,
                providerHttp: comps.queryAllByText(/RentCast response: HTTP/).length,
                comparableRents: comps.queryAllByText(/Comparable rents/).length,
              })}`,
              { cause: error },
            ),
        });
        // The button is named "Looking up…" until the route records the attempt in the emulator;
        // give it the same budget as the other emulator-backed waits in this journey.
        await waitFor(
          () =>
            expect(
              comps.getByRole("button", {
                name: "Look up market comps (reference only)",
              }),
            ).toBeEnabled(),
          { timeout: 10_000 },
        );
        // S155: the preparation that links the retained evidence saved by itself; the page shows
        // the retained basis once it reads back.
        await waitFor(
          async () =>
            expect(
              (await getRenewalWorkspace(actor, "701", db))?.preparation?.market.provider
                ?.pointEstimate,
            ).toBe(1300),
          { timeout: 10_000 },
        );
        await comps.findByText(
          /Retained provider basis: RentCast/,
          {},
          { timeout: 10_000 },
        );
        await settleJourneyRequests();
        const beforeNotes = await currentRevision();
        enter(
          comps.getByLabelText("Source of the comparison and review notes (optional)"),
          "Reviewed retained fixture RentCast results",
        );
        await savedAfter(beforeNotes);
        await waitFor(
          async () =>
            expect(
              (await getRenewalWorkspace(actor, "701", db))?.preparation,
            ).toMatchObject({
              source: "Reviewed retained fixture RentCast results",
              market: { provider: { pointEstimate: 1300 } },
            }),
          { timeout: 10_000 },
        );
        expect((await getRenewalWorkspace(actor, "701", db))?.ownerResponse).toBeNull();
        expect(
          (await db.collection(RENTCAST_USAGE_COLLECTION).get()).docs[0].get(
            "billed_calls",
          ),
        ).toBe(2);
        mounted.unmount();
        mounted = await mountCurrent();
        await screen.findByText(/Retained provider basis: RentCast/);
        resetMarketCompsCacheForTests();
        failComps = true;
        fireEvent.click(
          screen.getByRole("button", { name: "Look up market comps (reference only)" }),
        );
        await waitFor(() => expect(compRequests).toBe(3));
        await waitFor(
          () =>
            expect(
              screen.getByRole("button", {
                name: "Look up market comps (reference only)",
              }),
            ).toBeEnabled(),
          { timeout: 10_000 },
        );
        expect(
          (await getRenewalWorkspace(actor, "701", db))?.preparation?.market.provider
            ?.pointEstimate,
        ).toBe(1300);
        expect(screen.getByText(/Retained provider basis: RentCast/)).toBeInTheDocument();
      }
      /**
       * S155/S156: a response is recorded by choosing it, and its source saves when that field is
       * left; nothing waits on a Record button. S157: the owner-approved terms are the working
       * terms, each saved on its own; the approval itself carries no terms.
       */
      async function respond(
        audience: "owner" | "tenant",
        outcome: string,
        source: string,
        terms?: { rent: string; effectiveDate?: string; endDate?: string },
      ) {
        const root = within(
          screen.getByRole("region", {
            name: audience === "owner" ? "Owner approval" : "Tenant offer and response",
          }),
        );
        const key = audience === "owner" ? "ownerResponse" : "tenantResponse";
        await settleJourneyRequests();
        let revision = await currentRevision();
        const control = root.getByLabelText(
          audience === "owner" ? "Owner response" : "Tenant response",
        ) as HTMLSelectElement;
        if (control.value !== outcome) {
          change(control, outcome);
          revision = await savedAfter(revision);
          expect((await getRenewalWorkspace(actor, "701", db))![key]?.outcome).toBe(
            outcome,
          );
        }
        if (terms) {
          if (terms.effectiveDate)
            change(root.getByLabelText("Working effective date"), terms.effectiveDate);
          if (terms.endDate)
            change(root.getByLabelText("Working term end date"), terms.endDate);
          enter(root.getByLabelText("Working monthly rent"), terms.rent);
          await waitFor(
            async () => {
              const record = await getRenewalWorkingRecord(actor, "701", db);
              expect(workingEntry(record, "terms_rent")?.value).toBe(Number(terms.rent));
              if (terms.effectiveDate)
                expect(workingEntry(record, "terms_effective_date")?.value).toBe(
                  terms.effectiveDate,
                );
              if (terms.endDate)
                expect(workingEntry(record, "terms_end_date")?.value).toBe(terms.endDate);
            },
            { timeout: 10_000 },
          );
        }
        enter(root.getByLabelText("Response source or channel (optional)"), source);
        await savedAfter(revision);
        await waitFor(
          async () =>
            expect((await getRenewalWorkspace(actor, "701", db))![key]).toMatchObject({
              outcome,
              source,
            }),
          { timeout: 10_000 },
        );
        // The response's own status line confirms the save; its controls stay usable throughout.
        await waitFor(
          () =>
            expect(
              document
                .getElementById(`renewal-manual-${audience}_response`)!
                .querySelector(".autosave-status"),
            ).toHaveAttribute("data-autosave", "saved"),
          { timeout: 10_000 },
        );
        expect(control).toBeEnabled();
      }
      await respond("owner", "approved_terms", "Actual fixture phone response", {
        rent: "1100",
        effectiveDate: "2027-01-01",
        endDate: "2027-12-31",
      });
      // S156: the recorded approval is the answer alone; the terms live on the working record.
      expect(
        (await getRenewalWorkspace(actor, "701", db))!.ownerResponse!.terms,
      ).toBeUndefined();
      if (start === "fresh") {
        const tenantRegion = screen.getByRole("region", {
          name: "Tenant offer and response",
        });
        const tenant = within(tenantRegion);
        // The tenant preparation reloads after the working terms are saved; wait for it.
        // S161: the message is editable and copyable at once, with each absent value marked.
        await waitFor(
          () =>
            expect(tenant.getByLabelText("tenant formatted body")).toHaveTextContent(
              "$1,100.00",
            ),
          {
            timeout: 10_000,
            onTimeout: (error) => {
              const liveRegions = screen.queryAllByRole("region", {
                name: "Tenant offer and response",
              });
              const livePreviews = screen.queryAllByLabelText("tenant formatted body");
              return new Error(
                `Tenant preview wait diagnostics: ${JSON.stringify({
                  capturedRegionConnected: tenantRegion.isConnected,
                  currentRegionCount: liveRegions.length,
                  sameRegion: liveRegions.includes(tenantRegion),
                  currentPreviewCount: livePreviews.length,
                  currentPreviewHasExpectedRent: livePreviews.some((node) =>
                    node.textContent?.includes("$1,100.00"),
                  ),
                  messageReadCounts: { ...messageReadCounts },
                  messageReadCountsSaturated,
                  reads: messageReads.slice(-16).map(({ startedAt, ...read }) => ({
                    ...read,
                    pendingMs: read.elapsedMs === null ? Date.now() - startedAt : null,
                  })),
                })}`,
                { cause: error },
              );
            },
          },
        );
        // The publication is still pending, so only the Gmail step waits; copy is open.
        expect(
          tenant.getByRole("button", { name: "Preview unsent Gmail draft" }),
        ).toBeDisabled();
        expect(tenant.getByLabelText("tenant formatted body").textContent).not.toContain(
          "https://example",
        );
        expect(
          (tenant.getByLabelText("Email body") as HTMLTextAreaElement).value,
        ).toContain("[Needs Verification: renewal information form link]");
        expect(tenant.getByRole("button", { name: "Copy plain text" })).toBeEnabled();
        // Pending team links do not block inspection/copy; save a verified fixture destination through its control.
        const form = screen.getByLabelText("Renewal information form").closest("form")!;
        change(
          within(form).getByLabelText("Renewal information form"),
          "https://fixture-rental.net/form",
        );
        fireEvent.click(within(form).getByRole("checkbox"));
        fireEvent.click(
          within(form).getByRole("button", { name: "Save renewal information form" }),
        );
        // The save writes and reads back through the emulator; under full-gate load it needs the
        // journey's emulator budget like the other emulator-backed waits here. No safety check
        // depends on this wait.
        await screen.findByText("Link saved and read back.", {}, { timeout: 10_000 });
        expect(
          (await postMessageRoute(messageRequest({ kind: "publish", channel: "tenant" })))
            .status,
        ).toBe(200);
        mounted.unmount();
        mounted = await mountCurrent();
        const message = within(
          screen.getByRole("region", { name: "Tenant offer and response" }),
        );
        // The remounted preparation loads through the emulator-backed route; same budget as
        // the journey's other reloads.
        await message.findByLabelText("Current lease origin", {}, { timeout: 10_000 });
        // S161/S155: entries save by themselves (a choice on change, text on blur); there is no
        // review checkbox and no Save button.
        change(message.getByLabelText("Current lease origin"), "pmi");
        for (const control of message.getAllByLabelText("Does this charge apply?"))
          change(control, "false");
        change(message.getByLabelText("Sender name"), "Emulator Staff");
        change(
          message.getByLabelText("Response request (optional wording edit)"),
          "Please share your preferred next step.",
        );
        fireEvent.blur(
          message.getByLabelText("Response request (optional wording edit)"),
        );
        // The choices above each started a save, and the typed entries queued behind the one in
        // flight. The stored message is the evidence that every entry reached the server, and the
        // card's status line confirms it, before this lease is left.
        const messageCycle = (await getRenewalWorkspace(actor, "701", db))!.cycleId;
        await waitFor(
          async () => {
            expect(
              (await getMessagePreparation(actor, "701", messageCycle, "tenant", db))
                ?.inputs,
            ).toMatchObject({
              edits: { responseRequest: "Please share your preferred next step." },
              signature: { name: "Emulator Staff" },
              leaseOrigin: { kind: "pmi" },
            });
            expect(
              tenantCard().querySelector('[data-autosave="saved"]'),
              "autosave confirmed",
            ).not.toBeNull();
          },
          { timeout: 10_000 },
        );
        expect(
          message.getByRole("button", { name: "Preview unsent Gmail draft" }),
        ).toBeEnabled();
        mounted.unmount();
        // S124 binds each admitted lease generation to the reviewed draft audience, and an
        // approval read admits a new generation once the 60 s soft TTL has passed. Admit that
        // generation here, so the re-review and the draft below share one generation however
        // long this journey has run under load, instead of racing the soft TTL.
        await settleJourneyRequests();
        invalidateLiveLeaseCache();
        mounted = await mountCurrent();
        const resumed = within(
          screen.getByRole("region", { name: "Tenant offer and response" }),
        );
        // Saved entries survive the reload; the new source generation asks for nothing.
        await waitFor(
          () =>
            expect(
              resumed.getByLabelText("Response request (optional wording edit)"),
            ).toHaveValue("Please share your preferred next step."),
          { timeout: 10_000 },
        );
        expect(resumed.getByLabelText("Sender name")).toHaveValue("Emulator Staff");
        expect(
          resumed.getByRole("button", { name: "Preview unsent Gmail draft" }),
        ).toBeEnabled();
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: vi.fn(async () => {
              throw new Error("denied");
            }),
          },
        });
        fireEvent.click(resumed.getByRole("button", { name: "Copy plain text" }));
        await resumed.findByText(/Clipboard access was denied/);
        expect(
          (resumed.getByLabelText("Email body") as HTMLTextAreaElement).value,
        ).toContain("https://fixture-rental.net/form");
        fireEvent.click(
          resumed.getByRole("button", { name: "Preview unsent Gmail draft" }),
        );
        fireEvent.click(
          await resumed.findByRole("button", { name: "Review creation confirmation" }),
        );
        messageTransport.disconnected = true;
        fireEvent.click(
          resumed.getByRole("button", { name: "Create this unsent draft" }),
        );
        await resumed.findByText(/No Gmail request was made/);
        expect(messageTransport.creates).toBe(0);
        expect(resumed.getByRole("button", { name: "Copy plain text" })).toBeEnabled();
        messageTransport.disconnected = false;
        fireEvent.click(
          resumed.getByRole("button", { name: "Review creation confirmation" }),
        );
        fireEvent.click(
          resumed.getByRole("button", { name: "Create this unsent draft" }),
        );
        await resumed.findByText(
          "An unsent Gmail draft was created and recorded. Review it in Gmail before you send it; a person sends it.",
        );
        expect(messageTransport.creates).toBe(1);
        expect(decodeRawDraft(messageTransport.raw).to).toBe("tenant@fixture-rental.net");
        expect(decodeRawDraft(messageTransport.raw).body).toContain(
          "Please share your preferred next step.",
        );
        const durable = await db.collection("action_executions").get();
        expect(durable.size).toBe(1);
        expect(durable.docs[0].get("state")).toBe("Succeeded");
      }
      await respond(
        "tenant",
        "counter_change_requested",
        "Actual fixture tenant counter by email",
      );
      expect(
        manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!).complete,
      ).toBe(false);
      // S156: the order of work is guidance. Completion stays available and unrecorded; the
      // counter recorded nothing it did not say.
      expect(
        screen.getByRole("button", { name: "Record staff completion" }),
      ).toBeEnabled();
      expect(screen.getAllByText(/Suggested next: /).length).toBeGreaterThan(0);
      // The owner answers the counter: the working rent changes, and the renewed approval is
      // recorded with its own source.
      await respond(
        "owner",
        "approved_terms",
        "Actual fixture phone approval of the counter",
        { rent: "1150" },
      );
      await respond("tenant", "accepted", "Actual fixture tenant acceptance by email");
      for (const [activity, definition] of Object.entries(MANUAL_ACTIVITIES)) {
        if (activity === "non_renewal_handoff") continue;
        const details = document.getElementById(
          `renewal-manual-${activity}`,
        )! as HTMLDetailsElement;
        details.open = true;
        const group = within(details);
        await settleJourneyRequests();
        // S155: the chosen outcome saves at once; the source saves when its field is left.
        let revision = await currentRevision();
        change(group.getByLabelText(`${definition.label} outcome`), "done");
        revision = await savedAfter(revision);
        enter(
          group.getByLabelText("Source or channel (optional)"),
          "Fixture record of work completed outside the app",
        );
        await savedAfter(revision);
        await waitFor(
          async () =>
            expect(
              (await getRenewalWorkspace(actor, "701", db))!.activities[
                activity as keyof typeof MANUAL_ACTIVITIES
              ],
            ).toMatchObject({
              outcome: "done",
              source: "Fixture record of work completed outside the app",
            }),
          { timeout: 10_000 },
        );
        expect(group.getByLabelText(`${definition.label} outcome`)).toBeEnabled();
      }
      // S155/S160: saving reads and writes no Sheet. Every recorded value waits as pending until
      // staff prepare it deliberately, and nothing was confirmed.
      const recordedWork = (await getRenewalWorkspace(actor, "701", db))!;
      expect(manualRenewalSummary(recordedWork).pendingSourceUpdates).toBeGreaterThan(0);
      expect(
        Object.values(recordedWork.sourceUpdates).map((update) => update.state),
      ).toEqual(Object.values(recordedWork.sourceUpdates).map(() => "pending"));
      expect(mutations).toBe(start === "fresh" ? 1 : 0);
      await settleJourneyRequests();
      fireEvent.click(screen.getByRole("button", { name: "Record staff completion" }));
      await waitFor(async () =>
        expect(
          manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!).complete,
        ).toBe(true),
      );
      // Remount only after the actual control receives the route's final state, otherwise the
      // new provider can start from the intermediate revision and correctly refuse a later edit.
      await waitFor(
        () =>
          expect(
            screen.getByRole("button", { name: "Reopen recorded completion" }),
          ).toBeEnabled(),
        { timeout: 10_000 },
      );
      // S156: completion is the staff record itself; the independent staff-lane oracle reads it
      // that way. The predecessor oracle still parses the same stored record.
      const independentlyRead = await readIndependentDecisionFacts(db);
      const completedState = (await getRenewalWorkspace(actor, "701", db))!;
      expect(independentlyRead.staffLaneManualByLease?.get("701")).toMatchObject({
        cycleId: completedState.cycleId,
        revision: completedState.revision,
        complete: true,
        nextActivity: "complete",
        actionStepId: "compliance-close",
      });
      expect(independentlyRead.staffLaneManualByLease?.get("701")?.sourceDigest).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(independentlyRead.manualByLease?.get("701")).toMatchObject({
        cycleId: completedState.cycleId,
        revision: completedState.revision,
      });

      mounted.unmount();
      mounted = await mountCurrent();
      expect(
        screen.getByRole("button", { name: "Reopen recorded completion" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /separate from verified completion in RentVine, Gmail or Dotloop/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "← Back to renewals" }).getAttribute("href"),
      ).toContain("month=2026-12");
      const persisted = (await getRenewalWorkspace(actor, "701", db))!;
      const desk = await loadLiveRenewalDesk(
        [{ startIso: "2026-12-01", endIso: "2026-12-31" }],
        now,
        config as never,
        undefined,
        undefined,
        [],
        new Map([["701", null]]),
        true,
        undefined,
        undefined,
        new Map([["701", persisted]]),
      );
      expect(desk.status).toBe("ok");
      expect(JSON.stringify(desk)).toContain("Completed: recorded by staff");
      if (start === "already underway") {
        // S156: completion is the staff record itself. Work that resumes reopens it; the owner's
        // decline and the non-renewal handoff are then recorded as they happen.
        await settleJourneyRequests();
        const reopenFrom = await currentRevision();
        fireEvent.click(
          screen.getByRole("button", { name: "Reopen recorded completion" }),
        );
        await savedAfter(reopenFrom);
        expect(
          manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!).complete,
        ).toBe(false);
        await screen.findByRole(
          "button",
          { name: "Record staff completion" },
          { timeout: 10_000 },
        );
        await respond("owner", "declined_non_renewal", "Fixture owner decline by phone");
        expect(
          manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!),
        ).toMatchObject({ complete: false, nonRenewal: true });
        expect(
          screen.getByRole("button", { name: "Record staff completion" }),
        ).toBeEnabled();
        // The handoff activity appears once the decline is on record.
        await waitFor(() =>
          expect(
            document.getElementById("renewal-manual-non_renewal_handoff"),
          ).not.toBeNull(),
        );
        const handoff = document.getElementById(
          "renewal-manual-non_renewal_handoff",
        )! as HTMLDetailsElement;
        handoff.open = true;
        const controls = within(handoff);
        change(
          controls.getByLabelText(
            `${MANUAL_ACTIVITIES.non_renewal_handoff.label} outcome`,
          ),
          "done",
        );
        await waitFor(
          async () =>
            expect(
              (await getRenewalWorkspace(actor, "701", db))?.activities
                .non_renewal_handoff?.outcome,
            ).toBe("done"),
          { timeout: 5000 },
        );
        const handoffFrom = await currentRevision();
        enter(
          controls.getByLabelText("Source or channel (optional)"),
          "Fixture reviewed non-renewal handoff",
        );
        await savedAfter(handoffFrom);
        await waitFor(
          () =>
            expect(
              screen.getByRole("button", { name: "Record staff completion" }),
            ).toBeEnabled(),
          { timeout: 10_000 },
        );
        await settleJourneyRequests();
        fireEvent.click(screen.getByRole("button", { name: "Record staff completion" }));
        await waitFor(async () =>
          expect(
            manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!),
          ).toMatchObject({ complete: true, nonRenewal: true }),
        );
      }
      expect((await db.collection("action_executions").get()).size).toBe(
        start === "fresh" ? 1 : 0,
      );
      expect(messageTransport.creates).toBe(start === "fresh" ? 1 : 0);
      expect(mutations).toBe(start === "fresh" ? 1 : 0);
      expect(
        (await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).get()).size,
      ).toBeGreaterThan(15);
      cleanup();
    },
    // The fresh journey admits a new lease generation and re-reviews before drafting (S124); those
    // emulator transactions took it to 118 s of the former 120 s budget under full-gate load.
    180_000,
  );
});
