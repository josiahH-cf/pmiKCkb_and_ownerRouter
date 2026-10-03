// S117 (R117.2, R117.3): the existing exact RentVine operations through the owning route with
// deterministic provider adapters. Forged targets, unsupported setters and a future-rent effect
// without the tenant's recorded acceptance are refused before any attempt is claimed.
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
  email: "s117-rv-staff@pmikcmetro.com",
  deps: null as RenewalWritebackDependencies | null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => local.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => ({
    uid: "s117-rv-staff",
    email: local.email,
    hd: "pmikcmetro.com",
    role: local.role,
  }),
}));
vi.mock("@/lib/lease-renewal/writeback/live", () => ({
  buildLiveRenewalWritebackDeps: () => local.deps,
  assertRenewalWritebackExecutionAllowed: async () => undefined,
}));
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
  LEASE_BOUND_WORK_BASIS,
  getRenewalWorkspace,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import { readEffectiveRenewalTerms } from "@/lib/firestore/renewal-effective-terms";
import {
  getRenewalWorkingRecord,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import { getRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-store";
import { futureRentTermsCurrent } from "@/lib/lease-renewal/writeback/future-rent-intent";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

let app: App,
  db: Firestore,
  environment: RulesTestEnvironment,
  workspace: RenewalWorkspaceState,
  writes = 0,
  charges: Record<string, unknown>[] = [];
const actor = {
  uid: "s117-rv-staff",
  email: "s117-rv-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const projectId = "pmi-kc-s117-rentvine-route-test";
const terms = { rent: 1275, effectiveDate: "2098-01-01", endDate: "2098-12-31" };
const rentAccount = { accountID: "9", name: "Emulator rent account", isRent: "1" };
function chargeRecord(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    leaseID: "81",
    accountID: "9",
    amount: "1250.00",
    description: "Rent",
    dayDue: "1",
    frequency: "1",
    startDate: "2026-01-01",
    endDate: null,
    nextChargeDate: "2026-10-01",
    isMoveInCharge: "0",
    isFromImport: "0",
    rentIncreaseID: null,
    importSourceKey: null,
    recurringStatusID: 1,
    account: rentAccount,
    ...overrides,
  };
}
const CURRENT_RENT = () => chargeRecord({ leaseRecurringChargeID: "301" });
// A non-rent account whose description reads "Rent": the label never makes it billing rent.
const PET_RENT = () =>
  chargeRecord({
    leaseRecurringChargeID: "302",
    accountID: "12",
    amount: "35.00",
    account: { accountID: "12", name: "Pet rent", isRent: "0" },
  });
const FUTURE_RENT = () =>
  chargeRecord({
    leaseRecurringChargeID: "303",
    description: "Emulator future rent",
    startDate: "2098-01-01",
    endDate: "2098-12-31",
    nextChargeDate: "2098-01-01",
    recurringStatusID: 2,
  });

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s117-rv-route-${process.pid}`);
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
  local.email = "s117-rv-staff@pmikcmetro.com";
  charges = [CURRENT_RENT(), PET_RENT()];
  const basis = {
    kind: "lease_end" as const,
    dateIso: "2097-12-31",
    source: "Emulator lease",
  };
  // S154: a lease with recorded work. The first save establishes the record; here it records an
  // owner approval whose terms serve as the fallback effective terms for the future-rent tests.
  workspace = (
    await saveRenewalWorkspace(
      actor,
      {
        leaseId: "81",
        cycleId: null,
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
      async () => basis,
    )
  ).state!;
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
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        increaseEligibilityDate: null,
        baseRentAmount: 1250,
      }),
      listRecurringCharges: async () => charges,
      getRecurringCharge: async (_lease, id) => {
        const found = charges.find((entry) => entry.leaseRecurringChargeID === id);
        if (!found) throw Object.assign(new Error("absent"), { status: 404 });
        return found;
      },
    },
    gateFor: () => ({ isExecutable: async () => true, run: async (work) => work() }),
    claimActiveEffect: (input) => claimActiveS97RenewalEffect(db, input),
    assertCurrentRenewalTerms: async (proposal) =>
      !!proposal.renewalTerms &&
      futureRentTermsCurrent(
        await readEffectiveRenewalTerms("81", db),
        proposal.renewalTerms,
      ),
    createWriter: () => ({
      updateExistingRecurringCharge: async (_lease, id, payload) => {
        writes++;
        charges = charges.map((entry) =>
          entry.leaseRecurringChargeID === id ? { ...entry, ...payload } : entry,
        );
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
function currentBaseBody(
  chargeId = "301",
  changes: Record<string, unknown> = { amount: "1300.00" },
) {
  return {
    operation: "propose",
    leaseId: "81",
    expectedPriorPreviewHash: null,
    businessIntent: "current_base",
    evidenceRef: "Reviewed the signed lease",
    effects: [{ kind: "recurring_charge_update", chargeId, changes }],
  };
}
function futureBody() {
  return {
    operation: "propose",
    leaseId: "81",
    expectedPriorPreviewHash: null,
    businessIntent: "future_rent",
    // S156/S160: the server binds the preview to the working terms; the context is optional.
    renewalContext: { scheduleReview: "Reviewed future schedule" },
    effects: [
      {
        kind: "recurring_charge_update",
        chargeId: "303",
        changes: { amount: "1275.00" },
      },
    ],
  };
}
async function records() {
  return (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).get()).docs.map(
    (doc) => doc.data(),
  );
}
async function recordOwnerResponse(
  outcome: "revision_requested" | "no_response" | "approved_terms",
) {
  const current = (await getRenewalWorkspace(actor, "81", db))!;
  await saveRenewalWorkspace(
    actor,
    {
      leaseId: "81",
      cycleId: current.cycleId,
      expectedRevision: current.revision,
      operationId: randomUUID(),
      action: { kind: "owner_response", outcome, source: "Owner call" },
    },
    db,
  );
}
/** S156: the lease-bound working terms, one independently saved field at a time. */
async function saveWorkingTerms(values: {
  rent?: number;
  effectiveDate?: string;
  endDate?: string;
}) {
  const fields = {
    terms_rent: values.rent,
    terms_effective_date: values.effectiveDate,
    terms_end_date: values.endDate,
  };
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const record = await getRenewalWorkingRecord(actor, "81", db);
    await saveRenewalWorkingField(
      actor,
      {
        leaseId: "81",
        field,
        value,
        expectedRevision: record?.fields[field]?.revision ?? 0,
        operationId: randomUUID(),
      },
      db,
    );
  }
}

describe("S117 exact RentVine operations through the owning route", () => {
  it("S160 BEH-S160-1/5 (AC-S160-1, was AC-S117-2): an Editor prepares the exact current base-rent charge change and confirms it once through the existing key; a verification account never dispatches", async () => {
    const response = await post(currentBaseBody()),
      result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    const proposal = (await getRenewalWritebackProposal(actor, "81", db))!;
    expect(proposal.businessIntent).toBe("current_base");
    expect(proposal.effects[0].actionKey).toBe("rentvine.lease.recurring_charge.update");
    const confirm = {
      operation: "execute",
      leaseId: "81",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    };
    // S167 BEH-S167-7: a verification account is refused on execute, reconcile and reverse,
    // whatever role it carries, before any writer or claim exists.
    for (const role of ["Editor", "Admin"]) {
      local.role = role;
      local.email = "canary-editor@pmikcmetro.com";
      for (const operation of ["execute", "reconcile", "reverse_preview"]) {
        const bare = { ...confirm, confirm: undefined };
        const refused = await post(
          operation === "execute" ? { ...confirm, operation } : { ...bare, operation },
        );
        expect(refused.status, operation).toBe(403);
        expect((await refused.json()).error).toMatch(/verification account/);
      }
    }
    expect(writes).toBe(0);
    expect(await records()).toEqual([]);
    local.role = "Editor";
    local.email = "s117-rv-staff@pmikcmetro.com";
    const applied = await post(confirm),
      receipt = await applied.json();
    expect(applied.status, JSON.stringify(receipt)).toBe(200);
    expect(receipt.receipt).toBeTruthy();
    expect(receipt.source_refresh).toBeTruthy();
    expect(writes).toBe(1);
    expect(charges.find((entry) => entry.leaseRecurringChargeID === "301")?.amount).toBe(
      "1300.00",
    );
    expect(charges.find((entry) => entry.leaseRecurringChargeID === "302")?.amount).toBe(
      "35.00",
    );
    expect(await records()).toEqual([
      expect.objectContaining({ state: "succeeded", attemptCount: 1 }),
    ]);
    expect((await (await post(confirm)).json()).duplicate).toBe(true);
    expect(writes).toBe(1);
  });

  it("AC-S117-2: forged targets and unsupported setters are refused before any proposal or attempt exists", async () => {
    // A non-rent account described "Rent", a future schedule, a second field, and an absent charge.
    for (const body of [
      currentBaseBody("302"),
      currentBaseBody("303"),
      currentBaseBody("301", { amount: "1300.00", description: "Rent" }),
      currentBaseBody("301", { description: "Rent" }),
      currentBaseBody("999"),
    ]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBe(409);
    }
    // The lease-date contract has no start-date setter; the strict body refuses it outright.
    expect(
      (
        await post({
          operation: "propose",
          leaseId: "81",
          expectedPriorPreviewHash: null,
          evidenceRef: "Reviewed",
          effects: [{ kind: "renewal_dates_update", after: { startDate: "2026-02-01" } }],
        })
      ).status,
    ).toBe(400);
    // A one-time posting cannot be emulated with an invalid recurring cadence.
    const create = await post({
      operation: "propose",
      leaseId: "81",
      expectedPriorPreviewHash: null,
      evidenceRef: "Reviewed",
      effects: [
        {
          kind: "recurring_charge_create",
          create: {
            accountID: "9",
            amount: "150.00",
            description: "Processing fee",
            dayDue: "1",
            frequency: "0",
            startDate: "10/01/2026",
          },
        },
      ],
    });
    expect(create.status).toBeGreaterThanOrEqual(400);
    expect(create.status).toBeLessThan(500);
    expect(await getRenewalWritebackProposal(actor, "81", db)).toBeNull();
    expect(await records()).toEqual([]);
    expect(writes).toBe(0);
  });

  it("S156 BEH-S156-5 (AC-S156-1, was AC-S117-3): an Editor prepares and confirms a future-rent effect once with no tenant acceptance recorded", async () => {
    charges = [FUTURE_RENT()];
    const response = await post(futureBody());
    expect(response.status, JSON.stringify(await response.json())).toBe(200);
    const proposal = (await getRenewalWritebackProposal(actor, "81", db))!;
    expect(proposal.renewalTerms).toMatchObject({ cycleId: workspace.cycleId, terms });
    expect((await getRenewalWorkspace(actor, "81", db))!.tenantResponse).toBeNull();
    const confirm = {
      operation: "execute",
      leaseId: "81",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    };
    const applied = await post(confirm),
      result = await applied.json();
    expect(applied.status, JSON.stringify(result)).toBe(200);
    expect(writes).toBe(1);
    expect(charges[0].amount).toBe("1275.00");
    // No acceptance or approval record was manufactured to hold the effect.
    const after = (await getRenewalWorkspace(actor, "81", db))!;
    expect(after.tenantResponse).toBeNull();
    expect(after.ownerResponse?.outcome).toBe("approved_terms");
    expect((await (await post(confirm)).json()).duplicate).toBe(true);
    expect(writes).toBe(1);
  });

  it("S156 BEH-S156-4 / S160 BEH-S160-1 (AC-S156-1): working terms alone, with no owner response and no prior work record, carry a future-rent effect to execution", async () => {
    await environment.clearFirestore();
    charges = [FUTURE_RENT()];
    await saveWorkingTerms(terms);
    expect(await getRenewalWorkspace(actor, "81", db)).toBeNull();
    const effective = await readEffectiveRenewalTerms("81", db);
    expect(effective.complete).toEqual(terms);
    expect(effective.sources).toEqual({
      rent: "working",
      effectiveDate: "working",
      endDate: "working",
    });
    const response = await post({ ...futureBody(), renewalContext: undefined });
    expect(response.status, JSON.stringify(await response.json())).toBe(200);
    // Preparing established the work record on the lease (no source date is reachable here).
    const established = (await getRenewalWorkspace(actor, "81", db))!;
    expect(established.basis).toEqual(LEASE_BOUND_WORK_BASIS);
    expect(established.ownerResponse).toBeNull();
    expect(established.tenantResponse).toBeNull();
    const proposal = (await getRenewalWritebackProposal(actor, "81", db))!;
    expect(proposal.renewalTerms).toMatchObject({ cycleId: established.cycleId, terms });
    expect(proposal.evidenceRef).toBe("Staff working value");
    const applied = await post({
      operation: "execute",
      leaseId: "81",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    });
    expect(applied.status, JSON.stringify(await applied.json())).toBe(200);
    expect(writes).toBe(1);
    expect(charges[0].amount).toBe("1275.00");
    const after = (await getRenewalWorkspace(actor, "81", db))!;
    expect(after.ownerResponse).toBeNull();
    expect(after.tenantResponse).toBeNull();
  });

  it("S160 BEH-S160-10 / S156 BEH-S156-8: a stale preview hash and changed working terms are refused before any attempt; an owner revision is a fact, not a gate", async () => {
    charges = [FUTURE_RENT()];
    await saveWorkingTerms(terms);
    expect((await post(futureBody())).status).toBe(200);
    const proposal = (await getRenewalWritebackProposal(actor, "81", db))!;
    const confirm = {
      operation: "execute",
      leaseId: "81",
      previewHash: proposal.previewHash,
      effectHash: proposal.effects[0].effectHash,
      confirm: true,
    };
    expect((await post({ ...confirm, previewHash: "f".repeat(64) })).status).toBe(409);
    // The owner asking for a revision changes no working term and blocks nothing.
    await recordOwnerResponse("revision_requested");
    // The working rent moved after the preview: the exact bound value is no longer current.
    await saveWorkingTerms({ rent: 1300 });
    const changed = await post(confirm),
      refusal = await changed.json();
    expect(changed.status, JSON.stringify(refusal)).toBe(409);
    expect(refusal.error_type).toBe("renewal_terms_changed");
    expect(writes).toBe(0);
    expect(await records()).toEqual([]);
    // Restoring the exact terms makes the same preview confirmable again, once.
    await saveWorkingTerms({ rent: terms.rent });
    const applied = await post(confirm);
    expect(applied.status, JSON.stringify(await applied.json())).toBe(200);
    expect(writes).toBe(1);
    expect(charges[0].amount).toBe("1275.00");
    expect((await getRenewalWorkspace(actor, "81", db))!.ownerResponse?.outcome).toBe(
      "revision_requested",
    );
  });
});
