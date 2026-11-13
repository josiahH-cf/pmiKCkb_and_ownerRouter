import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION,
  MOVE_OUT_TIMING_BASIS_COLLECTION,
  readMoveOutTimingBasisSelection,
  selectMoveOutTimingBasis,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";

const projectId = "pmi-kc-kb-s125-notice-selection-test";
// Rewritten on purpose for S283 R-S283-5: only an Admin selects the shared notice timing basis.
const actor: AuthenticatedUser = {
  uid: "staff-one",
  email: "staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const input = {
  decisionId: "notice-basis/2026-10-02/q2",
  expectedVersion: 0,
  operationId: "00000000-0000-4000-8000-000000000001",
};
let app: App;
let db: Firestore;
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `s125-notice-selection-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => {
  await deleteApp(app);
  await env.cleanup();
});

describe("S125 actual emulator transactions, no provider effects", () => {
  it("recovers concurrent same-intent dispatch and restart readback as one activity and version", async () => {
    const results = await Promise.all([
      selectMoveOutTimingBasis(actor, input, db),
      selectMoveOutTimingBasis(actor, input, db),
    ]);
    expect(results[0].record).toEqual(results[1].record);
    expect(results.map((result) => result.duplicate).sort()).toEqual([false, true]);
    expect(
      (await db.collection(MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION).get()).size,
    ).toBe(1);
    const read = await readMoveOutTimingBasisSelection(actor, input.operationId, db);
    expect(read).toMatchObject({
      timingBasis: { state: "saved", record: { version: 1 } },
      intent: { state: "recorded", record: results[0].record },
    });
    await expect(
      selectMoveOutTimingBasis(actor, { ...input, expectedVersion: 1 }, db),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("refuses one of two competing operations and preserves the winning basis and immutable receipt", async () => {
    const results = await Promise.allSettled([
      selectMoveOutTimingBasis(actor, input, db),
      selectMoveOutTimingBasis(
        actor,
        { ...input, operationId: "00000000-0000-4000-8000-000000000002" },
        db,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(
      (await db.collection(MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION).get()).size,
    ).toBe(1);
    expect(
      (await db.collection(MOVE_OUT_TIMING_BASIS_COLLECTION).doc("active").get()).data()
        ?.version,
    ).toBe(1);
  });
  it("S283 R-S283-5: an Editor or Approver is refused before any write", async () => {
    for (const role of ["Editor", "Approver"] as const) {
      await expect(
        selectMoveOutTimingBasis({ ...actor, role }, input, db),
      ).rejects.toThrow("Only an Admin changes the shared notice timing basis.");
    }
    expect((await db.collection(MOVE_OUT_TIMING_BASIS_COLLECTION).get()).size).toBe(0);
    expect(
      (await db.collection(MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION).get()).size,
    ).toBe(0);
  });
});
