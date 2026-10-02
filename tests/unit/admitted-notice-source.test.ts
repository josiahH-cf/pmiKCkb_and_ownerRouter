import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type {
  LeaseExportReadResult,
  RentVineLeaseStatus,
} from "@/lib/integrations/rentvine/client";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";
import { readAdmittedRenewalNoticeLease } from "@/lib/lease-renewal/admitted-notice-source";
import {
  clearLiveLeaseCache,
  getLiveLeaseSnapshot,
  invalidateLiveLeaseCache,
  LEASE_EXPORT_MAX_AGE_MS,
  LEASE_EXPORT_TTL_MS,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  clearLeaseStatusTableCache,
  readLeaseStatusTable,
} from "@/lib/lease-renewal/lease-status-table";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import {
  reserveRenewalNoticeLease,
  withRenewalNoticeAdmission,
  observeRenewalNotice,
} from "@/lib/firestore/renewal-notice-safety";
import {
  buildLiveRentVineConfig,
  buildLiveRenewalConfig,
} from "@/lib/lease-renewal/live-config";
import { configuredNoticeReaderScope } from "@/lib/lease-renewal/notice-source-admission";

const seam = vi.hoisted(() => ({
  afterReservation: null as null | (() => Promise<void>),
  beforeLeaseAdmission: null as null | (() => Promise<void>),
}));
vi.mock("@/lib/firestore/renewal-notice-safety", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/firestore/renewal-notice-safety")>();
  const { inheritNoticeReaderScope } = await import(
    "@/lib/lease-renewal/notice-source-admission"
  );
  return {
    ...actual,
    reserveRenewalNoticeLease: async (
      ...args: Parameters<typeof actual.reserveRenewalNoticeLease>
    ) => {
      const result = await actual.reserveRenewalNoticeLease(...args);
      await seam.afterReservation?.();
      return result;
    },
    // Lets a test hold a lease admission's durable commit, as a slower store transaction would.
    withRenewalNoticeAdmission: (
      ...args: Parameters<typeof actual.withRenewalNoticeAdmission>
    ) => {
      const wrapped = actual.withRenewalNoticeAdmission(...args);
      if (!seam.beforeLeaseAdmission) return wrapped;
      const held = new Proxy(wrapped, {
        get(target, key, receiver) {
          if (key === "beforeLeaseSourceRead")
            return async (at: number) => {
              await seam.beforeLeaseAdmission?.();
              return target.beforeLeaseSourceRead(at);
            };
          return Reflect.get(target, key, receiver);
        },
      });
      inheritNoticeReaderScope(held, args[1]);
      return held;
    },
  };
});

const actor: AuthenticatedUser = {
  uid: "synthetic-notice-reader",
  email: "synthetic-notice-reader@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const db = new FakeTransactionalFirestore() as unknown as Firestore;
  const reader = {
    listAllLeasesExport: vi.fn(
      async (): Promise<LeaseExportReadResult> => ({
        rows: [{ lease: { leaseID: "9001" } }],
        pages: 1,
        complete: true,
      }),
    ),
    listLeaseStatuses: vi.fn(async (): Promise<RentVineLeaseStatus[]> => []),
  };
  return { db, reader };
}
beforeEach(() => {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
  seam.afterReservation = null;
  seam.beforeLeaseAdmission = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2026-09-29T12:00:00.000Z");
});
afterEach(() => vi.useRealTimers());

