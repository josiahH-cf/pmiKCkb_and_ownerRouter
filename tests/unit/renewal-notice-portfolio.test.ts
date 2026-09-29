import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";
import { renewalNoticeObserver } from "@/lib/lease-renewal/notice-read";
import {
  observeRenewalNotice,
  observeRenewalNotices,
  noticeSafetyMarkerRef,
} from "@/lib/firestore/renewal-notice-safety";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import { noticeScopeHash, pendingNoticeHash } from "@/lib/lease-renewal/notice-safety";
import {
  leaseViewsFromExport,
  applyLeaseDetailToView,
} from "@/lib/integrations/rentvine/lease-mapper";
import type { LeaseStatusTableRead } from "@/lib/lease-renewal/move-out-disposition";
import type { LiveLeaseSnapshotResult } from "@/lib/lease-renewal/live-lease-cache";

const actor = {
  uid: "synthetic-reader",
  email: "synthetic-reader@pmikcmetro.com",
  role: "Editor",
  hd: "pmikcmetro.com",
} as AuthenticatedUser;
const at = Date.parse("2026-09-29T12:00:00Z");
function fixture(count: number) {
  const fake = new FakeTransactionalFirestore(),
    db = fake as unknown as Firestore;
  const ids = Array.from({ length: count }, (_, i) => String(9000 + i));
  const keys = ids.map(renewalWorkspaceDocId);
  const views = leaseViewsFromExport(
    ids.map((leaseID) => ({
      lease: { leaseID, leaseStatusID: "2", tenants: [{ contactID: "9101" }] },
      unit: { unitID: "9201" },
    })),
  );
  views.forEach((lease) =>
    applyLeaseDetailToView(lease, {
      leaseStatusID: "2",
      noticeDate: null,
      expectedMoveOutDate: null,
      moveOutDate: null,
      isMonthToMonth: "0",
    }),
  );
  ids.forEach((id) => {
    const scopeHash = noticeScopeHash(id, null, null),
      sourceReadAt = { lease: 0, status: 0 };
    fake.seed(noticeSafetyMarkerRef(db, id).path, {
      scopeHash,
      sourceReadAt,
      semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
      version: 1,
      observedAt: new Date(at).toISOString(),
    });
  });
  const statuses: LeaseStatusTableRead = {
    status: "available",
    statuses: [
      {
        leaseStatusID: "2",
        name: "Synthetic active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ],
    readAtMs: at,
    noticeAdmitted: true,
    admittedLeaseKeys: keys,
  };
  const read: LiveLeaseSnapshotResult = {
    snapshot: {
      views,
      complete: true,
      readAtMs: at,
      noticeAdmitted: true,
      noticeAdmission: { readAtMs: at, leaseKeys: keys },
      detailComplete: true,
      detailUnavailableCount: 0,
    },
    currency: {
      state: "fresh",
      ageMs: 0,
      readAtMs: at,
      refreshing: false,
      lastError: false,
    },
  };
  return { fake, db, ids, read, statuses };
}

describe("bounded portfolio notice verification", () => {
  it("verifies all 311 leases in at most ten bounded transactions without workflow writes", async () => {
    const { fake, db, ids, read, statuses } = fixture(311);
    const transactions = vi.spyOn(fake, "runTransaction");
    const result = await renewalNoticeObserver(actor, db)(read, statuses, at);
    expect([...result.keys()]).toEqual(ids);
    expect([...result.values()].every((row) => row.state === "not_initiated")).toBe(true);
    expect(transactions.mock.calls.length).toBeLessThanOrEqual(10);
    expect(fake.store.size).toBe(311);
    expect(
      [...fake.store.keys()].every((path) => path.endsWith("/approval_safety/notice")),
    ).toBe(true);
  });

  it("has exactly the same marker and disposition results as individual lease observations", async () => {
    const a = fixture(35),
      b = fixture(35);
    const result = await renewalNoticeObserver(actor, a.db)(a.read, a.statuses, at);
    for (const [i, lease] of b.read.snapshot.views.entries()) {
      const single = await observeRenewalNotice(
        actor,
        {
          lease,
          statusTable: b.statuses,
          freshness: "fresh",
          leaseReadAtMs: at,
          observedAtMs: at,
          noticeAdmitted: true,
          admittedLeaseKeys: b.read.snapshot.noticeAdmission!.leaseKeys,
        },
        b.db,
      );
      expect(result.get(b.ids[i])).toEqual(single.disposition);
    }
    expect([...a.fake.store.entries()]).toEqual([...b.fake.store.entries()]);
  });

  it("keeps an unadmitted lease unknown while checking the other admitted leases", async () => {
    const { db, ids, read, statuses } = fixture(35);
    read.snapshot.noticeAdmission!.leaseKeys =
      read.snapshot.noticeAdmission!.leaseKeys.filter(
        (key) => key !== renewalWorkspaceDocId(ids[2]),
      );
    const result = await renewalNoticeObserver(actor, db)(read, statuses, at);
    expect(result.get(ids[2])?.state).toBe("unknown");
    expect(
      [...result.values()].filter((row) => row.state === "not_initiated"),
    ).toHaveLength(34);
  });

  it("fails closed without partial marker commits when the transaction cannot complete", async () => {
    const { fake, db, read, statuses } = fixture(32);
    const before = structuredClone([...fake.store.entries()]);
    vi.spyOn(fake, "runTransaction").mockRejectedValue(
      new Error("synthetic unavailable"),
    );
    const result = await renewalNoticeObserver(actor, db)(read, statuses, at);
    expect(result.size).toBe(32);
    expect([...result.values()].every((row) => row.state === "unknown")).toBe(true);
    expect([...fake.store.entries()]).toEqual(before);
  });

  it("refuses duplicate identities, oversized batches and unmanaged readers before a transaction", async () => {
    const { fake, db, read, statuses } = fixture(33);
    const transactions = vi.spyOn(fake, "runTransaction");
    const sources = read.snapshot.views.map((lease) => ({
      lease,
      statusTable: statuses,
      freshness: "fresh" as const,
      leaseReadAtMs: at,
      observedAtMs: at,
      noticeAdmitted: true,
      admittedLeaseKeys: read.snapshot.noticeAdmission!.leaseKeys,
    }));
    await expect(
      observeRenewalNotices(actor, [sources[0], sources[0]], db),
    ).rejects.toThrow("ambiguous");
    await expect(observeRenewalNotices(actor, sources, db)).rejects.toThrow("too large");
    await expect(
      observeRenewalNotices(
        { ...actor, email: "synthetic@example.test" },
        [sources[0]],
        db,
      ),
    ).rejects.toThrow("Managed");
    expect(transactions).not.toHaveBeenCalled();
  });
});
