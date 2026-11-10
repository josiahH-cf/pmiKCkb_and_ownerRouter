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
import type { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  RENEWAL_WORKING_RECORD_COLLECTIONS,
  getRenewalWorkingRecord,
  listRenewalWorkingActivity,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import {
  getRenewalWorkspace,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import {
  PROGRAM_SOURCE_CAPABILITY,
  evaluateProgramSourceReadiness,
  housingAssistanceWork,
} from "@/lib/lease-renewal/housing-assistance-source";
import {
  housingAssistanceFact,
  type HousingAssistanceValue,
} from "@/lib/lease-renewal/working-record";
import {
  ASSISTED,
  NOW,
  POLICY,
  VERIFIED,
  MAPPING,
} from "@/tests/fixtures/s266-program-source";

// S266 AC-S266-1 / AC-S266-3 on the emulator: Not set, an explicit No and program Yes stay
// distinct on the one lease-bound working-record field, a concurrent save and a revoked scope are
// refused without changing the saved fact, the exact renewal cycle is untouched, and the program
// source contract writes nothing. Synthetic values only.

const projectId = "pmi-kc-kb-s266-housing-assistance";
const editor: AuthenticatedUser = {
  uid: "s266-editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const colleague: AuthenticatedUser = { ...editor, uid: "s266-colleague" };
// A verification identity keeps its displayed role, but its write scope is revoked.
const revoked: AuthenticatedUser = {
  ...editor,
  uid: "s266-canary",
  email: "canary-editor@pmikcmetro.com",
};
const LEASE = "9266";
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};

let env: RulesTestEnvironment, app: App, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s266-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await env.cleanup();
});

async function save(
  actor: AuthenticatedUser,
  value: HousingAssistanceValue | null,
  expectedRevision: number,
) {
  return saveRenewalWorkingField(
    actor,
    {
      leaseId: LEASE,
      field: "housing_assistance",
      value,
      expectedRevision,
      operationId: randomUUID(),
    },
    db,
  );
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as EditableLayerError;
  }
  throw new Error("Expected a refusal.");
}

async function collectionsWithDocuments() {
  const names: string[] = [];
  for (const collection of await db.listCollections())
    if (!(await collection.limit(1).get()).empty) names.push(collection.id);
  return names.sort();
}

describe("S266 Housing assistance on the lease-bound working record", () => {
  it("AC-S266-1: keeps Not set, No and program Yes distinct and reads back the exact fact", async () => {
    expect(await getRenewalWorkingRecord(editor, LEASE, db)).toBeNull();
    expect(housingAssistanceWork({ fact: null })).toMatchObject({
      state: "not_set",
      active: false,
    });
    const no = await save(editor, { status: "no" }, 0);
    expect(housingAssistanceFact(no.record)).toEqual({ status: "no" });
    const yes = await save(
      editor,
      ASSISTED,
      no.record.fields.housing_assistance!.revision,
    );
    expect(housingAssistanceFact(yes.record)).toEqual(ASSISTED);
    const cleared = await save(
      editor,
      null,
      yes.record.fields.housing_assistance!.revision,
    );
    // Cleared reads as Not set again, never as an explicit No.
    expect(housingAssistanceFact(cleared.record)).toBeNull();
    expect(
      housingAssistanceWork({ fact: housingAssistanceFact(cleared.record) }),
    ).toEqual({
      state: "not_set",
      active: false,
      reason: null,
      answer: null,
    });
    const history = await listRenewalWorkingActivity(editor, LEASE, db);
    expect(history.map((entry) => entry.value)).toEqual(
      expect.arrayContaining([{ status: "no" }, ASSISTED, null]),
    );
  });

  it("AC-S266-1: refuses a concurrent save and a revoked scope without changing the saved fact", async () => {
    const first = await save(editor, { status: "no" }, 0);
    const revision = first.record.fields.housing_assistance!.revision;
    const results = await Promise.allSettled([
      save(editor, ASSISTED, revision),
      save(colleague, { status: "yes", program: "Another Example Program" }, revision),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as EditableLayerError).status).toBe(409);
    const winner = (
      fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof save>>>
    ).value;
    const current = await getRenewalWorkingRecord(editor, LEASE, db);
    expect(housingAssistanceFact(current)).toEqual(housingAssistanceFact(winner.record));

    const before = JSON.stringify(current);
    const denied = await refusal(
      save(revoked, { status: "no" }, winner.record.fields.housing_assistance!.revision),
    );
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await getRenewalWorkingRecord(editor, LEASE, db))).toBe(before);
  });

  it("AC-S266-1: leaves the exact renewal cycle untouched and writes only the working record", async () => {
    await startRenewalCycle(
      editor,
      {
        leaseId: LEASE,
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: randomUUID(),
        basis,
        reason: "Synthetic renewal cycle.",
      },
      basis,
      db,
    );
    const cycleBefore = await getRenewalWorkspace(editor, LEASE, db);
    const collectionsBefore = await collectionsWithDocuments();
    await save(editor, ASSISTED, 0);
    const cycleAfter = await getRenewalWorkspace(editor, LEASE, db);
    expect(cycleAfter).toEqual(cycleBefore);
    const added = (await collectionsWithDocuments()).filter(
      (name) => !collectionsBefore.includes(name),
    );
    expect(added.sort()).toEqual(
      [
        RENEWAL_WORKING_RECORD_COLLECTIONS.activity,
        RENEWAL_WORKING_RECORD_COLLECTIONS.head,
      ].sort(),
    );
  });

  it("AC-S266-3: qualifying a program source reads and writes nothing and keeps the staff fact", async () => {
    const saved = await save(editor, ASSISTED, 0);
    const collectionsBefore = await collectionsWithDocuments();
    const fact = housingAssistanceFact(saved.record);
    for (const capability of [
      PROGRAM_SOURCE_CAPABILITY,
      { read: "approved" as const, suggestions: "authorized" as const },
    ])
      evaluateProgramSourceReadiness({
        capability,
        fact,
        mappings: [MAPPING],
        candidates: [VERIFIED],
        policy: POLICY,
        nowIso: NOW,
      });
    expect(await collectionsWithDocuments()).toEqual(collectionsBefore);
    expect(
      housingAssistanceFact(await getRenewalWorkingRecord(editor, LEASE, db)),
    ).toEqual(ASSISTED);
  });
});
