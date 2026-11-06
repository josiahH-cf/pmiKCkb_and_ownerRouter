import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RENEWAL_PRICING_COLLECTIONS,
  RenewalPricingPolicyStore,
  type PricingSourceVerifier,
} from "@/lib/firestore/renewal-pricing-policies";
import {
  listRenewalWorkingActivity,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import type { RenewalPricingPolicyInput } from "@/lib/lease-renewal/renewal-pricing-policy";
import type { StandingAgreementInput } from "@/lib/lease-renewal/standing-agreement";
import { housingAssistanceFact } from "@/lib/lease-renewal/working-record";

// S250 / S251 at the backend: standing agreements set once per owner portfolio and chosen on the
// lease, and the Housing assistance fact on the lease-bound working record. Synthetic values only.

const projectId = "pmi-kc-kb-s250-s251-variant-stores";
const admin: AuthenticatedUser = {
  uid: "variant-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = {
  uid: "variant-editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const PORTFOLIO = "55";
// Two leases of one owner portfolio with different cycle dates (AC-S250-1).
const LEASES: Record<string, { cycleDate: string; currentRent: number }> = {
  "115": { cycleDate: "2026-12-31", currentRent: 1700 },
  "116": { cycleDate: "2027-03-31", currentRent: 1500 },
};
const verify: PricingSourceVerifier = {
  lease: async (leaseId) => {
    const lease = LEASES[leaseId];
    if (!lease) throw new Error("No actual lease");
    return {
      leaseId,
      portfolioId: PORTFOLIO,
      currentRent: lease.currentRent,
      cycleDate: lease.cycleDate,
      rentSource: "Synthetic authoritative source",
    };
  },
  portfolio: async (id) => id === PORTFOLIO || id === "56",
  portfolioOwners: async () => ["Sample Owner"],
};
const rule = (): RenewalPricingPolicyInput => ({
  id: randomUUID(),
  name: "Sample three percent rule",
  kind: "percentage",
  value: 3,
  effectiveFrom: "2026-10-01",
  effectiveThrough: null,
  enabled: true,
  purpose: "Synthetic rule",
});
const standing = (policyId: string, portfolioId = PORTFOLIO): StandingAgreementInput => ({
  id: randomUUID(),
  name: "Example Standing Agreement",
  policyId,
  portfolioId,
  preApprovalStatement: "The owner pre-approves renewals at the recorded rule.",
  effectiveFrom: "2026-10-01",
  endsOn: null,
  agreedBy: "Sample Owner",
  agreedHow: "Written instruction to the office",
  agreedWhen: "October 1, 2026",
  revoked: false,
});

let env: RulesTestEnvironment, app: App, db: Firestore, store: RenewalPricingPolicyStore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s250-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await env.clearFirestore();
  store = new RenewalPricingPolicyStore(db, () => "2026-11-06T15:00:00Z");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await env.cleanup();
});

async function seedAgreement() {
  const policy = await store.savePolicy(admin, rule(), 0, randomUUID());
  const agreement = await store.saveStandingAgreement(
    admin,
    standing(policy.id),
    0,
    randomUUID(),
    verify,
  );
  return { policy, agreement };
}
const resolve = async (leaseId: string, workingRent: number | null = null) =>
  (await store.resolve(admin, await verify.lease(leaseId), null, workingRent)).authority;

