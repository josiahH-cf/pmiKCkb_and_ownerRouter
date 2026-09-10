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

import { POST } from "@/app/api/lease-renewal/operating-sheet/route";
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
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("RENEWAL_SHEET_ID", spreadsheetId);
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("RENEWAL_DESK_PARTY_FILTER_KEY", Buffer.alloc(32, 29).toString("base64url"));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await environment.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
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
  it("keeps confirmation unavailable to an Editor without consuming an attempt", async () => {
    const proposal = await propose(1100);
    testState.role = "Editor";
    expect((await post(confirmation(proposal))).status).toBe(403);
    expect(mutations).toBe(0);
    const executionId = sheetWritebackExecutionId(proposal, proposal.effects[0]);
    expect(
      (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(executionId).get())
        .exists,
    ).toBe(false);
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
  return { state: result.state as RenewalWorkspaceState, input };
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
  it("refuses missing exact approval and browser-forged provider fields before persisting", async () => {
    const state = await startManual();
    const base = {
      operation: "record",
      leaseId: "701",
      cycleId: state.cycleId,
      expectedRevision: 0,
      operationId: randomUUID(),
    };
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
    ).toBe(400);
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
    expect((await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).get()).size).toBe(
      1,
    );
  });
});

import {
  POST as compRoute,
  resetMarketCompsCacheForTests,
} from "@/app/api/lease-renewal/market-comps/route";
import { RENTCAST_USAGE_COLLECTION } from "@/lib/firestore/rentcast-usage";
vi.mock("@/lib/lease-renewal/market-comp-query-resolver", () => ({
  resolveCurrentMarketCompQueryBasis: async (leaseId: string) => ({
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
  it("lets an Editor record once, then an Admin confirm and read back the same typed field", async () => {
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
    expect((await post(confirmation(proposal))).status).toBe(403);
    expect(mutations).toBe(0);
    testState.role = "Admin";
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
    state = (
      await recordManual(state, {
        kind: "activity",
        activity: "pet",
        outcome: "done",
        source: "Pet record",
      })
    ).state;
    const old = (await getSheetWritebackProposal(
      actor,
      spreadsheetId,
      "Lease Renewal",
      scope,
      db,
    ))!;
    state = (
      await recordManual(state, {
        kind: "activity",
        activity: "pet",
        outcome: "waiting",
        source: "Corrected current pet record",
      })
    ).state;
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
vi.mock("@/lib/lease-renewal/live-config", async (original) => ({
  ...(await original<typeof import("@/lib/lease-renewal/live-config")>()),
  buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: {} }),
  buildLiveRenewalConfig: () => ({ ok: false, reason: "test_source_not_configured" }),
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", async (original) => ({
  ...(await original<typeof import("@/lib/lease-renewal/live-lease-cache")>()),
  requireCurrentLeaseViews: async () => [
    {
      leaseID: 701,
      endDate: "2026-12-31",
      currentRent: 1000,
      tenants: [{ name: "Emulator Tenant", email: "tenant@fixture-rental.net" }],
      property: { streetName: "701 Emulator Avenue" },
      portfolio: {
        owners: [{ name: "Emulator Owner", email: "owner@fixture-rental.net" }],
      },
    },
  ],
}));
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
    const body = {
      leaseId: "701",
      cycleId: state.cycleId,
      channel: "tenant",
      expectedRevision: 1,
      operationId: randomUUID(),
      sourceFingerprint: current.basis.sourceFingerprint,
      reviewed: true,
      inputs: result.inputs,
    };
    const preserved = await saveMessagePreparation(
      nextActor,
      body,
      {
        sourceFingerprint: current.basis.sourceFingerprint,
        workspaceFingerprint: current.basis.workspaceFingerprint!,
      },
      db,
    );
    expect(preserved.record?.signatureActorUid).toBe(actor.uid);
    const adopted = await saveMessagePreparation(
      nextActor,
      { ...body, expectedRevision: 2, operationId: randomUUID(), adoptSignature: true },
      {
        sourceFingerprint: current.basis.sourceFingerprint,
        workspaceFingerprint: current.basis.workspaceFingerprint!,
      },
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
  it("retains edits, exact review and publication through reload, then verifies rich MIME and one receipt", async () => {
    const { save, result } = await preparedMessage();
    expect(messageTransport.creates).toBe(0);
    expect(result.content.missing).toEqual([]);
    expect(result.needsReview).toBe(false);
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
    expect((await readMessage()).saved.reviewedSourceFingerprint).toBe(
      result.sourceFingerprint,
    );
    expect(
      (await db.collection(MESSAGE_PREPARATION_COLLECTIONS.activity).get()).size,
    ).toBe(1);
  });
  it("preserves prose after changed owner terms, refuses stale save/confirmation and keeps copy after Gmail failure", async () => {
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
    expect(reread.needsReview).toBe(true);
    expect(reread.content.plainText).toContain("$1,200.00");
    expect(
      (
        await postMessageRoute(
          messageRequest({ ...save, operationId: randomUUID(), expectedRevision: 1 }),
        )
      ).status,
    ).toBe(409);
    const refused = await (
      await postMessageRoute(
        messageRequest({
          kind: "draft",
          leaseId: "701",
          channel: "tenant",
          confirm: { executionId: preview.executionId, previewHash: preview.previewHash },
        }),
      )
    ).json();
    expect(refused.status).toBe("blocked");
    expect(messageTransport.creates).toBe(0);
    expect(
      (
        await postMessageRoute(
          messageRequest({
            ...save,
            cycleId: next.state.cycleId,
            sourceFingerprint: reread.sourceFingerprint,
            expectedRevision: 1,
            operationId: randomUUID(),
          }),
        )
      ).status,
    ).toBe(200);
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
    expect((await readMessage()).needsReview).toBe(true);
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
    const approved = (
      await recordManual(state, {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1100, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Emulator exact owner terms",
      })
    ).state;
    const { resolveLivePacketInput, PACKET_SOURCE_COLLECTIONS } =
      await import("@/lib/lease-documents/live-input");
    const { renewalWorkspaceDocId } = await import("@/lib/firestore/renewal-workspace");
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
    const upload = await call({
      kind: "preview",
      operation: "document_upload",
      documentRef: document.providerBindings!.dotloopDocumentRef,
    });
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
    const readback = await call({ kind: "readback" });
    expect(readback.evidenceLevel).toBe("loop_metadata_only");
    expect(readback.snapshot.execution.documentEvidence).toEqual([
      expect.objectContaining({
        evidenceLevel: "presence_only",
        submittedContentHash: contentHash,
      }),
    ]);
    expect(readback.snapshot.execution.state).toBe("Partially executed");
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
    expect((await handoff.json()).attempts).toHaveLength(2);
    expect(messageTransport.creates).toBe(0);
    expect(mutations).toBe(0);
  });
});

// H1/H2/H7/H8: mounted dashboard -> actual HTTP handlers -> Firestore -> owning desk projection.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
describe("S113 mounted operator journey with persisted backend state", () => {
  afterEach(async () => {
    (await import("@testing-library/react")).cleanup();
    vi.unstubAllGlobals();
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
      const { withFakeLeaseDetail } =
        await import("@/tests/helpers/rentvine-detail-fake");
      const { clearLiveLeaseCache } =
        await import("@/lib/lease-renewal/live-lease-cache");
      const { GET: documentGet } =
        await import("@/app/api/lease-renewal/document-handoff/route");
      const { GET: screenshotGet } =
        await import("@/app/api/lease-renewal/comp-screenshot/route");
      const raw = [
        {
          lease: {
            leaseID: 701,
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            leaseType: "Fixed Term",
            baseRentAmount: "1000.00",
            tenants: [{ name: "Emulator Tenant", email: "tenant@fixture-rental.net" }],
          },
          property: { propertyID: 702, streetName: "701 Emulator Avenue" },
          unit: { rent: "1400.00" },
        },
      ];
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
        rentvineClient: withFakeLeaseDetail({
          listAllLeasesExport: async () => ({ rows: raw, pages: 1, complete: true }),
        }),
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
      if (start === "already underway") {
        await recordManual(await startManual(), {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Recorded prior phone outreach",
        });
      }
      const requests: string[] = [];
      const originalFetch = globalThis.fetch;
      vi.stubGlobal("fetch", async (input: string | Request, init?: RequestInit) => {
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
        if (url.pathname.endsWith("/message-preparation"))
          return request.method === "GET"
            ? getMessageRoute(request)
            : postMessageRoute(request);
        if (url.pathname.endsWith("/operating-sheet")) return POST(request);
        if (url.pathname.endsWith("/market-comps")) return compRoute(request);
        if (url.pathname.endsWith("/resource-locations"))
          return postResourceRoute(request);
        if (url.pathname.endsWith("/document-handoff")) return documentGet(request);
        if (url.pathname.endsWith("/comp-screenshot")) return screenshotGet(request);
        throw new Error(`Unexpected journey HTTP path: ${url.pathname}`);
      });
      const now = new Date().toISOString();
      async function mountCurrent() {
        const state = await getRenewalWorkspace(actor, "701", db);
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
        return render(
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
                hasSheetRow: true,
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
              resourceLocationsPanel: h(RenewalResourceLocations, {
                role: journeyRole,
                initialSettings: resources,
              }),
            }),
          ),
        );
      }
      let mounted = await mountCurrent();
      for (const name of [
        "Lease details",
        "Comps",
        "Owner",
        "Tenant",
        "Documents and completion",
      ])
        expect(screen.getByRole("region", { name })).toBeInTheDocument();
      expect(screen.getByLabelText("Insurance flyer")).toHaveValue("");
      expect(screen.getByLabelText("Renewal information form")).toHaveValue("");
      expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
      if (start === "fresh") {
        fireEvent.click(
          screen.getByRole("checkbox", {
            name: "I reviewed this cycle and want to record work against it.",
          }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Use this reviewed cycle" }));
        await waitFor(async () =>
          expect(await getRenewalWorkspace(actor, "701", db)).not.toBeNull(),
        );
      }
      await screen.findByRole("button", { name: "Record owner response" });
      const change = (node: HTMLElement, value: string) =>
        fireEvent.change(node, { target: { value } });
      if (start === "fresh") {
        // Mounted correction, proposal reload and confirmation use the normal backend.
        change(screen.getByLabelText("Fact to correct"), "market_value");
        change(screen.getByLabelText("Reviewed market value"), "1100");
        change(
          screen.getByLabelText("Value source / reason"),
          "Reviewed fixture market analysis",
        );
        fireEvent.click(
          screen.getByRole("button", { name: "Prepare selected destination previews" }),
        );
        await screen.findByText(/Saved: awaiting its separate exact confirmation/);
        expect(mutations).toBe(0);
        mounted.unmount();
        mounted = await mountCurrent();
        fireEvent.click(screen.getByRole("button", { name: "Review and confirm…" }));
        fireEvent.click(
          screen.getByRole("button", { name: "Confirm this exact effect once" }),
        );
        await screen.findByText(
          "Applied to the operating Sheet with a receipt and exact readback.",
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
          screen.getByText(
            "google_sheets.renewal_checklist.field_update · Applied with receipt",
          ),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Confirm this exact effect once" }),
        ).toBeNull();

        // No owner decision is needed for the restored operator-triggered lookup.
        const comps = within(screen.getByRole("region", { name: "Comps" }));
        fireEvent.click(
          comps.getByRole("button", { name: "Look up market comps (reference only)" }),
        );
        await waitFor(() => expect(compRequests).toBe(2));
        await waitFor(() =>
          expect(
            comps.getByRole("button", { name: "Look up market comps (reference only)" }),
          ).toBeEnabled(),
        );
        change(
          comps.getByLabelText("Typed evidence source / review note"),
          "Reviewed retained fixture RentCast results",
        );
        fireEvent.click(comps.getByRole("button", { name: "Save comp preparation" }));
        await waitFor(async () =>
          expect(
            (await getRenewalWorkspace(actor, "701", db))?.preparation?.market.provider
              ?.pointEstimate,
          ).toBe(1300),
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
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Look up market comps (reference only)" }),
          ).toBeEnabled(),
        );
        expect(
          (await getRenewalWorkspace(actor, "701", db))?.preparation?.market.provider
            ?.pointEstimate,
        ).toBe(1300);
        expect(screen.getByText(/Retained provider basis: RentCast/)).toBeInTheDocument();
      }
      async function respond(
        audience: "owner" | "tenant",
        outcome: string,
        rent = "1100",
      ) {
        const root = within(
          screen.getByRole("region", { name: audience === "owner" ? "Owner" : "Tenant" }),
        );
        const control = root.getByLabelText(
          audience === "owner" ? "Owner response" : "Tenant response",
        );
        change(control, outcome);
        if (audience === "owner" && outcome === "approved_terms") {
          change(root.getByLabelText("Exact owner-approved monthly base rent"), rent);
          change(root.getByLabelText("Approved effective date"), "2027-01-01");
          change(root.getByLabelText("Approved term end date"), "2027-12-31");
        }
        change(
          root.getByLabelText("Response source or channel"),
          "Actual fixture phone response",
        );
        const before = (await getRenewalWorkspace(actor, "701", db))!.revision;
        fireEvent.click(
          root.getByRole("button", { name: `Record ${audience} response` }),
        );
        await waitFor(async () =>
          expect((await getRenewalWorkspace(actor, "701", db))!.revision).toBeGreaterThan(
            before,
          ),
        );
        await waitFor(() =>
          expect(
            root.getByRole("button", { name: `Record ${audience} response` }),
          ).not.toBeDisabled(),
        );
      }
      await respond("owner", "approved_terms");
      if (start === "fresh") {
        const tenant = within(screen.getByRole("region", { name: "Tenant" }));
        await waitFor(() =>
          expect(
            (tenant.getByLabelText("tenant plain text body") as HTMLTextAreaElement)
              .value,
          ).toContain("$1,100.00"),
        );
        expect(
          tenant.getByRole("button", { name: "Preview unsent Gmail draft" }),
        ).toBeDisabled();
        expect(
          (tenant.getByLabelText("tenant plain text body") as HTMLTextAreaElement).value,
        ).not.toContain("https://example");
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
        await screen.findByText("Link saved and read back.");
        expect(
          (await postMessageRoute(messageRequest({ kind: "publish", channel: "tenant" })))
            .status,
        ).toBe(200);
        mounted.unmount();
        mounted = await mountCurrent();
        const message = within(screen.getByRole("region", { name: "Tenant" }));
        await message.findByLabelText("Current lease origin");
        change(message.getByLabelText("Current lease origin"), "pmi");
        change(
          message.getByLabelText("Lease-origin source"),
          "Reviewed fixture original lease",
        );
        for (const control of message.getAllByLabelText("Applicability"))
          change(control, "false");
        for (const control of message.getAllByLabelText(
          "Applicability and charge source",
        ))
          change(control, "Reviewed fixture original charge schedule");
        change(message.getByLabelText("Sender name"), "Emulator Staff");
        change(
          message.getByLabelText("Signature source"),
          "Fixture managed staff declaration",
        );
        change(
          message.getByLabelText("Response request (optional wording edit)"),
          "Please share your preferred next step.",
        );
        fireEvent.click(
          message.getByRole("checkbox", {
            name: "I reviewed these inputs and the current source facts for this message.",
          }),
        );
        fireEvent.click(
          message.getByRole("button", { name: "Save reviewed preparation" }),
        );
        await waitFor(() =>
          expect(
            message.getByRole("button", { name: "Preview unsent Gmail draft" }),
          ).toBeEnabled(),
        );
        mounted.unmount();
        mounted = await mountCurrent();
        const resumed = within(screen.getByRole("region", { name: "Tenant" }));
        await waitFor(() =>
          expect(
            resumed.getByRole("button", { name: "Preview unsent Gmail draft" }),
          ).toBeEnabled(),
        );
        expect(
          resumed.getByLabelText("Response request (optional wording edit)"),
        ).toHaveValue("Please share your preferred next step.");
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
          (resumed.getByLabelText("tenant plain text body") as HTMLTextAreaElement).value,
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
          "An unsent Gmail draft was created and recorded. Review it in Gmail; a person sends it.",
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
      await respond("tenant", "counter_change_requested");
      expect(
        manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!).complete,
      ).toBe(false);
      expect(
        screen.getByRole("button", { name: "Record staff completion" }),
      ).toBeDisabled();
      await respond("owner", "approved_terms", "1150");
      await respond("tenant", "accepted");
      for (const [activity, definition] of Object.entries(MANUAL_ACTIVITIES)) {
        if (activity === "non_renewal_handoff") continue;
        const details = document.getElementById(
          `renewal-manual-${activity}`,
        )! as HTMLDetailsElement;
        details.open = true;
        const group = within(details);
        change(group.getByLabelText(`${definition.label} outcome`), "done");
        change(
          group.getByLabelText("Source or channel"),
          "Fixture record of work completed outside the app",
        );
        const before = (await getRenewalWorkspace(actor, "701", db))!.revision;
        fireEvent.click(
          group.getByRole("button", { name: `Record ${definition.label.toLowerCase()}` }),
        );
        await waitFor(async () =>
          expect((await getRenewalWorkspace(actor, "701", db))!.revision).toBeGreaterThan(
            before,
          ),
        );
        await waitFor(() =>
          expect(
            group.getByRole("button", {
              name: `Record ${definition.label.toLowerCase()}`,
            }),
          ).not.toBeDisabled(),
        );
      }
      fireEvent.click(screen.getByRole("button", { name: "Record staff completion" }));
      await waitFor(async () =>
        expect(
          manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!).complete,
        ).toBe(true),
      );
      const independentlyRead = await readIndependentDecisionFacts(db);
      expect(independentlyRead.manualByLease?.get("701")).toMatchObject({
        complete: true,
        nextActivity: "complete",
        actionStepId: "compliance-close",
      });
      expect(independentlyRead.manualByLease?.get("701")?.sourceDigest).toMatch(
        /^[a-f0-9]{64}$/,
      );

      mounted.unmount();
      mounted = await mountCurrent();
      expect(
        screen.getByRole("button", { name: "Reopen recorded completion" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/does not establish verified completion/),
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
        await respond("owner", "declined_non_renewal");
        expect(
          manualRenewalSummary((await getRenewalWorkspace(actor, "701", db))!).complete,
        ).toBe(false);
        expect(
          screen.getByRole("button", { name: "Record staff completion" }),
        ).toBeDisabled();
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
        change(
          controls.getByLabelText("Source or channel"),
          "Fixture reviewed non-renewal handoff",
        );
        fireEvent.click(
          controls.getByRole("button", {
            name: `Record ${MANUAL_ACTIVITIES.non_renewal_handoff.label.toLowerCase()}`,
          }),
        );
        await waitFor(
          async () =>
            expect(
              (await getRenewalWorkspace(actor, "701", db))?.activities
                .non_renewal_handoff?.outcome,
            ).toBe("done"),
          { timeout: 5000 },
        );
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Record staff completion" }),
          ).toBeEnabled(),
        );
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
    45000,
  );
});
