import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { RenewalWritebackDependencies } from "@/lib/lease-renewal/writeback/execution-service";
const local = vi.hoisted(() => ({
  db: null as Firestore | null,
  role: "Editor",
  deps: null as RenewalWritebackDependencies | null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => local.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => ({
    uid: "s113-rv-staff",
    email: "s113-rv-staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: local.role,
  }),
}));
vi.mock("@/lib/lease-renewal/writeback/live", () => ({
  buildLiveRenewalWritebackDeps: () => local.deps,
  assertRenewalWritebackExecutionAllowed: async () => undefined,
}));
// Source refresh is independently reported; this test must never construct a real provider.
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: () => ({ ok: false, reason: "fixture" }),
}));
import { POST } from "@/app/api/lease-renewal/rentvine-writeback/route";
import {
  FirestoreExternalExecutionStore,
  EXTERNAL_EXECUTION_COLLECTIONS,
} from "@/lib/firestore/external-action-executions";
import { claimActiveS97RenewalEffect } from "@/lib/firestore/s97-renewal-writeback-claim";
import {
  getRenewalWorkspace,
  startRenewalCycle,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import { getRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-store";
import { futureRentWorkspaceMatches } from "@/lib/lease-renewal/writeback/future-rent-intent";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
let app: App,
  db: Firestore,
  environment: RulesTestEnvironment,
  workspace: RenewalWorkspaceState,
  writes = 0;
let charge: Record<string, unknown>;
const actor = {
  uid: "s113-rv-staff",
  email: "s113-rv-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const projectId = "pmi-kc-s113-rentvine-route-test";
const terms = { rent: 1275, effectiveDate: "2098-01-01", endDate: "2098-12-31" };
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s113-rv-route-${process.pid}`);
  db = getFirestore(app);
  local.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await environment.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  writes = 0;
  local.role = "Editor";
  const basis = {
      kind: "lease_end" as const,
      dateIso: "2097-12-31",
      source: "Emulator lease",
    },
    cycleId = randomUUID();
  await startRenewalCycle(
    actor,
    {
      leaseId: "81",
      expectedCycleId: null,
      expectedRevision: 0,
      operationId: cycleId,
      basis,
      reason: "Reviewed emulator cycle",
    },
    basis,
    db,
  );
  workspace = (
    await saveRenewalWorkspace(
      actor,
      {
        leaseId: "81",
        cycleId,
        expectedRevision: 0,
        operationId: randomUUID(),
        action: {
          kind: "owner_response",
          outcome: "approved_terms",
          terms,
          source: "Emulator owner approval",
        },
      },
      db,
    )
  ).state!;
  charge = {
    leaseRecurringChargeID: "301",
    leaseID: "81",
    accountID: "9",
    amount: "1250.00",
    description: "Emulator future rent",
    dayDue: "1",
    frequency: "1",
    startDate: "2098-01-01",
    endDate: "2098-12-31",
    nextChargeDate: "2098-01-01",
    isMoveInCharge: "0",
    isFromImport: "0",
    rentIncreaseID: null,
    importSourceKey: null,
    recurringStatusID: 2,
    account: { accountID: "9", name: "Emulator rent account", isRent: "1" },
  };
  local.deps = {
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    store: new FirestoreExternalExecutionStore(db),
    reads: {
      getLease: async () => ({
        leaseID: "81",
        startDate: "2097-01-01",
        endDate: "2097-12-31",
        increaseEligibilityDate: null,
      }),
      listRecurringCharges: async () => [charge],
      getRecurringCharge: async () => charge,
    },
    gateFor: () => ({ isExecutable: async () => true, run: async (work) => work() }),
    claimActiveEffect: (input) => claimActiveS97RenewalEffect(db, input),
    assertCurrentRenewalTerms: async (proposal) =>
      !!proposal.renewalTerms &&
      futureRentWorkspaceMatches(
        await getRenewalWorkspace(actor, "81", db),
        proposal.renewalTerms,
      ),
    createWriter: () => ({
      updateExistingRecurringCharge: async (_lease, id, payload) => {
        writes++;
        charge = { ...charge, ...payload };
        return { recurringCharge: { leaseRecurringChargeID: id } };
      },
      updateLease: async () => {
        throw new Error("Unexpected effect");
      },
      createRecurringCharge: async () => {
        throw new Error("Unexpected effect");
      },
      deleteRecurringChargeForCreateReversal: async () => {
        throw new Error("Unexpected effect");
      },
    }),
  };
});
function post(body: unknown) {
  return POST(
    new Request("http://local.test/api/lease-renewal/rentvine-writeback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
function proposalBody() {
  return {
    operation: "propose",
    leaseId: "81",
    expectedPriorPreviewHash: null,
    businessIntent: "future_rent",
    renewalContext: {
      cycleId: workspace.cycleId,
      termsRevision: workspace.termsRevision,
      scheduleReview: "Reviewed future schedule",
    },
    evidenceRef: "Reviewed exact owner terms",
    effects: [
      {
        kind: "recurring_charge_update",
        chargeId: "301",
        changes: { amount: "1275.00" },
      },
    ],
  };
}
async function prepared() {
  const response = await post(proposalBody()),
    result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  const stored = (await getRenewalWritebackProposal(actor, "81", db))!;
  expect(stored.renewalTerms?.terms).toEqual(terms);
  return stored;
}
describe("S113 actual future-rent route and persisted business intent", () => {
  it("hands an Editor preparation to an Admin for one separately confirmed receipted effect", async () => {
    const proposal = await prepared();
    expect(writes).toBe(0);
    const confirm = {
      operation: "execute",
      leaseId: "81",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    };
    expect((await post(confirm)).status).toBe(403);
    expect(writes).toBe(0);
    local.role = "Admin";
    const response = await post(confirm),
      result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.receipt).toBeTruthy();
    expect(writes).toBe(1);
    expect(charge.amount).toBe("1275.00");
    expect(
      (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).get()).docs.map(
        (doc) => doc.data(),
      ),
    ).toEqual([
      expect.objectContaining({
        state: "succeeded",
        attemptCount: 1,
        receipt: expect.any(Object),
      }),
    ]);
    expect((await (await post(confirm)).json()).duplicate).toBe(true);
    expect(writes).toBe(1);
  });
  it("refuses changed owner terms before consuming the attempt", async () => {
    const proposal = await prepared();
    await saveRenewalWorkspace(
      actor,
      {
        leaseId: "81",
        cycleId: workspace.cycleId,
        expectedRevision: workspace.revision,
        operationId: randomUUID(),
        action: {
          kind: "owner_response",
          outcome: "revision_requested",
          source: "Owner follow-up",
        },
      },
      db,
    );
    local.role = "Admin";
    expect(
      (
        await post({
          operation: "execute",
          leaseId: "81",
          previewHash: proposal.previewHash,
          effectHash: proposal.effects[0].effectHash,
          confirm: true,
        })
      ).status,
    ).toBe(409);
    expect(writes).toBe(0);
    expect(
      (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).get()).empty,
    ).toBe(true);
  });
  it("rejects an unapproved amount at preparation before saving a proposal", async () => {
    const body = proposalBody();
    body.effects[0].changes.amount = "1276.00";
    expect((await post(body)).status).toBe(409);
    expect(await getRenewalWritebackProposal(actor, "81", db)).toBeNull();
    expect(writes).toBe(0);
  });
});
