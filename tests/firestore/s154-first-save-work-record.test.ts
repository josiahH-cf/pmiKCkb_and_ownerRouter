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
  LEASE_BOUND_WORK_BASIS,
  RENEWAL_WORKSPACE_COLLECTIONS,
  RenewalWorkspaceStateSchema,
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
  listRenewalWorkspaceActivity,
  listRenewalWorkspaces,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import {
  RENEWAL_WORK_STATUS_COLLECTIONS,
  saveRenewalWorkStatus,
} from "@/lib/firestore/renewal-work-status";
import {
  STAFF_RECORD_SOURCE,
  manualRenewalSummary,
  type RenewalWorkBasis,
} from "@/lib/lease-renewal/workspace-state";

// S154 (and the S156 record rules it carries): opening a lease creates nothing; the first actual
// save establishes the work record from the lease's real basis with no cycle step; a lease with no
// source date is saved on the lease without one; prior cycles and their activity stay as recorded.
// Values are synthetic and the store is the local emulator.

const projectId = "pmi-kc-kb-s154-first-save-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const secondEditor: AuthenticatedUser = {
  uid: "editor-2",
  email: "editor2@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OP = (n: number) =>
  `5d2c9a1e-7b3f-4c6d-8e9f-0000000000${String(n).padStart(2, "0")}`;