describe("bounded lease-specific notice admission recovery", () => {
  it("coalesces overlapping owner, tenant and notice reads into one admitted recovery", async () => {
    const { db, reader } = fixture();
    await getLiveLeaseSnapshot(reader, Date.now());
    const reservations = deferred<void>();
    let reserved = 0;
    seam.afterReservation = async () => {
      if (++reserved === 3) reservations.resolve();
      await reservations.promise;
    };
    const released = deferred<void>();
    const entered = deferred<void>();
    const original = reader.listAllLeasesExport.getMockImplementation()!;
    reader.listAllLeasesExport.mockImplementationOnce(async () => {
      entered.resolve();
      await released.promise;
      return original();
    });
    const reads = Array.from({ length: 3 }, () =>
      readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db),
    );
    await entered.promise;
    // Allow every reserved caller to encounter the same in-flight repair.
    await new Promise((resolve) => setTimeout(resolve, 0));
    released.resolve();
    const results = await Promise.all(reads);
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(reader.listLeaseStatuses).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.snapshot.noticeAdmission?.leaseKeys).toContain(
        renewalWorkspaceDocId("9001"),
      );
      expect(result.currency.state).toBe("fresh");
    }
  });

  it("reuses an ordinary admitted generation and preserves nested reader scope", async () => {
    const { db, reader } = fixture();
    await reserveRenewalNoticeLease(actor, "9001", db);
    const ordinary = withRenewalNoticeAdmission(actor, reader, db);
    await getLiveLeaseSnapshot(ordinary, Date.now());
    await readLeaseStatusTable(ordinary, Date.now());
    const result = await readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      ordinary,
      Date.now(),
      db,
    );
    expect(result.snapshot.noticeAdmission?.leaseKeys).toContain(
      renewalWorkspaceDocId("9001"),
    );
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(reader.listLeaseStatuses).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.snapshot.noticeAdmission!)).toEqual([
      "readAtMs",
      "leaseKeys",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/context|credential|digest/);
  });

  it("waits for an unadmitted pre-reservation read, then performs exactly one admitted read", async () => {
    const { db, reader } = fixture();
    const entered = deferred<void>(),
      release = deferred<void>(),
      reserved = deferred<void>();
    const original = reader.listAllLeasesExport.getMockImplementation()!;
    reader.listAllLeasesExport.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return original();
    });
    const old = getLiveLeaseSnapshot(reader, Date.now());
    await entered.promise;
    seam.afterReservation = async () => {
      reserved.resolve();
    };
    const current = readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db);
    await reserved.promise;
    release.resolve();
    const [previous, result] = await Promise.all([old, current]);
    expect(previous.snapshot.noticeAdmission).toBeUndefined();
    expect(result.snapshot.noticeAdmission?.leaseKeys).toContain(
      renewalWorkspaceDocId("9001"),
    );
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(2);
  });

  it("repairs a late different key instead of borrowing the first key's admission", async () => {
    const { db, reader } = fixture();
    const entered = deferred<void>(),
      release = deferred<void>();
    const original = reader.listAllLeasesExport.getMockImplementation()!;
    reader.listAllLeasesExport.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return original();
    });
    const first = readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db);
    await entered.promise;
    const firstSettled = first.catch(() => null);
    const second = readAdmittedRenewalNoticeLease(actor, "9002", reader, Date.now(), db);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release.resolve();
    const result = await second;
    await firstSettled;
    expect(result.snapshot.noticeAdmission?.leaseKeys).toContain(
      renewalWorkspaceDocId("9002"),
    );
    expect(
      result.statusTable.status === "available" && result.statusTable.admittedLeaseKeys,
    ).toContain(renewalWorkspaceDocId("9002"));
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(2);
  });

  it("clears failed work for a new bounded retry and never returns the old unadmitted cache", async () => {
    const { db, reader } = fixture();
    await getLiveLeaseSnapshot(reader, Date.now());
    reader.listAllLeasesExport.mockRejectedValueOnce(
      new Error("synthetic source unavailable"),
    );
    await expect(
      readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db),
    ).rejects.toThrow("synthetic source unavailable");
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(reader.listLeaseStatuses).not.toHaveBeenCalled();
    const retried = await readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      reader,
      Date.now(),
      db,
    );
    expect(retried.snapshot.noticeAdmitted).toBe(true);
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(3);
  });

  it.each(["lease", "status"])(
    "fails closed after one read when the %s admission omits the reserved key",
    async (kind) => {
      const { db, reader } = fixture();
      const clearMarkers = () =>
        (db as unknown as FakeTransactionalFirestore).store.clear();
      if (kind === "lease") {
        const originalTransaction = db.runTransaction.bind(db);
        let transactions = 0;
        vi.spyOn(db, "runTransaction").mockImplementation((...args) => {
          // Keep the reserved minimum readable, then remove membership immediately before
          // the actual lease admission. This still tests the returned proof, not a missing floor.
          if (++transactions === 1) clearMarkers();
          return originalTransaction(...args);
        });
      } else {
        const original = reader.listAllLeasesExport.getMockImplementation()!;
        reader.listAllLeasesExport.mockImplementationOnce(async () => {
          clearMarkers();
          return original();
        });
      }
      await expect(
        readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db),
      ).rejects.toThrow("did not admit");
      expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(1);
      expect(reader.listLeaseStatuses).toHaveBeenCalledTimes(kind === "lease" ? 0 : 1);
    },
  );

  it("does not dispatch a provider read when durable admission fails", async () => {
    const { db, reader } = fixture();
    const original = db.runTransaction.bind(db);
    let calls = 0;
    vi.spyOn(db, "runTransaction").mockImplementation((...args) => {
      if (++calls === 1)
        return Promise.reject(new Error("synthetic admission unavailable"));
      return original(...args);
    });
    await expect(
      readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db),
    ).rejects.toThrow("synthetic admission unavailable");
    expect(reader.listAllLeasesExport).not.toHaveBeenCalled();
    expect(reader.listLeaseStatuses).not.toHaveBeenCalled();
  });

  it("isolates separate store instances and injected reader objects", async () => {
    const { db, reader } = fixture();
    const first = await readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      reader,
      Date.now(),
      db,
    );
    const otherDb = fixture().db;
    const otherStore = await readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      reader,
      Date.now(),
      otherDb,
    );
    expect(otherStore.snapshot).not.toBe(first.snapshot);
    const otherReader = fixture().reader;
    await readAdmittedRenewalNoticeLease(actor, "9001", otherReader, Date.now(), otherDb);
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(otherReader.listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(otherReader.listLeaseStatuses).toHaveBeenCalledTimes(1);
  });

  it.each(["invalidate", "clear", "expire"])(
    "refuses a held generation after %s during its status read",
    async (kind) => {
      const { db, reader } = fixture();
      const entered = deferred<void>(),
        release = deferred<void>();
      reader.listLeaseStatuses.mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
        return [];
      });
      const pending = readAdmittedRenewalNoticeLease(
        actor,
        "9001",
        reader,
        Date.now(),
        db,
      );
      const refused = expect(pending).rejects.toThrow(/admit|expired/);
      await entered.promise;
      if (kind === "invalidate") invalidateLiveLeaseCache();
      else if (kind === "clear") {
        clearLiveLeaseCache();
        clearLeaseStatusTableCache();
      } else vi.setSystemTime(Date.now() + LEASE_EXPORT_MAX_AGE_MS);
      release.resolve();
      await refused;
    },
  );

  it("retains soft-TTL background refresh and refuses authority failures before any fetch", async () => {
    const { db, reader } = fixture();
    await readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db);
    vi.setSystemTime(Date.now() + LEASE_EXPORT_TTL_MS + 1);
    await readAdmittedRenewalNoticeLease(actor, "9001", reader, Date.now(), db).catch(
      () => undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(2);
    const untrusted = fixture().reader;
    await expect(
      readAdmittedRenewalNoticeLease(
        { ...actor, email: "synthetic@example.invalid" },
        "9001",
        untrusted,
        Date.now(),
        db,
      ),
    ).rejects.toThrow("Managed renewals read authority");
    expect(untrusted.listAllLeasesExport).not.toHaveBeenCalled();
    expect(untrusted.listLeaseStatuses).not.toHaveBeenCalled();
  });

  it("does not turn a cached read into readiness after another admitted source generation advances the marker", async () => {
    const { db, reader } = fixture();
    reader.listAllLeasesExport.mockResolvedValue({
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
    });
    reader.listLeaseStatuses.mockResolvedValue([
      {
        leaseStatusID: "2",
        name: "Synthetic active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ]);
    const verified = {
      ...reader,
      getLease: async () => ({
        leaseStatusID: "2",
        noticeDate: null,
        expectedMoveOutDate: null,
        moveOutDate: null,
        isMonthToMonth: "0",
      }),
    };
    const read = await readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      verified,
      Date.now(),
      db,
    );
    const source = {
      lease: read.snapshot.views[0],
      statusTable: read.statusTable,
      freshness: read.currency.state,
      leaseReadAtMs: read.snapshot.readAtMs,
      observedAtMs: Date.now(),
      noticeAdmitted: read.snapshot.noticeAdmitted,
      admittedLeaseKeys: read.snapshot.noticeAdmission?.leaseKeys,
    };
    expect((await observeRenewalNotice(actor, source, db)).ready).toBe(true);
    await withRenewalNoticeAdmission(actor, verified, db).beforeLeaseSourceRead(
      Date.now() + 1,
    );
    const outcome = await observeRenewalNotice(actor, source, db);
    expect(outcome.ready).toBe(false);
    expect(outcome.disposition.reason).toBe("approval_safety_unavailable");
  });

  it("joins the soft-TTL revalidation an approval read starts instead of returning the generation it supersedes", async () => {
    // S113 race: past the soft TTL, the approval read starts an admitted background refresh whose
    // admission raises the notice floor. Returning the stale generation let that floor land after
    // the read's own minimum check, so the draft preview was refused.
    const { db, reader } = fixture();
    const rows = {
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
    };
    reader.listAllLeasesExport.mockResolvedValue(rows);
    reader.listLeaseStatuses.mockResolvedValue([
      {
        leaseStatusID: "2",
        name: "Synthetic active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ]);
    const verified = {
      ...reader,
      getLease: async () => ({
        leaseStatusID: "2",
        noticeDate: null,
        expectedMoveOutDate: null,
        moveOutDate: null,
        isMonthToMonth: "0",
      }),
    };
    const sourceOf = (
      read: Awaited<ReturnType<typeof readAdmittedRenewalNoticeLease>>,
    ) => ({
      lease: read.snapshot.views[0],
      statusTable: read.statusTable,
      freshness: read.currency.state,
      leaseReadAtMs: read.snapshot.readAtMs,
      observedAtMs: Date.now(),
      noticeAdmitted: read.snapshot.noticeAdmitted,
      admittedLeaseKeys: read.snapshot.noticeAdmission?.leaseKeys,
    });
    const first = await readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      verified,
      Date.now(),
      db,
    );
    expect((await observeRenewalNotice(actor, sourceOf(first), db)).ready).toBe(true);

    vi.setSystemTime(Date.now() + LEASE_EXPORT_TTL_MS + 1);
    const admission = deferred<void>();
    const provider = deferred<void>();
    seam.beforeLeaseAdmission = () => admission.promise;
    reader.listAllLeasesExport.mockImplementationOnce(async () => {
      await provider.promise;
      return rows;
    });
    const approval = readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      verified,
      Date.now(),
      db,
    );
    approval.catch(() => undefined);
    for (let tick = 0; tick < 5; tick += 1)
      await new Promise((resolve) => setTimeout(resolve, 0));
    admission.resolve();
    for (let tick = 0; tick < 5; tick += 1)
      await new Promise((resolve) => setTimeout(resolve, 0));
    provider.resolve();
    const second = await approval;

    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(second.snapshot.readAtMs).toBeGreaterThan(first.snapshot.readAtMs);
    const outcome = await observeRenewalNotice(actor, sourceOf(second), db);
    expect(outcome.ready).toBe(true);
    expect(outcome.reason).toBeNull();
  });

  it("shares only factory-confirmed exact provider configuration across both live factories", () => {
    const env = {
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENTVINE_API_KEY: "synthetic-key",
      RENTVINE_API_SECRET: "synthetic-secret",
      RENEWAL_SHEET_ID: "synthetic-sheet",
      SHEETS_IMPERSONATE_SA: "synthetic@example.invalid",
      SHEETS_DWD_SUBJECT: "synthetic@example.invalid",
    };
    const one = buildLiveRentVineConfig(env),
      two = buildLiveRenewalConfig(env),
      changed = buildLiveRentVineConfig({
        ...env,
        RENTVINE_API_SECRET: "different-synthetic-secret",
      });
    if (!one.ok || !two.ok || !changed.ok) throw new Error("Synthetic factory setup");
    expect(configuredNoticeReaderScope(one.rentvineClient)).toBe(
      configuredNoticeReaderScope(two.rentvineClient),
    );
    expect(configuredNoticeReaderScope(one.rentvineClient)).not.toBe(
      configuredNoticeReaderScope(changed.rentvineClient),
    );
    expect(
      buildLiveRentVineConfig({
        ...env,
        RENTVINE_API_BASE_URL: "https://other.rentvine.com/api/manager",
      }).ok,
    ).toBe(false);
  });
});
