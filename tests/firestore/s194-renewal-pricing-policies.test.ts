import { resolveRenewalPricing } from "@/lib/lease-renewal/renewal-pricing-policy";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  RenewalPricingPolicyStore,
  RENEWAL_PRICING_COLLECTIONS,
  type PricingSourceVerifier,
} from "@/lib/firestore/renewal-pricing-policies";
import type { RenewalPricingPolicyInput } from "@/lib/lease-renewal/renewal-pricing-policy";
const projectId = "pmi-kc-kb-s194-emulator-test";
let env: RulesTestEnvironment, app: App, db: Firestore, store: RenewalPricingPolicyStore;
const admin = {
  uid: "managed-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const editor = { ...admin, uid: "editor", role: "Editor" as const };
const facts = {
  leaseId: "115",
  portfolioId: "55",
  currentRent: 1201,
  cycleDate: "2026-12-31",
  rentSource: "Synthetic authoritative source",
};
const verify: PricingSourceVerifier = {
  lease: async (id) => {
    if (!["115", "116"].includes(id)) throw new Error("No actual lease");
    return { ...facts, leaseId: id };
  },
  portfolio: async (id) => id === "55",
};
const input = (): RenewalPricingPolicyInput => ({
  id: randomUUID(),
  name: "Synthetic policy",
  kind: "percentage",
  value: 3.5,
  effectiveFrom: "2026-10-01",
  effectiveThrough: null,
  enabled: true,
  purpose: "Synthetic evidence",
});
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `pricing-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await env.clearFirestore();
  store = new RenewalPricingPolicyStore(db, () => "2026-10-09T15:00:00Z");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await env.cleanup();
});
describe("S194 actual policy transactions and source membership", () => {
  it("converges concurrent retries and refuses competing stale policy edits with immutable versions", async () => {
    const policy = input(),
      op = randomUUID();
    const [a, b] = await Promise.all([
      store.savePolicy(admin, policy, 0, op),
      store.savePolicy(admin, policy, 0, op),
    ]);
    expect([a.version, b.version]).toEqual([1, 1]);
    const race = await Promise.allSettled([
      store.savePolicy(admin, { ...policy, value: 4 }, 1, randomUUID()),
      store.savePolicy(admin, { ...policy, value: 5 }, 1, randomUUID()),
    ]);
    expect(race.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await db.collection(RENEWAL_PRICING_COLLECTIONS.versions).get()).size).toBe(
      2,
    );
    await expect(
      store.savePolicy(admin, { ...policy, value: 9 }, 0, op),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("resolves portfolio default, explicit lease override and removal without changing another lease", async () => {
    const p = await store.savePolicy(admin, input(), 0, randomUUID());
    const fixed = await store.savePolicy(
      admin,
      { ...input(), kind: "fixed_dollar", value: 50 },
      0,
      randomUUID(),
    );
    await store.assign(
      admin,
      {
        scope: "portfolio",
        sourceId: "55",
        policyId: p.id,
        expectedVersion: 0,
        operationId: randomUUID(),
        reason: "Actual membership fixture",
      },
      verify,
    );
    expect((await store.resolve(editor, facts, null)).proposal?.amount).toBe(1243);
    await store.assign(
      editor,
      {
        scope: "lease",
        sourceId: "115",
        policyId: fixed.id,
        expectedVersion: 0,
        operationId: randomUUID(),
        reason: "Lease exception",
      },
      verify,
    );
    expect((await store.resolve(editor, facts, null)).proposal?.amount).toBe(1251);
    expect(
      (await store.resolve(editor, { ...facts, leaseId: "116" }, null)).proposal?.amount,
    ).toBe(1243);
    await store.assign(
      editor,
      {
        scope: "lease",
        sourceId: "115",
        policyId: null,
        expectedVersion: 1,
        operationId: randomUUID(),
        reason: "Remove exception",
      },
      verify,
    );
    expect((await store.resolve(editor, facts, null)).proposal?.amount).toBe(1243);
  });
  it("keeps the older effective version until a future edit applies and exposes changed proposal basis", async () => {
    const raw = input(),
      p = await store.savePolicy(admin, raw, 0, randomUUID());
    await store.assign(
      admin,
      {
        scope: "portfolio",
        sourceId: "55",
        policyId: p.id,
        expectedVersion: 0,
        operationId: randomUUID(),
        reason: "Fixture",
      },
      verify,
    );
    await store.savePolicy(
      admin,
      { ...raw, value: 5, effectiveFrom: "2026-11-01" },
      1,
      randomUUID(),
    );
    expect((await store.resolve(editor, facts, null)).proposal?.amount).toBe(1243);
    const november = new RenewalPricingPolicyStore(db, () => "2026-11-02T15:00:00Z");
    expect(await november.resolve(editor, facts, null)).toMatchObject({
      policyChanged: true,
      proposal: { amount: 1261, policyVersion: 2 },
    });
  });
  it("reads valid legacy percentage rules equivalently without rewriting their record or creating owner consent", async () => {
    const legacy = {
      portfolio_id: "55",
      kind: "flat_percent_increase",
      percent: 3.5,
      effective_from: "2026-01-01",
      note: "Synthetic legacy",
      updated_by_uid: admin.uid,
    };
    await db.collection("owner_policy_rules").doc("55").set(legacy);
    const result = await store.resolve(editor, facts, null);
    expect(result.proposal?.amount).toBe(1243);
    expect(result.authority.covered).toBe(false);
    expect((await db.collection("owner_policy_rules").doc("55").get()).data()).toEqual(
      legacy,
    );
  });
  it("holds unknown IDs, unauthorized administrators and verification writes before persistence", async () => {
    await expect(
      store.savePolicy(editor, input(), 0, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      store.savePolicy(
        { ...admin, email: "canary-admin@pmikcmetro.com" },
        input(),
        0,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      store.assign(
        admin,
        {
          scope: "portfolio",
          sourceId: "56",
          policyId: null,
          expectedVersion: 0,
          operationId: randomUUID(),
          reason: "Unknown",
        },
        verify,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.assign(
        editor,
        {
          scope: "lease",
          sourceId: "999",
          policyId: null,
          expectedVersion: 0,
          operationId: randomUUID(),
          reason: "Unknown",
        },
        verify,
      ),
    ).rejects.toThrow();
    expect((await db.collection(RENEWAL_PRICING_COLLECTIONS.operations).get()).size).toBe(
      0,
    );
  });
  it("separately records scoped standing authority and restores review on revocation or different terms", async () => {
    const p = await store.savePolicy(admin, input(), 0, randomUUID());
    await store.assign(
      admin,
      {
        scope: "portfolio",
        sourceId: "55",
        policyId: p.id,
        expectedVersion: 0,
        operationId: randomUUID(),
        reason: "Fixture",
      },
      verify,
    );
    const terms = { rent: 1243, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
    const agreement = {
      id: randomUUID(),
      policyId: p.id,
      policyVersion: 1,
      portfolioId: "55",
      leaseIds: ["115"],
      cycleDate: "2026-12-31",
      terms,
      evidenceRef: "app_record:actual-reviewed-owner-agreement",
      effectiveFrom: "2026-10-01",
      expiresOn: "2027-01-01",
      revoked: false,
    };
    const saved = await store.saveAgreement(admin, agreement, 0, randomUUID(), verify);
    expect((await store.resolve(editor, facts, terms)).authority.covered).toBe(true);
    expect(
      (await store.resolve(editor, facts, { ...terms, rent: 1300 })).authority.covered,
    ).toBe(false);
    await store.saveAgreement(
      admin,
      { ...agreement, revoked: true },
      saved.version,
      randomUUID(),
      verify,
    );
    expect((await store.resolve(editor, facts, terms)).authority.covered).toBe(false);
    expect(
      (await db.collection(RENEWAL_PRICING_COLLECTIONS.agreementVersions).get()).size,
    ).toBe(2);
  });
  it("denies browser SDK access to policy/authority/private audit records under the actual rules", async () => {
    const browser = env
      .authenticatedContext(editor.uid, {
        email: editor.email,
        hd: editor.hd,
        role: editor.role,
      })
      .firestore();
    for (const collection of Object.values(RENEWAL_PRICING_COLLECTIONS)) {
      await assertFails(getDoc(doc(browser, collection, "fixture")));
      await assertFails(setDoc(doc(browser, collection, "fixture"), { forged: true }));
    }
  });
});

it("S194 one bounded request snapshot covers many leases and never caches a revoked agreement", async () => {
  const p = await store.savePolicy(admin, input(), 0, randomUUID());
  await store.assign(
    admin,
    {
      scope: "portfolio",
      sourceId: "55",
      policyId: p.id,
      expectedVersion: 0,
      operationId: randomUUID(),
      reason: "Fixture",
    },
    verify,
  );
  const terms = { rent: 1243, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
  const agreement = {
    id: randomUUID(),
    policyId: p.id,
    policyVersion: 1,
    portfolioId: "55",
    leaseIds: ["115"],
    cycleDate: "2026-12-31",
    terms,
    evidenceRef: "app_record:actual-reviewed-owner-agreement",
    effectiveFrom: "2026-10-01",
    expiresOn: "2027-01-01",
    revoked: false,
  };
  await store.saveAgreement(admin, agreement, 0, randomUUID(), verify);
  const scope = Array.from({ length: 200 }, (_, i) => ({
    ...facts,
    leaseId: String(115 + i),
  }));
  const batch = vi.spyOn(db, "getAll");
  const snapshot = await store.snapshot(editor, scope);
  expect(batch).toHaveBeenCalledTimes(3);
  batch.mockRestore();
  expect(snapshot.policies).toHaveLength(1);
  expect(snapshot.agreements).toHaveLength(1);
  expect(
    resolveRenewalPricing(snapshot, facts, terms, "2026-10-09").authority.covered,
  ).toBe(true);
  expect(
    resolveRenewalPricing(snapshot, { ...facts, leaseId: "116" }, terms, "2026-10-09")
      .authority.covered,
  ).toBe(false);
  await store.saveAgreement(
    admin,
    { ...agreement, revoked: true },
    1,
    randomUUID(),
    verify,
  );
  const fresh = await store.snapshot(editor, scope);
  expect(resolveRenewalPricing(fresh, facts, terms, "2026-10-09").authority.covered).toBe(
    false,
  );
  // No process, owner decision, message or source update is manufactured by reads.
  expect((await db.collection("renewal_workspace_states").get()).empty).toBe(true);
});
it("S194 effective policies follow the Chicago business date at UTC midnight", async () => {
  const p = await store.savePolicy(
    admin,
    { ...input(), effectiveFrom: "2026-10-10" },
    0,
    randomUUID(),
  );
  await store.assign(
    admin,
    {
      scope: "portfolio",
      sourceId: "55",
      policyId: p.id,
      expectedVersion: 0,
      operationId: randomUUID(),
      reason: "Fixture",
    },
    verify,
  );
  const evening = new RenewalPricingPolicyStore(db, () => "2026-10-10T01:00:00Z");
  expect((await evening.resolve(editor, facts, null)).proposal).toBeNull();
  const morning = new RenewalPricingPolicyStore(db, () => "2026-10-10T06:00:00Z");
  expect((await morning.resolve(editor, facts, null)).proposal?.amount).toBe(1243);
});