const leaseEnd: RenewalWorkBasis = {
  kind: "lease_end",
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};
const laterLeaseEnd: RenewalWorkBasis = { ...leaseEnd, dateIso: "2027-12-31" };
const basis = (value: RenewalWorkBasis | null) => async () => value;

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s154-first-save-${process.pid}`);
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

async function countDocs(collection: string) {
  return (await db.collection(collection).get()).size;
}

function outreach(n: number, cycleId: string | null, expectedRevision: number) {
  return {
    leaseId: "801",
    cycleId,
    expectedRevision,
    operationId: OP(n),
    action: {
      kind: "activity" as const,
      activity: "owner_outreach" as const,
      outcome: "done" as const,
    },
  };
}

describe("S154 first-save work record", () => {
  it("BEH-S154-4: reading a lease with no work record creates nothing", async () => {
    expect(await getRenewalWorkspace(editor, "801", db)).toBeNull();
    expect((await listRenewalWorkspaces(editor, db)).size).toBe(0);
    expect(await listRenewalWorkspaceActivity(editor, "801", db)).toEqual([]);
    expect((await db.listCollections()).length).toBe(0);
  });

  it("BEH-S154-3/5 and BEH-S155-7: the first save establishes the record from the real lease end, with no cycle step", async () => {
    const saved = await saveRenewalWorkspace(
      editor,
      outreach(1, null, 0),
      db,
      basis(leaseEnd),
    );

    expect(saved.duplicate).toBe(false);
    expect(saved.state).toMatchObject({
      leaseId: "801",
      basis: leaseEnd,
      revision: 1,
      completion: null,
    });
    expect(saved.state?.activities.owner_outreach).toMatchObject({
      outcome: "done",
      actorUid: editor.uid,
      eventId: OP(1),
      // S156: no narrative was supplied, so the record carries the plain staff label.
      source: STAFF_RECORD_SOURCE,
    });
    // The dated head keeps the exact shape every existing reader parses.
    const head = await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.head).get();
    expect(head.size).toBe(1);
    expect(() => RenewalWorkspaceStateSchema.parse(head.docs[0].data())).not.toThrow();
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead)).toBe(0);

    const activity = await listRenewalWorkspaceActivity(editor, "801", db);
    expect(
      activity
        .map((entry) => (entry as unknown as { action: { kind: string } }).action.kind)
        .sort(),
    ).toEqual(["activity", "start_cycle"]);

    // A later save reuses the same record.
    const next = await saveRenewalWorkspace(
      secondEditor,
      {
        leaseId: "801",
        cycleId: saved.state!.cycleId,
        expectedRevision: 1,
        operationId: OP(2),
        action: { kind: "tenant_response", outcome: "awaiting_response" },
      },
      db,
      basis(laterLeaseEnd),
    );
    expect(next.state?.cycleId).toBe(saved.state?.cycleId);
    expect(next.state?.basis).toEqual(leaseEnd);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(1);
  });

  it("BEH-S154-9: with no source date, or an unreadable source, work is saved on the lease without a date", async () => {
    const noDate = await saveRenewalWorkspace(
      editor,
      outreach(1, null, 0),
      db,
      basis(null),
    );
    expect(noDate.state?.basis).toEqual(LEASE_BOUND_WORK_BASIS);
    expect(noDate.state?.basis).not.toHaveProperty("dateIso");

    const unreadable = await saveRenewalWorkspace(
      editor,
      { ...outreach(2, null, 0), leaseId: "802" },
      db,
      async () => {
        throw new Error("source unavailable");
      },
    );
    expect(unreadable.state?.basis.kind).toBe("lease_bound");

    // Neither record enters the dated collection.
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(0);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead)).toBe(2);
    expect([...(await listRenewalWorkspaces(editor, db)).keys()].sort()).toEqual([
      "801",
      "802",
    ]);

    // The same record keeps working without a date.
    const more = await saveRenewalWorkspace(
      editor,
      {
        leaseId: "801",
        cycleId: noDate.state!.cycleId,
        expectedRevision: 1,
        operationId: OP(3),
        action: { kind: "owner_response", outcome: "approved_terms" },
      },
      db,
      basis(leaseEnd),
    );
    expect(more.state?.basis.kind).toBe("lease_bound");
    expect(more.state?.ownerResponse).toMatchObject({ outcome: "approved_terms" });
    expect(more.state?.ownerResponse?.terms).toBeUndefined();
  });

  it("BEH-S154-7/AC-S154-3: new work on a completed lease whose source date moved starts a new record and leaves the old cycle and its activity as recorded", async () => {
    const first = await saveRenewalWorkspace(
      editor,
      outreach(1, null, 0),
      db,
      basis(leaseEnd),
    );
    const completed = await saveRenewalWorkspace(
      editor,
      {
        leaseId: "801",
        cycleId: first.state!.cycleId,
        expectedRevision: 1,
        operationId: OP(2),
        action: { kind: "complete" },
      },
      db,
      basis(leaseEnd),
    );
    // S156: completion is the staff record; an unfinished checklist is guidance only.
    expect(manualRenewalSummary(completed.state!).complete).toBe(true);
    const oldCycleId = completed.state!.cycleId;
    const oldCycleBefore = (
      await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(oldCycleId).get()
    ).data();
    const oldActivityBefore = await listRenewalWorkspaceActivity(editor, "801", db);

    // Same source date: the completed record is reused and stays completed.
    const sameBasis = await saveRenewalWorkspace(
      secondEditor,
      {
        leaseId: "801",
        cycleId: oldCycleId,
        expectedRevision: 2,
        operationId: OP(3),
        action: {
          kind: "activity",
          activity: "inspection",
          outcome: "waiting",
          source: "Phone call",
        },
      },
      db,
      basis(leaseEnd),
    );
    expect(sameBasis.state?.cycleId).toBe(oldCycleId);
    expect(sameBasis.state?.completion).not.toBeNull();

    const oldCycleMid = (
      await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(oldCycleId).get()
    ).data();

    // The source now reports a later lease end: this work belongs to a new record.
    const renewed = await saveRenewalWorkspace(
      secondEditor,
      outreach(4, oldCycleId, 3),
      db,
      basis(laterLeaseEnd),
    );
    expect(renewed.state?.cycleId).not.toBe(oldCycleId);
    expect(renewed.state).toMatchObject({
      basis: laterLeaseEnd,
      revision: 1,
      completion: null,
    });
    expect(Object.keys(renewed.state!.activities)).toEqual(["owner_outreach"]);

    // The earlier cycle document is untouched by the new record, and every earlier activity
    // entry keeps its original actor, time and content.
    expect(
      (
        await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(oldCycleId).get()
      ).data(),
    ).toEqual(oldCycleMid);
    expect(oldCycleMid?.completion).toEqual(oldCycleBefore?.completion);
    const activityAfter = await listRenewalWorkspaceActivity(editor, "801", db);
    for (const entry of oldActivityBefore) {
      expect(activityAfter).toContainEqual(entry);
    }
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(2);
  });

  it("BEH-S155-5/6: a stale or replayed first save never duplicates the record or its activity", async () => {
    const request = outreach(1, null, 0);
    const first = await saveRenewalWorkspace(editor, request, db, basis(leaseEnd));
    const replay = await saveRenewalWorkspace(editor, request, db, basis(leaseEnd));
    expect(replay.duplicate).toBe(true);
    expect(replay.state?.cycleId).toBe(first.state?.cycleId);

    // A second editor who still sees no record cannot establish another one.
    await expect(
      saveRenewalWorkspace(secondEditor, outreach(2, null, 0), db, basis(leaseEnd)),
    ).rejects.toMatchObject({ status: 409 });
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(2);

    // Two concurrent first saves admit exactly one.
    const results = await Promise.allSettled(
      [3, 4].map((n) =>
        saveRenewalWorkspace(
          n === 3 ? editor : secondEditor,
          { ...outreach(n, null, 0), leaseId: "803" },
          db,
          basis(leaseEnd),
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles)
          .where("leaseId", "==", "803")
          .get()
      ).size,
    ).toBe(1);
  });

  it("BEH-S154-6/AC-S154-2: saving a staff status creates no work record, with or without one", async () => {
    const status = await saveRenewalWorkStatus(
      editor,
      {
        leaseId: "801",
        status: "verifying_lease_and_rent",
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    expect(status.record.cycleId).toBeNull();
    for (const collection of [
      RENEWAL_WORKSPACE_COLLECTIONS.head,
      RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead,
      RENEWAL_WORKSPACE_COLLECTIONS.cycles,
      RENEWAL_WORKSPACE_COLLECTIONS.activity,
    ]) {
      expect(await countDocs(collection)).toBe(0);
    }
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.head)).toBe(1);
  });

  it("BEH-S154-5: a deliberate save that needs a record establishes one empty record once", async () => {
    const established = await ensureRenewalWorkRecord(editor, "801", db, basis(leaseEnd));
    expect(established).toMatchObject({ basis: leaseEnd, revision: 0, activities: {} });
    const again = await ensureRenewalWorkRecord(
      secondEditor,
      "801",
      db,
      basis(laterLeaseEnd),
    );
    expect(again.cycleId).toBe(established.cycleId);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(1);
  });

  it("BEH-S156-7: Not applicable needs no policy or reason on lease-dependent work, and stays unavailable on work every lease has", async () => {
    const saved = await saveRenewalWorkspace(
      editor,
      {
        leaseId: "801",
        cycleId: null,
        expectedRevision: 0,
        operationId: OP(1),
        action: { kind: "activity", activity: "pet", outcome: "not_applicable" },
      },
      db,
      basis(leaseEnd),
    );
    expect(saved.state?.activities.pet).toMatchObject({ outcome: "not_applicable" });
    await expect(
      saveRenewalWorkspace(
        editor,
        {
          leaseId: "801",
          cycleId: saved.state!.cycleId,
          expectedRevision: 1,
          operationId: OP(2),
          action: { kind: "activity", activity: "documents", outcome: "not_applicable" },
        },
        db,
        basis(leaseEnd),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
