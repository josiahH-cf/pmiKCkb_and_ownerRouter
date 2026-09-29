import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";

const actor: AuthenticatedUser = {
  uid: "synthetic-runtime-reader",
  email: "synthetic-runtime-reader@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
async function runtime() {
  vi.resetModules();
  return {
    helper: await import("@/lib/lease-renewal/admitted-notice-source"),
    safety: await import("@/lib/firestore/renewal-notice-safety"),
    cache: await import("@/lib/lease-renewal/live-lease-cache"),
    status: await import("@/lib/lease-renewal/lease-status-table"),
    observer: await import("@/lib/lease-renewal/notice-read"),
  };
}
function reader() {
  return {
    listAllLeasesExport: vi.fn(async () => ({
      rows: [
        {
          lease: {
            leaseID: "9001",
            leaseStatusID: "2",
            tenants: [{ contactID: "9101" }],
          },
          unit: { unitID: "9201" },
        },
      ],
      complete: true,
      pages: 1,
    })),
    getLease: vi.fn(async () => ({
      leaseStatusID: "2",
      noticeDate: null,
      expectedMoveOutDate: null,
      moveOutDate: null,
      isMonthToMonth: "0",
    })),
    listLeaseStatuses: vi.fn(async () => [
      {
        leaseStatusID: "2",
        name: "Synthetic active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ]),
  };
}
type AdmittedRead = Awaited<
  ReturnType<
    typeof import("@/lib/lease-renewal/admitted-notice-source").readAdmittedRenewalNoticeLease
  >
>;
function source(read: AdmittedRead) {
  return {
    lease: read.snapshot.views[0],
    statusTable: read.statusTable,
    freshness: read.currency.state,
    leaseReadAtMs: read.snapshot.readAtMs,
    observedAtMs: Date.now(),
    noticeAdmitted: read.snapshot.noticeAdmitted,
    admittedLeaseKeys: read.snapshot.noticeAdmission?.leaseKeys,
  };
}
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.useRealTimers());

describe("notice source coherence across independent runtime caches", () => {
  it("counts a cold display acquisition as initial and refuses before a third lease export", async () => {
    const a = await runtime(),
      b = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
    const other = b.safety.withRenewalNoticeAdmission(actor, provider, db);
    const queryPrototype = Object.getPrototypeOf(fake.collectionGroup("approval_safety"));
    const originalQuery = queryPrototype.get;
    let queries = 0;
    vi.spyOn(queryPrototype, "get").mockImplementation(async function (this: object) {
      if (++queries === 1) await other.beforeLeaseSourceRead(Date.now());
      return originalQuery.call(this);
    });
    const original = provider.listAllLeasesExport.getMockImplementation()!;
    let exports = 0;
    provider.listAllLeasesExport.mockImplementation(async () => {
      if (++exports > 1) await other.beforeLeaseSourceRead(Date.now());
      return original();
    });
    const refused = await a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      Date.now(),
      {},
      db,
    );
    expect(refused.statusTable).toEqual({ status: "unavailable" });
    expect(refused.snapshot.views).toHaveLength(1);
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(queries).toBe(2);
  });

  it("refuses foreign notice markers before any cold admission write or provider dispatch", async () => {
    const a = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
    const marker = fake.read([...fake.store.keys()][0])!;
    fake.seed("unrelated/synthetic/approval_safety/notice", marker);
    const before = structuredClone([...fake.store.entries()]);
    await expect(
      a.helper.readCoherentRenewalDisplaySource(actor, provider, Date.now(), {}, db),
    ).rejects.toThrow("reservation metadata is invalid");
    expect([...fake.store.entries()]).toEqual(before);
    expect(provider.listAllLeasesExport).not.toHaveBeenCalled();
    expect(provider.listLeaseStatuses).not.toHaveBeenCalled();
  });

  it("bounds a repeatedly advancing bulk read to one replacement after its acquired snapshot", async () => {
    const a = await runtime(),
      b = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
    const initial = await a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      Date.now(),
      {},
      db,
    );
    const other = b.safety.withRenewalNoticeAdmission(actor, provider, db);
    await other.beforeLeaseSourceRead(Date.now());
    const original = provider.listAllLeasesExport.getMockImplementation()!;
    provider.listAllLeasesExport.mockImplementation(async () => {
      await other.beforeLeaseSourceRead(Date.now());
      return original();
    });
    const queries = vi.spyOn(
      Object.getPrototypeOf(fake.collectionGroup("approval_safety")),
      "get",
    );
    const refused = await a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      Date.now(),
      {},
      db,
    );
    expect(queries).toHaveBeenCalledTimes(2);
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(1);
    expect(refused.snapshot).toBe(initial.snapshot);
    expect(refused.statusTable).toEqual({ status: "unavailable" });
  });

  it("repairs late registered membership once without borrowing an earlier proof", async () => {
    const a = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
    const original = provider.listLeaseStatuses.getMockImplementation()!;
    provider.listLeaseStatuses.mockImplementationOnce(async () => {
      await a.safety.reserveRenewalNoticeLease(actor, "9002", db);
      return original();
    });
    const queries = vi.spyOn(
      Object.getPrototypeOf(fake.collectionGroup("approval_safety")),
      "get",
    );
    const read = await a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      Date.now(),
      {},
      db,
    );
    expect(queries).toHaveBeenCalledTimes(3);
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(2);
    expect(read.snapshot.noticeAdmission?.leaseKeys).toHaveLength(2);
    expect(
      read.statusTable.status === "available" && read.statusTable.admittedLeaseKeys,
    ).toHaveLength(2);
  });

  it("refuses a cold display read before fetch when durable source admission fails", async () => {
    const a = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    vi.spyOn(fake, "runTransaction").mockRejectedValueOnce(
      new Error("Synthetic admission unavailable"),
    );
    await expect(
      a.helper.readCoherentRenewalDisplaySource(actor, provider, Date.now(), {}, db),
    ).rejects.toThrow("Synthetic admission unavailable");
    expect(provider.listAllLeasesExport).not.toHaveBeenCalled();
    expect(provider.listLeaseStatuses).not.toHaveBeenCalled();
  });

  it("repairs both registered desk leases after another runtime observes only the selected lease", async () => {
    const a = await runtime(),
      b = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    provider.listAllLeasesExport.mockResolvedValue({
      rows: ["9001", "9002"].map((leaseID) => ({
        lease: { leaseID, leaseStatusID: "2", tenants: [{ contactID: "9101" }] },
        unit: { unitID: "9201" },
      })),
      complete: true,
      pages: 1,
    });
    await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
    await a.safety.reserveRenewalNoticeLease(actor, "9002", db);
    const initial = await a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      Date.now(),
      {},
      db,
    );
    const observe = a.observer.renewalNoticeObserver(actor, db);
    expect(
      [...(await observe(initial, initial.statusTable, Date.now())).values()].map(
        (value) => value.state,
      ),
    ).toEqual(["not_initiated", "not_initiated"]);
    const selected = await b.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect((await b.safety.observeRenewalNotice(actor, source(selected), db)).ready).toBe(
      true,
    );
    // This is the previous SSR path's actual failure: cached sources cannot complete the
    // unselected lease's newer pending marker after an API runtime advanced the portfolio.
    expect(
      (await observe(initial, initial.statusTable, Date.now())).get("9002")?.state,
    ).toBe("unknown");
    const queryPrototype = Object.getPrototypeOf(fake.collectionGroup("approval_safety"));
    const queries = vi.spyOn(queryPrototype, "get");
    const repaired = await a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      Date.now(),
      {},
      db,
    );
    expect(queries).toHaveBeenCalledTimes(2);
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(3);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(3);
    const dispositions = await observe(repaired, repaired.statusTable, Date.now());
    expect([...dispositions.values()].map((value) => value.state)).toEqual([
      "not_initiated",
      "not_initiated",
    ]);
    expect(fake.store.size).toBe(2); // Existing safety markers only: no workflow/cycle/history.
  });

  it.each(["malformed", "foreign_path", "read_failure", "status_failure"] as const)(
    "preserves acquired lease visibility with unavailable notice status on %s",
    async (kind) => {
      const a = await runtime(),
        fake = new FakeTransactionalFirestore(),
        db = fake as unknown as Firestore,
        provider = reader();
      await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
      const wrapped = a.safety.withRenewalNoticeAdmission(actor, provider, db);
      const initial = await a.cache.getLiveLeaseSnapshot(wrapped, Date.now());
      const markerPath = [...fake.store.keys()][0];
      if (kind === "malformed")
        fake.store.set(markerPath, { sourceReadAt: { lease: "invalid", status: 0 } });
      if (kind === "foreign_path")
        fake.seed("unrelated/synthetic/approval_safety/notice", fake.read(markerPath)!);
      if (kind === "read_failure")
        vi.spyOn(
          Object.getPrototypeOf(fake.collectionGroup("approval_safety")),
          "get",
        ).mockRejectedValueOnce(new Error("Synthetic minimum unavailable"));
      if (kind === "status_failure")
        provider.listLeaseStatuses.mockRejectedValueOnce(
          new Error("Synthetic status unavailable"),
        );
      const displayed = await a.helper.readCoherentRenewalDisplaySource(
        actor,
        provider,
        Date.now(),
        {},
        db,
      );
      expect(displayed.snapshot).toBe(initial.snapshot);
      expect(displayed.snapshot.views).toHaveLength(1);
      expect(displayed.statusTable).toEqual({ status: "unavailable" });
      expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(1);
    },
  );

  it("does not reserve newly discovered portfolio leases or invent their membership", async () => {
    const a = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    const displayed = await a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      Date.now(),
      {},
      db,
    );
    expect(displayed.snapshot.views).toHaveLength(1);
    expect(displayed.snapshot.noticeAdmission?.leaseKeys).toEqual([]);
    expect(fake.store.size).toBe(0);
    const outcome = await a.observer.renewalNoticeObserver(actor, db)(
      displayed,
      displayed.statusTable,
      Date.now(),
    );
    expect(outcome.get("9001")?.state).toBe("unknown");
  });

  it("retains the stronger detail post-write barrier when an earlier portfolio read is in flight", async () => {
    const a = await runtime(),
      fake = new FakeTransactionalFirestore(),
      db = fake as unknown as Firestore,
      provider = reader();
    await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((done) => {
        release = done;
      }),
      started = new Promise<void>((done) => {
        entered = done;
      });
    const original = provider.listAllLeasesExport.getMockImplementation()!;
    provider.listAllLeasesExport.mockImplementationOnce(async () => {
      entered();
      await held;
      return original();
    });
    const now = Date.now(),
      old = a.cache.getLiveLeaseSnapshot(
        a.safety.withRenewalNoticeAdmission(actor, provider, db),
        now,
      );
    await started;
    const display = a.helper.readCoherentRenewalDisplaySource(
      actor,
      provider,
      now + 1,
      { leaseId: "9001", sourceRefreshAfter: now + 1 },
      db,
    );
    release();
    await old;
    const result = await display;
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(result.snapshot.readAtMs).toBeGreaterThanOrEqual(now + 1);
    expect((await a.safety.observeRenewalNotice(actor, source(result), db)).ready).toBe(
      true,
    );
  });

  it("does not start a lease revalidation when only status needs catch-up across the soft TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-09-29T12:00:00.000Z");
    const a = await runtime(),
      b = await runtime(),
      db = new FakeTransactionalFirestore() as unknown as Firestore,
      provider = reader();
    await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    const other = b.safety.withRenewalNoticeAdmission(actor, provider, db);
    await other.beforeStatusSourceRead(Date.now());
    const original = provider.listLeaseStatuses.getMockImplementation()!;
    provider.listLeaseStatuses.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + a.cache.LEASE_EXPORT_TTL_MS + 1);
      await other.beforeStatusSourceRead(Date.now());
      return original();
    });
    const repaired = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(3);
    expect(repaired.currency.state).toBe("stale");
    expect((await a.safety.observeRenewalNotice(actor, source(repaired), db)).ready).toBe(
      true,
    );
  });

  it("repairs only a cached status generation behind the same durable marker", async () => {
    const a = await runtime(),
      b = await runtime(),
      db = new FakeTransactionalFirestore() as unknown as Firestore,
      provider = reader();
    const initial = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    const initialSafety = await a.safety.observeRenewalNotice(actor, source(initial), db);
    expect(initialSafety.ready).toBe(true);
    const other = b.safety.withRenewalNoticeAdmission(actor, provider, db);
    const newer = await b.status.readLeaseStatusTable(other, Date.now());
    expect(newer.status).toBe("available");
    expect((await a.safety.observeRenewalNotice(actor, source(initial), db)).ready).toBe(
      false,
    );
    const repaired = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(3);
    const repairedSafety = await a.safety.observeRenewalNotice(
      actor,
      source(repaired),
      db,
    );
    expect(repairedSafety.ready).toBe(true);
    expect(repairedSafety.basis?.version).toBeGreaterThan(initialSafety.basis!.version);
  });

  it("repairs only a cached lease generation behind another runtime's admission", async () => {
    const a = await runtime(),
      b = await runtime(),
      db = new FakeTransactionalFirestore() as unknown as Firestore,
      provider = reader();
    const initial = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect((await a.safety.observeRenewalNotice(actor, source(initial), db)).ready).toBe(
      true,
    );
    await b.cache.getLiveLeaseSnapshot(
      b.safety.withRenewalNoticeAdmission(actor, provider, db),
      Date.now(),
    );
    const repaired = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(3);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(1);
    expect((await a.safety.observeRenewalNotice(actor, source(repaired), db)).ready).toBe(
      true,
    );
  });

  it("catches up once when another runtime advances status during the initial lease read", async () => {
    const a = await runtime(),
      b = await runtime(),
      db = new FakeTransactionalFirestore() as unknown as Firestore,
      provider = reader();
    const initial = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect((await a.safety.observeRenewalNotice(actor, source(initial), db)).ready).toBe(
      true,
    );
    const other = b.safety.withRenewalNoticeAdmission(actor, provider, db);
    await other.beforeLeaseSourceRead(Date.now());
    const original = provider.listAllLeasesExport.getMockImplementation()!;
    provider.listAllLeasesExport.mockImplementationOnce(async () => {
      await other.beforeStatusSourceRead(Date.now());
      return original();
    });
    const repaired = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(2);
    expect((await a.safety.observeRenewalNotice(actor, source(repaired), db)).ready).toBe(
      true,
    );
  });

  it("refuses after a second concurrent advance instead of repeatedly exporting", async () => {
    const a = await runtime(),
      b = await runtime(),
      db = new FakeTransactionalFirestore() as unknown as Firestore,
      provider = reader();
    await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    const other = b.safety.withRenewalNoticeAdmission(actor, provider, db);
    await other.beforeLeaseSourceRead(Date.now());
    const original = provider.listAllLeasesExport.getMockImplementation()!;
    provider.listAllLeasesExport.mockImplementation(async () => {
      await other.beforeLeaseSourceRead(Date.now());
      return original();
    });
    await expect(
      a.helper.readAdmittedRenewalNoticeLease(actor, "9001", provider, Date.now(), db),
    ).rejects.toThrow("changed during its bounded read");
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(3);
    expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(1);
    // Failed work vacates the shared slot; a later bounded read can recover normally.
    provider.listAllLeasesExport.mockImplementation(original);
    const recovered = await a.helper.readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      provider,
      Date.now(),
      db,
    );
    expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(4);
    expect(
      (await a.safety.observeRenewalNotice(actor, source(recovered), db)).ready,
    ).toBe(true);
  });

  it.each(["missing", "malformed", "read_failure"] as const)(
    "refuses %s durable minima after a positive reservation read before dispatching provider reads",
    async (kind) => {
      const a = await runtime(),
        fake = new FakeTransactionalFirestore(),
        db = fake as unknown as Firestore,
        provider = reader();
      await a.safety.reserveRenewalNoticeLease(actor, "9001", db);
      const prototype = Object.getPrototypeOf(
        fake.collection("synthetic").doc("synthetic"),
      );
      const original = prototype.get;
      let reads = 0;
      vi.spyOn(prototype, "get").mockImplementation(async function (this: {
        path: string;
      }) {
        reads++;
        if (reads === 1) {
          const reserved = await original.call(this);
          expect(reserved.exists).toBe(true);
          return reserved;
        }
        if (kind === "read_failure") throw new Error("Synthetic marker read unavailable");
        if (kind === "missing") fake.store.delete(this.path);
        else fake.store.set(this.path, { sourceReadAt: { lease: "invalid", status: 0 } });
        return original.call(this);
      });
      await expect(
        a.helper.readAdmittedRenewalNoticeLease(actor, "9001", provider, Date.now(), db),
      ).rejects.toThrow();
      expect(reads).toBe(2);
      expect(provider.listAllLeasesExport).not.toHaveBeenCalled();
      expect(provider.listLeaseStatuses).not.toHaveBeenCalled();
    },
  );
});
