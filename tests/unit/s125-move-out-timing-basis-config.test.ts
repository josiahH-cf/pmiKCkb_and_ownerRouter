import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION,
  MOVE_OUT_TIMING_BASIS_COLLECTION,
  MOVE_OUT_TIMING_BASIS_DOC_ID,
  readMoveOutTimingBasisRecord,
  readMoveOutTimingBasisSnapshot,
  updateMoveOutTimingBasis,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";
import { evaluateMoveOutTiming } from "@/lib/lease-renewal/move-out-timing";
import type { MoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import { FakeFirestore } from "../helpers/fake-firestore";

// S125 (F04): the reviewed basis is app-owned configuration with a revision check, an activity
// history and a never-throwing snapshot read. Every value is synthetic; no provider is touched.

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
const editor = { ...admin, uid: "editor-1", role: "Editor" } as AuthenticatedUser;

const input = {
  targetKind: "expected_move_out" as const,
  countingRule: "calendar_days_target_minus_notice_v1" as const,
  thresholdDays: 30,
  reviewedNote: "Confirmed by the owner in the September review.",
  expectedVersion: 0,
};

const initiated: MoveOutDisposition = {
  state: "initiated",
  reason: "notice_status",
  label: "Move-out initiated in RentVine: Active - Notice Given.",
  evidence: {
    origin: "rentvine_lease_status",
    leaseId: "L-1",
    statusId: "3",
    statusName: "Active - Notice Given",
    primaryStatusId: "2",
    pendingMoveOut: true,
    completedMoveOut: false,
    noticeDateIso: "2026-08-01",
    expectedMoveOutIso: "2026-08-31",
    moveOutIso: null,
  },
  freshness: "fresh",
  observedAtIso: "2026-09-20T12:00:00.000Z",
};

describe("S125 reviewed basis storage (AC-S125-1, AC-S125-4)", () => {
  it("reads an explicit unreviewed snapshot until an Admin records the basis, then the saved version", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    expect(await readMoveOutTimingBasisSnapshot(db)).toEqual({
      state: "missing",
      basis: null,
      version: null,
      updatedAtIso: null,
    });
    expect(await readMoveOutTimingBasisRecord(admin, db)).toEqual({
      state: "missing",
      record: null,
    });
    // Under the unreviewed snapshot the evaluator has no yes or no.
    expect(
      evaluateMoveOutTiming({
        disposition: initiated,
        leaseEndIso: null,
        basis: await readMoveOutTimingBasisSnapshot(db),
        observedDateIso: "2026-09-20",
      }),
    ).toMatchObject({ state: "cannot_determine", reason: "basis_not_reviewed" });

    const first = await updateMoveOutTimingBasis(
      admin,
      input,
      db,
      "2026-09-19T00:00:00.000Z",
    );
    expect(first).toMatchObject({
      id: MOVE_OUT_TIMING_BASIS_DOC_ID,
      target_kind: "expected_move_out",
      counting_rule: "calendar_days_target_minus_notice_v1",
      threshold_days: 30,
      version: 1,
      created_at: "2026-09-19T00:00:00.000Z",
      updated_at: "2026-09-19T00:00:00.000Z",
      updated_by_uid: "admin-1",
    });
    const snapshot = await readMoveOutTimingBasisSnapshot(db);
    expect(snapshot).toMatchObject({
      state: "saved",
      basis: { targetKind: "expected_move_out", thresholdDays: 30 },
      version: 1,
    });
    expect(
      evaluateMoveOutTiming({
        disposition: initiated,
        leaseEndIso: null,
        basis: snapshot,
        observedDateIso: "2026-09-20",
      }),
    ).toMatchObject({ state: "meets", daysGiven: 30, basisVersion: 1 });
    expect(fake.store.has(`${MOVE_OUT_TIMING_BASIS_COLLECTION}/active`)).toBe(true);
  });

  it("keeps every recorded version in the activity history and refuses a stale revision", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    await updateMoveOutTimingBasis(admin, input, db, "2026-09-19T00:00:00.000Z");
    const second = await updateMoveOutTimingBasis(
      admin,
      { ...input, targetKind: "lease_end", expectedVersion: 1 },
      db,
      "2026-09-20T00:00:00.000Z",
    );
    expect(second).toMatchObject({
      version: 2,
      target_kind: "lease_end",
      created_at: "2026-09-19T00:00:00.000Z",
      updated_at: "2026-09-20T00:00:00.000Z",
    });
    const history = [...fake.store.entries()]
      .filter(([path]) =>
        path.startsWith(`${MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION}/`),
      )
      .map(([, value]) => value)
      .sort((a, b) => Number(a.version) - Number(b.version));
    expect(history.map((entry) => [entry.version, entry.target_kind])).toEqual([
      [1, "expected_move_out"],
      [2, "lease_end"],
    ]);
    // An old result names version 1 and the old basis; the history still carries it verbatim.
    expect(history[0]).toMatchObject({
      action: "move_out_timing_basis_recorded",
      actor_uid: "admin-1",
      threshold_days: 30,
    });

    // A save built on a version that is no longer current is refused, so nothing is overwritten.
    await expect(
      updateMoveOutTimingBasis(admin, { ...input, expectedVersion: 1 }, db),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readMoveOutTimingBasisSnapshot(db)).version).toBe(2);
  });

  it("is Admin-only and validates the input before writing", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    await expect(updateMoveOutTimingBasis(editor, input, db)).rejects.toBeInstanceOf(
      EditableLayerError,
    );
    await expect(readMoveOutTimingBasisRecord(editor, db)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      updateMoveOutTimingBasis(admin, { ...input, thresholdDays: 0 }, db),
    ).rejects.toThrow();
    await expect(
      updateMoveOutTimingBasis(admin, { ...input, reviewedNote: "   " }, db),
    ).rejects.toThrow();
    expect(fake.store.size).toBe(0);
    // A non-Admin desk read still gets the never-throwing snapshot.
    expect((await readMoveOutTimingBasisSnapshot(db)).state).toBe("missing");
  });

  it("reads a malformed saved document as invalid, never as a basis", async () => {
    const fake = new FakeFirestore();
    fake.seed(`${MOVE_OUT_TIMING_BASIS_COLLECTION}/${MOVE_OUT_TIMING_BASIS_DOC_ID}`, {
      target_kind: "next_tuesday",
      version: 3,
    });
    const db = fake as unknown as Firestore;
    expect((await readMoveOutTimingBasisSnapshot(db)).state).toBe("invalid");
    expect(await readMoveOutTimingBasisRecord(admin, db)).toEqual({
      state: "invalid",
      record: null,
    });
  });
});