describe("S250 standing agreements: set once for the portfolio, chosen on the lease", () => {
  it("AC-S250-3: only an Admin records an agreement; an Editor applies it at either scope", async () => {
    const policy = await store.savePolicy(admin, rule(), 0, randomUUID());
    await expect(
      store.saveStandingAgreement(editor, standing(policy.id), 0, randomUUID(), verify),
    ).rejects.toThrow();
    await expect(store.savePolicy(editor, rule(), 0, randomUUID())).rejects.toThrow();
    const agreement = await store.saveStandingAgreement(
      admin,
      standing(policy.id),
      0,
      randomUUID(),
      verify,
    );
    const applied = await store.applyPricingBasis(
      editor,
      {
        scope: "portfolio",
        sourceId: PORTFOLIO,
        choice: { kind: "agreement", agreementId: agreement.id },
        expectedVersion: 0,
        operationId: randomUUID(),
      },
      verify,
    );
    expect(applied.standing).toEqual({ kind: "agreement", agreementId: agreement.id });
    // L70: the application carries the agreement and its rule only; no rent or other value.
    expect(applied.policyId ?? null).toBeNull();
    // One audit entry per save, in the existing activity collection.
    const audit = await db.collection(RENEWAL_PRICING_COLLECTIONS.activity).get();
    expect(audit.size).toBeGreaterThanOrEqual(3);
  });

  it("AC-S250-1: two leases of the portfolio across two cycle dates are covered with no per-cycle record", async () => {
    const { agreement } = await seedAgreement();
    await store.applyPricingBasis(
      editor,
      {
        scope: "portfolio",
        sourceId: PORTFOLIO,
        choice: { kind: "agreement", agreementId: agreement.id },
        expectedVersion: 0,
        operationId: randomUUID(),
      },
      verify,
    );
    const first = await resolve("115");
    const second = await resolve("116");
    expect(first).toMatchObject({ covered: true, kind: "standing", amount: 1751 });
    expect(second).toMatchObject({ covered: true, kind: "standing", amount: 1545 });
    expect((await db.collection(RENEWAL_PRICING_COLLECTIONS.agreements).get()).size).toBe(
      0,
    );
    // R-S250-5: a typed different rent leaves the agreement, with the reason in words.
    const typed = await resolve("115", 1800);
    expect(typed.covered).toBe(false);
    expect(typed.reason).toContain("$1,800.00");
  });

  it("BEH-S250-2: a lease's own choice wins, and removing it reveals the portfolio default", async () => {
    const { agreement } = await seedAgreement();
    await store.applyPricingBasis(
      editor,
      {
        scope: "portfolio",
        sourceId: PORTFOLIO,
        choice: { kind: "agreement", agreementId: agreement.id },
        expectedVersion: 0,
        operationId: randomUUID(),
      },
      verify,
    );
    const own = await store.applyPricingBasis(
      editor,
      {
        scope: "lease",
        sourceId: "115",
        choice: { kind: "owner_decides" },
        expectedVersion: 0,
        operationId: randomUUID(),
      },
      verify,
    );
    expect((await resolve("115")).covered).toBe(false);
    expect((await resolve("116")).covered).toBe(true);
    await store.applyPricingBasis(
      editor,
      {
        scope: "lease",
        sourceId: "115",
        choice: { kind: "clear" },
        expectedVersion: own.version,
        operationId: randomUUID(),
      },
      verify,
    );
    expect((await resolve("115")).covered).toBe(true);
  });

  it("refuses an agreement of another portfolio and keeps every earlier version", async () => {
    const policy = await store.savePolicy(admin, rule(), 0, randomUUID());
    const other = await store.saveStandingAgreement(
      admin,
      standing(policy.id, "56"),
      0,
      randomUUID(),
      verify,
    );
    await expect(
      store.applyPricingBasis(
        editor,
        {
          scope: "lease",
          sourceId: "115",
          choice: { kind: "agreement", agreementId: other.id },
          expectedVersion: 0,
          operationId: randomUUID(),
        },
        verify,
      ),
    ).rejects.toThrow();
    const { version, recordedAt, recordedByUid, ...input } = other;
    void recordedAt;
    void recordedByUid;
    const second = await store.saveStandingAgreement(
      admin,
      { ...input, name: "Example Standing Agreement, renamed" },
      version,
      randomUUID(),
      verify,
    );
    expect(second.version).toBe(2);
    const history = await store.standingAgreementHistory(admin, other.id);
    expect(history.map((entry) => entry.version).sort()).toEqual([1, 2]);
    // The portfolio is fixed once recorded; it is never inferred from a name.
    await expect(
      store.saveStandingAgreement(
        admin,
        { ...input, portfolioId: PORTFOLIO },
        2,
        randomUUID(),
        verify,
      ),
    ).rejects.toThrow();
  });
});

describe("S251 Housing assistance: one fact on the lease-bound working record, with history", () => {
  it("saves Yes with the program, keeps who and when, and reads back as the lease's fact", async () => {
    const yes = {
      status: "yes" as const,
      program: "Example Housing Assistance Office",
    };
    const saved = await saveRenewalWorkingField(
      editor,
      {
        leaseId: "9103",
        field: "housing_assistance",
        value: yes,
        expectedRevision: 0,
        operationId: randomUUID(),
      },
      db,
    );
    expect(housingAssistanceFact(saved.record)).toEqual(yes);
    expect(saved.record.fields.housing_assistance).toMatchObject({
      recordedByUid: editor.uid,
      origin: "staff_entry",
    });
    const changed = await saveRenewalWorkingField(
      editor,
      {
        leaseId: "9103",
        field: "housing_assistance",
        value: { status: "no" },
        expectedRevision: saved.record.revision,
        operationId: randomUUID(),
      },
      db,
    );
    expect(housingAssistanceFact(changed.record)).toEqual({ status: "no" });
    const activity = await listRenewalWorkingActivity(editor, "9103", db);
    expect(activity.map((entry) => entry.value)).toEqual(
      expect.arrayContaining([yes, { status: "no" }]),
    );
    // A Yes without the program name is refused; nothing else is written.
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "9103",
          field: "housing_assistance",
          value: { status: "yes", program: " " },
          expectedRevision: changed.record.revision,
          operationId: randomUUID(),
        },
        db,
      ),
    ).rejects.toThrow();
  });
});
