import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S250 R-S250-7 / BEH-S250-5 / AC-S250-4 on the S249 one message record: a rule change applies
// forward only. A message record saved on the agreement's rule keeps that rule's rent after the
// rule changes, reads "Built on the earlier rule" and is rebuilt only when staff choose it; a
// message never saved follows the current rule. Live lease views are deterministic fixtures and
// every value is synthetic.

vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const lease = (leaseID: number, street: string) => ({
    lease: {
      leaseID,
      leaseStatusID: "2",
      endDate: "2026-12-31",
      baseRentAmount: 1000,
      noticeDate: null,
      expectedMoveOutDate: null,
      moveOutDate: null,
      tenants: [
        {
          contactID: String(leaseID + 1000),
          name: "Sample Tenant",
          email: `tenant${leaseID}@example.invalid`,
        },
      ],
    },
    unit: { unitID: String(leaseID + 2000) },
    property: { streetName: `${street} Example Avenue` },
    portfolio: {
      portfolioID: 9701,
      owners: [{ name: "Sample Owner", email: "owner@example.invalid" }],
    },
  });
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      rows: [lease(701, "701"), lease(702, "702")],
      pages: 1,
      complete: true,
    }),
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Sample Active",
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
import {
  RenewalPricingPolicyStore,
  type PricingSourceVerifier,
} from "@/lib/firestore/renewal-pricing-policies";
import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import { ensureRenewalWorkRecord } from "@/lib/firestore/renewal-workspace";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import type { RenewalPricingPolicyInput } from "@/lib/lease-renewal/renewal-pricing-policy";

const projectId = "pmi-kc-kb-s250-message-earlier-rule";
const admin: AuthenticatedUser = {
  uid: "rule-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = {
  uid: "rule-editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const PORTFOLIO = "9701";
const verify: PricingSourceVerifier = {
  lease: async (leaseId) => ({
    leaseId,
    portfolioId: PORTFOLIO,
    currentRent: 1000,
    cycleDate: "2026-12-31",
    rentSource: "Synthetic authoritative source",
  }),
  portfolio: async (id) => id === PORTFOLIO,
  portfolioOwners: async () => ["Sample Owner"],
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s250-earlier-rule-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

async function coveredByThreePercent() {
  const store = new RenewalPricingPolicyStore(db);
  const rule: RenewalPricingPolicyInput = {
    id: randomUUID(),
    name: "Sample three percent rule",
    kind: "percentage",
    value: 3,
    effectiveFrom: "2026-10-01",
    effectiveThrough: null,
    enabled: true,
    purpose: "Synthetic rule",
  };
  const policy = await store.savePolicy(admin, rule, 0, randomUUID());
  const agreement = await store.saveStandingAgreement(
    admin,
    {
      id: randomUUID(),
      name: "Example Standing Agreement",
      policyId: policy.id,
      portfolioId: PORTFOLIO,
      preApprovalStatement: "The owner pre-approves renewals at the recorded rule.",
      effectiveFrom: "2026-10-01",
      endsOn: null,
      agreedBy: "Sample Owner",
      agreedHow: "Written instruction to the office",
      agreedWhen: "October 1, 2026",
      revoked: false,
    },
    0,
    randomUUID(),
    verify,
  );
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
  const changeRule = (value: number) =>
    store.savePolicy(admin, { ...rule, value }, 1, randomUUID());
  return { policy, agreement, changeRule };
}

async function save(
  leaseId: string,
  message: Awaited<ReturnType<typeof currentRenewalMessage>>,
  ruleBasis: unknown,
) {
  return saveMessagePreparation(
    editor,
    {
      leaseId,
      cycleId: message.workspace!.cycleId,
      channel: "owner",
      expectedRevision: message.saved?.revision ?? 0,
      operationId: randomUUID(),
      inputs: message.inputs,
      ruleBasis,
    },
    {},
    db,
  );
}

describe("S250 R-S250-7: the one message record keeps the rule it was built on", () => {
  it("a saved message reads Built on the earlier rule after the rule changes, keeps its rent, and rebuilds only when chosen", async () => {
    const { policy, agreement, changeRule } = await coveredByThreePercent();
    for (const leaseId of ["701", "702"])
      await ensureRenewalWorkRecord(editor, leaseId, db, async () => ({
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "RentVine lease end",
      }));
    const first = await currentRenewalMessage(editor, "701", "owner", db);
    expect(first.rentToRecommend).toMatchObject({ value: 1030, origin: "agreement" });
    expect(first.ruleBasis).toEqual({
      agreementId: agreement.id,
      policyId: policy.id,
      policyVersion: 1,
    });
    expect(first.earlierRule).toBeNull();
    // The message is saved as shown: its revision is built on rule v1.
    await save("701", first, first.ruleBasis);

    // The Admin changes the rule. A later proposal follows it: the message never saved does.
    await changeRule(5);
    const neverSaved = await currentRenewalMessage(editor, "702", "owner", db);
    expect(neverSaved.rentToRecommend).toMatchObject({
      value: 1050,
      origin: "agreement",
    });
    expect(neverSaved.earlierRule).toBeNull();

    // The saved one keeps the earlier rule's rent and says so, with the current rule offered.
    const kept = await currentRenewalMessage(editor, "701", "owner", db);
    expect(kept.rentToRecommend.value).toBe(1030);
    expect(kept.rentToRecommend.basis).toMatch(/^Built on the earlier rule/);
    expect(kept.earlierRule).toMatchObject({
      agreement: "Example Standing Agreement",
      earlier: "Raise the current rent by 3 percent",
      current: "Raise the current rent by 5 percent",
      currentRent: 1050,
      currentBasis: { agreementId: agreement.id, policyId: policy.id, policyVersion: 2 },
    });
    expect(
      kept.notices.some((notice) => notice.startsWith("Built on the earlier rule")),
    ).toBe(true);
    expect(kept.content.plainText).toContain("$1,030.00");
    expect(kept.content.plainText).not.toContain("$1,050.00");

    // An edit saved as shown carries the rule it was built on: nothing rebuilds by itself.
    await save("701", kept, kept.ruleBasis);
    const stillKept = await currentRenewalMessage(editor, "701", "owner", db);
    expect(stillKept.rentToRecommend.value).toBe(1030);
    expect(stillKept.earlierRule).not.toBeNull();

    // Rebuild with the current rule, a deliberate choice: the message follows it from then on.
    await save("701", stillKept, stillKept.earlierRule!.currentBasis);
    const rebuilt = await currentRenewalMessage(editor, "701", "owner", db);
    expect(rebuilt.rentToRecommend).toMatchObject({ value: 1050, origin: "agreement" });
    expect(rebuilt.earlierRule).toBeNull();
    expect(rebuilt.ruleBasis).toMatchObject({ policyVersion: 2 });
  });

  it("a message saved before rule stamps existed follows the current rule (nothing is invented)", async () => {
    const { changeRule } = await coveredByThreePercent();
    await ensureRenewalWorkRecord(editor, "701", db, async () => ({
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    }));
    const first = await currentRenewalMessage(editor, "701", "owner", db);
    await save("701", first, undefined);
    await changeRule(5);
    const after = await currentRenewalMessage(editor, "701", "owner", db);
    expect(after.rentToRecommend.value).toBe(1050);
    expect(after.earlierRule).toBeNull();
  });
});
