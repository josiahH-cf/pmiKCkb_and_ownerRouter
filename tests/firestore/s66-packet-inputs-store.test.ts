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
  CHARGE_POLICY_COLLECTIONS,
  publishChargePolicy,
  readChargePolicy,
} from "@/lib/firestore/lease-charge-policy";
import {
  ARTIFACT_CATALOG_COLLECTION,
  FAMILY_USE_COLLECTION,
} from "@/lib/firestore/lease-artifact-intake";
import {
  readFamilyUseRecord,
  setFamilyUse,
} from "@/lib/firestore/lease-artifact-family-use";
import {
  PACKET_INPUT_COLLECTIONS,
  getPacketInputs,
  savePacketInputs,
} from "@/lib/firestore/lease-packet-inputs";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";
import {
  getRenewalWorkspace,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import {
  currentOwnerApproval,
  packetEconomics,
} from "@/lib/lease-documents/owner-approval-binding";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";

// S66: the packet inputs, charge policy and family-use stores, and the owner-approval capture.
// Saves are idempotent by operation id, refuse stale revisions, refuse verification accounts and
// write only the app's own records. Values are synthetic.

const projectId = "pmi-kc-kb-s66-packet-inputs-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const canary: AuthenticatedUser = {
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OP = (n: number) =>
  `0f1c8f6e-6d1c-4bd3-9d7a-1000000000${String(n).padStart(2, "0")}`;
const PERSON = "20000000-0000-4000-8000-000000000001";
const ANIMAL = "30000000-0000-4000-8000-000000000001";

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s66-packet-inputs-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function collectionsWithDocs() {
  const names = (await db.listCollections()).map((collection) => collection.id);
  const withDocs: string[] = [];
  for (const name of names)
    if (!(await db.collection(name).limit(1).get()).empty) withDocs.push(name);
  return withDocs.sort();
}

const POLICY_CONTENT = {
  residentBenefitPackage: null,
  insuranceProgram: null,
  animals: {
    basis: "weight_lb" as const,
    tiers: [
      {
        tierId: "all",
        label: "Any weight",
        min: 0,
        maxExclusive: null,
        monthlyCents: 3_500,
        oneTimeCents: 0,
        refundableDepositCents: 20_000,
      },
    ],
    treatments: { pet: "tiered" as const, assistance_animal: "no_charge" as const },
    agreementFor: { pet: true, assistance_animal: true },
    juvenileWeightBasis: null,
  },
};

describe("S66 packet inputs store (AC-S66-1, AC-S66-4, AC-S66-9)", () => {
  it("persists staff inputs across reload with attribution and writes only the app's own records", async () => {
    const saved = await savePacketInputs(
      editor,
      {
        leaseId: "701",
        operationId: OP(1),
        facts: [
          { fieldKey: "property.year_built", expectedRevision: 0, value: 1965 },
          {
            fieldKey: "insurance.coverage_method",
            expectedRevision: 0,
            value: "pmi_program",
          },
        ],
        people: {
          expectedRevision: 0,
          entries: [
            {
              personId: PERSON,
              kind: "person",
              fullName: "Tenant One",
              email: "tenant1@fixture-rental.net",
              emailBasis: "staff_reviewed",
              contactRef: null,
              roles: [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }],
            },
          ],
        },
        animals: {
          expectedRevision: 0,
          entries: [
            {
              animalId: ANIMAL,
              name: "Rex",
              species: "Dog",
              breed: "Mixed",
              weight: 30,
              weightUnit: "lb",
              weightBasis: "current",
              maturity: "adult",
              fidoScore: null,
              treatment: "pet",
            },
          ],
        },
      },
      db,
    );
    expect(saved.duplicate).toBe(false);
    expect(saved.changed).toEqual([
      "fact:property.year_built",
      "fact:insurance.coverage_method",
      "people",
      "animals",
    ]);
    const reloaded = await getPacketInputs(editor, "701", db);
    expect(reloaded).toMatchObject({
      revision: 1,
      facts: {
        "property.year_built": { value: 1965, recordedByUid: "editor-1" },
        "insurance.coverage_method": {
          value: "pmi_program",
          displayValue: "PMI insurance program",
        },
      },
      people: {
        revision: 1,
        entries: [expect.objectContaining({ fullName: "Tenant One" })],
      },
      animals: { revision: 1, entries: [expect.objectContaining({ name: "Rex" })] },
    });
    expect(await collectionsWithDocs()).toEqual(
      [PACKET_INPUT_COLLECTIONS.head, PACKET_INPUT_COLLECTIONS.activity].sort(),
    );
  });

  it("returns the first result for a repeated operation, refuses a changed one, and refuses a stale revision", async () => {
    const body = {
      leaseId: "701",
      operationId: OP(2),
      facts: [
        { fieldKey: "landlord.legal_entity", expectedRevision: 0, value: "Owner A LLC" },
      ],
    };
    await savePacketInputs(editor, body, db);
    const again = await savePacketInputs(editor, body, db);
    expect(again.duplicate).toBe(true);
    expect(again.record?.revision).toBe(1);
    await expect(
      savePacketInputs(
        editor,
        { ...body, facts: [{ ...body.facts[0], value: "Owner B LLC" }] },
        db,
      ),
    ).rejects.toThrow(/This saved request changed/);
    await expect(
      savePacketInputs(
        editor,
        {
          leaseId: "701",
          operationId: OP(3),
          facts: [
            {
              fieldKey: "landlord.legal_entity",
              expectedRevision: 0,
              value: "Owner C LLC",
            },
          ],
        },
        db,
      ),
    ).rejects.toThrow(/Another operator changed Landlord legal entity/);
    expect(
      (await getPacketInputs(editor, "701", db))?.facts["landlord.legal_entity"].value,
    ).toBe("Owner A LLC");
  });

  it("refuses a verification account, writing nothing", async () => {
    const body = {
      leaseId: "701",
      operationId: OP(4),
      facts: [{ fieldKey: "property.hoa_governed", expectedRevision: 0, value: false }],
    };
    await expect(savePacketInputs(canary, body, db)).rejects.toThrow(
      /Editor access is required/,
    );
    expect(await collectionsWithDocs()).toEqual([]);
  });
});

