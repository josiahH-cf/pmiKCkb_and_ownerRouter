import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

const actor: AuthenticatedUser = {
  uid: "synthetic-bulk-reader",
  email: "synthetic-bulk-reader@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const projectId = "pmi-kc-notice-bulk-test";
let app: App,
  otherApp: App,
  db: Firestore,
  otherDb: Firestore,
  environment: RulesTestEnvironment;
async function runtime() {
  vi.resetModules();
  return {
    helper: await import("@/lib/lease-renewal/admitted-notice-source"),
    safety: await import("@/lib/firestore/renewal-notice-safety"),
    observer: await import("@/lib/lease-renewal/notice-read"),
  };
}
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  await environment.clearFirestore();
  app = initializeApp({ projectId }, "notice-bulk-a");
  otherApp = initializeApp({ projectId }, "notice-bulk-b");
  db = getFirestore(app);
  otherDb = getFirestore(otherApp);
});
afterAll(async () => {
  await deleteApp(app);
  await deleteApp(otherApp);
  await environment.cleanup();
});

it("repairs both real stored markers after independent API and desk cache generations", async () => {
  const a = await runtime(),
    b = await runtime();
  const provider = {
    listAllLeasesExport: vi.fn(async () => ({
      rows: ["9001", "9002"].map((leaseID) => ({
        lease: { leaseID, leaseStatusID: "2", tenants: [{ contactID: "9101" }] },
        unit: { unitID: "9201" },
      })),
      complete: true,
      pages: 1,
    })),
    getLease: async () => ({
      leaseStatusID: "2",
      noticeDate: null,
      expectedMoveOutDate: null,
      moveOutDate: null,
      isMonthToMonth: "0",
    }),
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
    otherDb,
  );
  expect(
    (
      await b.safety.observeRenewalNotice(
        actor,
        {
          lease: selected.snapshot.views[0],
          statusTable: selected.statusTable,
          freshness: selected.currency.state,
          leaseReadAtMs: selected.snapshot.readAtMs,
          observedAtMs: Date.now(),
          noticeAdmitted: selected.snapshot.noticeAdmitted,
          admittedLeaseKeys: selected.snapshot.noticeAdmission?.leaseKeys,
        },
        otherDb,
      )
    ).ready,
  ).toBe(true);
  expect(
    (await observe(initial, initial.statusTable, Date.now())).get("9002")?.state,
  ).toBe("unknown");
  const repaired = await a.helper.readCoherentRenewalDisplaySource(
    actor,
    provider,
    Date.now(),
    {},
    db,
  );
  expect(
    [...(await observe(repaired, repaired.statusTable, Date.now())).values()].map(
      (value) => value.state,
    ),
  ).toEqual(["not_initiated", "not_initiated"]);
  expect(provider.listAllLeasesExport).toHaveBeenCalledTimes(3);
  expect(provider.listLeaseStatuses).toHaveBeenCalledTimes(3);
  expect((await db.collectionGroup("approval_safety").get()).size).toBe(2);
  expect((await db.collection("lease_renewal_workspaces").get()).size).toBe(0);
  expect((await db.collectionGroup("notice_reviews").get()).size).toBe(0);
});
