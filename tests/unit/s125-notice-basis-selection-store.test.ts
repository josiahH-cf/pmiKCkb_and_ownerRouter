import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION,
  MOVE_OUT_TIMING_BASIS_COLLECTION,
  readMoveOutTimingBasisSelection,
  selectMoveOutTimingBasis,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";

// S283 R-S283-5: the shared basis has one writer, an Admin on the Admin entry. The selecting actor
// here is therefore an Admin (rewritten on purpose); version conflict, audit, receipt and readback
// are unchanged. `staffEditor` proves an Editor reads it and cannot select it.
const editor: AuthenticatedUser = {
  uid: "staff-one",
  email: "staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const staffEditor: AuthenticatedUser = {
  uid: "staff-editor",
  email: "staff-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const choice = {
  decisionId: "notice-basis/2026-10-02/q2",
  expectedVersion: 0,
  operationId: "00000000-0000-4000-8000-000000000001",
};
const database = () => {
  const fake = new FakeTransactionalFirestore();
  return { fake, db: fake as unknown as Firestore };
};
const activities = (fake: FakeTransactionalFirestore) =>
  fake.collectionEntries(MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION);

describe("S125 documented notice-basis selection (AC-S125-7/8/9/10)", () => {
  it("lets ordinary renewal staff select the settled tuple with real source attribution, then independently reads their intent", async () => {
    const { fake, db } = database();
    const result = await selectMoveOutTimingBasis(
      editor,
      choice,
      db,
      "2026-11-03T12:00:00.000Z",
    );
    expect(result.record).toMatchObject({
      target_kind: "lease_end",
      counting_rule: "calendar_days_target_minus_notice_v1",
      threshold_days: 30,
      version: 1,
      updated_by_uid: editor.uid,
      decision_id: choice.decisionId,
      operation_id: choice.operationId,
      reviewed_note: expect.stringContaining("October 2"),
    });
    expect(result.record.reviewed_note).not.toContain(editor.email);
    expect(activities(fake)).toHaveLength(1);
    const read = await readMoveOutTimingBasisSelection(editor, choice.operationId, db);
    expect(read).toMatchObject({
      timingBasis: { state: "saved", record: result.record },
      intent: {
        state: "recorded",
        record: result.record,
        operationId: choice.operationId,
      },
      canSelect: true,
    });
  });

  it("recovers response loss/restart through the same owned UUID without another version/activity, and rejects altered or foreign reuse", async () => {
    const { fake, db } = database();
    const original = await selectMoveOutTimingBasis(
      editor,
      choice,
      db,
      "2026-11-03T12:00:00.000Z",
    );
    const replay = await selectMoveOutTimingBasis(
      editor,
      { ...choice },
      db,
      "2026-11-04T12:00:00.000Z",
    );
    expect(replay.record).toEqual(original.record);
    expect(replay.duplicate).toBe(true);
    expect(activities(fake)).toHaveLength(1);
    await expect(
      selectMoveOutTimingBasis(
        editor,
        {
          ...choice,
          expectedVersion: 1,
          operationId: "00000000-0000-4000-8000-000000000003",
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(activities(fake)).toHaveLength(1);
    await expect(
      selectMoveOutTimingBasis(editor, { ...choice, expectedVersion: 1 }, db),
    ).rejects.toMatchObject({ status: 409 });
    const other = { ...editor, uid: "staff-two", email: "staff-two@pmikcmetro.com" };
    await expect(selectMoveOutTimingBasis(other, choice, db)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await readMoveOutTimingBasisSelection(other, choice.operationId, db)).intent,
    ).toEqual({ state: "missing" });
    expect(activities(fake)).toHaveLength(1);
  });

  it("reads legacy attribution without migrating it, and a new selection preserves earlier history", async () => {
    const { fake, db } = database();
    const legacy = {
      id: "active",
      target_kind: "expected_move_out",
      counting_rule: "calendar_days_target_minus_notice_v1",
      threshold_days: 30,
      reviewed_note: "Historical reviewed source",
      version: 2,
      created_at: "2026-09-19T00:00:00Z",
      updated_at: "2026-09-20T00:00:00Z",
      updated_by_uid: "earlier-staff",
    };
    fake.seed(`${MOVE_OUT_TIMING_BASIS_COLLECTION}/active`, legacy);
    const historyPath = `${MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION}/earlier-version`;
    fake.seed(historyPath, {
      actor_uid: "earlier-staff",
      reviewed_note: legacy.reviewed_note,
      version: 2,
    });
    const before = structuredClone(fake.read(historyPath));
    expect(
      (await readMoveOutTimingBasisSelection(editor, undefined, db)).timingBasis,
    ).toEqual({ state: "saved", record: legacy });
    expect(fake.store.size).toBe(2);
    const selected = await selectMoveOutTimingBasis(
      editor,
      { ...choice, expectedVersion: 2 },
      db,
    );
    expect(selected.record).toMatchObject({
      version: 3,
      target_kind: "lease_end",
      updated_by_uid: editor.uid,
      created_at: legacy.created_at,
    });
    expect(fake.read(historyPath)).toEqual(before);
  });

  it("refuses competing expected versions transactionally, preserving the winner and its immutable history", async () => {
    const { fake, db } = database();
    fake.armNextCommitBarrier(2);
    const results = await Promise.allSettled([
      selectMoveOutTimingBasis(editor, choice, db),
      selectMoveOutTimingBasis(
        editor,
        { ...choice, operationId: "00000000-0000-4000-8000-000000000002" },
        db,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(activities(fake)).toHaveLength(1);
    expect(fake.read(`${MOVE_OUT_TIMING_BASIS_COLLECTION}/active`)).toMatchObject({
      version: 1,
    });
  });

  it("refuses forged choices, payloads and unauthorized identities before writes; verification accounts can still read", async () => {
    const { fake, db } = database();
    for (const actor of [
      { ...editor, hd: "example.com" },
      { ...editor, email: "staff@example.com" },
      { ...editor, uid: "" },
      { ...editor, role: "Viewer" } as unknown as AuthenticatedUser,
      { ...editor, email: "canary-editor@pmikcmetro.com" },
    ]) {
      await expect(selectMoveOutTimingBasis(actor, choice, db)).rejects.toMatchObject({
        status: 403,
      });
    }
    for (const input of [
      { ...choice, decisionId: "unapproved" },
      { ...choice, thresholdDays: 31 },
      { ...choice, targetKind: "expected_move_out" },
      { ...choice, reviewedNote: "invented approval" },
      { ...choice, actorUid: "somebody-else" },
      { ...choice, operationId: "not-a-uuid" },
    ]) {
      await expect(selectMoveOutTimingBasis(editor, input, db)).rejects.toThrow();
    }
    expect(fake.store.size).toBe(0);
    expect(
      await readMoveOutTimingBasisSelection(
        { ...editor, email: "canary-editor@pmikcmetro.com" },
        undefined,
        db,
      ),
    ).toMatchObject({ canSelect: false, timingBasis: { state: "missing" } });
  });

  it("AC-S283-5 an Editor and an Approver read the basis and are refused before any write", async () => {
    const { fake, db } = database();
    for (const actor of [staffEditor, { ...staffEditor, role: "Approver" as const }]) {
      await expect(selectMoveOutTimingBasis(actor, choice, db)).rejects.toMatchObject({
        status: 403,
      });
      expect(await readMoveOutTimingBasisSelection(actor, undefined, db)).toMatchObject({
        canSelect: false,
        timingBasis: { state: "missing" },
      });
    }
    expect(fake.store.size).toBe(0);
    expect(activities(fake)).toHaveLength(0);
  });
});