describe("S66 charge policy and family-use stores (AC-S66-6, AC-S66-7)", () => {
  it("publishes immutable policy versions as an Admin only, refusing a stale version and replaying a duplicate", async () => {
    const input = {
      content: POLICY_CONTENT,
      effectiveFrom: "2026-10-01",
      expectedVersion: 0,
      operationId: OP(5),
    };
    await expect(publishChargePolicy(editor, input, db)).rejects.toThrow(
      /An Admin publishes the renewal charge policy/,
    );
    const first = await publishChargePolicy(admin, input, db);
    expect(first.record.version).toBe(1);
    expect((await publishChargePolicy(admin, input, db)).duplicate).toBe(true);
    await expect(
      publishChargePolicy(admin, { ...input, operationId: OP(6) }, db),
    ).rejects.toThrow(/changed since the page was loaded/);
    const second = await publishChargePolicy(
      admin,
      { ...input, expectedVersion: 1, operationId: OP(7), note: "Raised the deposit" },
      db,
    );
    expect(second.record.version).toBe(2);
    expect((await readChargePolicy(db)).record?.version).toBe(2);
    expect(
      (await db.collection(CHARGE_POLICY_COLLECTIONS.versions).get()).docs
        .map((doc) => doc.id)
        .sort(),
    ).toEqual(["v1", "v2"]);
  });

  it("records an Admin family use and rewrites only an existing catalog", async () => {
    const result = await setFamilyUse(
      admin,
      {
        kind: "brokerage_disclosure",
        use: "conditional",
        expectedVersion: 0,
        operationId: OP(8),
      },
      db,
      "2026-10-07T03:00:00.000Z",
    );
    expect(result.record.families.brokerage_disclosure?.use).toBe("conditional");
    expect((await readFamilyUseRecord(db)).record?.version).toBe(1);
    expect((await db.collection(ARTIFACT_CATALOG_COLLECTION).get()).empty).toBe(true);
    await expect(
      setFamilyUse(
        editor,
        {
          kind: "brokerage_disclosure",
          use: "mandatory",
          expectedVersion: 1,
          operationId: OP(9),
        },
        db,
      ),
    ).rejects.toThrow(/An Admin sets how each form family is used/);
    expect((await db.collection(FAMILY_USE_COLLECTION).get()).size).toBe(1);
  });
});

describe("S66 owner approval captures the exact Working terms and charges (AC-S66-8)", () => {
  it("binds the recorded approval to the current Working terms and calculated charges, and goes stale when a term changes", async () => {
    await publishChargePolicy(
      admin,
      {
        content: POLICY_CONTENT,
        effectiveFrom: "2026-10-01",
        expectedVersion: 0,
        operationId: OP(10),
      },
      db,
    );
    for (const [field, value, n] of [
      ["terms_rent", 1250, 11],
      ["terms_effective_date", "2027-01-01", 12],
      ["terms_end_date", "2027-12-31", 13],
    ] as const)
      await saveRenewalWorkingField(
        editor,
        { leaseId: "701", field, value, expectedRevision: 0, operationId: OP(n) },
        db,
      );
    // S154: the first recorded fact establishes the lease-bound work record.
    await saveRenewalWorkspace(
      editor,
      {
        leaseId: "701",
        cycleId: null,
        expectedRevision: 0,
        operationId: OP(15),
        action: {
          kind: "owner_response",
          outcome: "approved_terms",
          source: "Owner phone call",
        },
      },
      db,
    );
    const approved = (await getRenewalWorkspace(editor, "701", db))!;
    expect(approved.ownerResponse?.approvedWorkingTerms).toMatchObject({
      rent: 1250,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      fieldRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
      chargePolicyVersion: "1",
    });
    const policy = (await readChargePolicy(db)).record;
    const economics = packetEconomics("701", null, policy).hash;
    const working = await getRenewalWorkingRecord(editor, "701", db);
    expect(
      currentOwnerApproval({ workspace: approved, working, economicsHash: economics })
        .state,
    ).toBe("current");
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "terms_rent",
        value: 1300,
        expectedRevision: 1,
        operationId: OP(16),
      },
      db,
    );
    expect(
      currentOwnerApproval({
        workspace: approved,
        working: await getRenewalWorkingRecord(editor, "701", db),
        economicsHash: economics,
      }).state,
    ).toBe("terms_changed");
  });
});
