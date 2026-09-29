import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import {
  getFirestore,
  type Firestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  noticeSafetyMarkerRef,
  reserveRenewalNoticeLease,
} from "@/lib/firestore/renewal-notice-safety";
import { NoticeSafetyMarkerSchema } from "@/lib/lease-renewal/notice-safety";

const actor = {
  uid: "reservation-emulator",
  email: "reservation-emulator@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as AuthenticatedUser;
const projectId = "pmi-kc-notice-reservation-test";
let app: App,
  otherApp: App,
  db: Firestore,
  otherDb: Firestore,
  environment: RulesTestEnvironment;
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `notice-reservation-a-${process.pid}`);
  otherApp = initializeApp({ projectId }, `notice-reservation-b-${process.pid}`);
  db = getFirestore(app);
  otherDb = getFirestore(otherApp);
});
beforeEach(async () => {
  await environment.clearFirestore();
});
afterAll(async () => {
  await deleteApp(app);
  await deleteApp(otherApp);
  await environment.cleanup();
});

function reader(
  client: Firestore,
  firstRead?: (ref: DocumentReference) => ReturnType<DocumentReference["get"]>,
) {
  let initial = true;
  const counts = { get: 0, create: 0, transactions: 0 };
  const observed = {
    collection(name: string) {
      return {
        doc(id: string) {
          const ref = client.collection(name).doc(id);
          return {
            path: ref.path,
            get() {
              counts.get++;
              if (initial && firstRead) {
                initial = false;
                return firstRead(ref);
              }
              return ref.get();
            },
            create(data: Parameters<DocumentReference["create"]>[0]) {
              counts.create++;
              return ref.create(data);
            },
          };
        },
      };
    },
    runTransaction: vi.fn(() => {
      counts.transactions++;
      throw new Error("Reservation must not open a read/write transaction");
    }),
  } as unknown as Firestore;
  return { observed, counts };
}

it("two independent clients race after both exact reads see a missing marker, with one atomic creator", async () => {
  let release!: () => void, reject!: (error: Error) => void;
  const barrier = new Promise<void>((resolve, no) => {
    release = resolve;
    reject = no;
  });
  const timer = setTimeout(
    () => reject(new Error("Both reservation reads must reach the barrier")),
    3_000,
  );
  let reads = 0;
  const readMissing = async (ref: DocumentReference) => {
    const snapshot = await ref.get();
    expect(snapshot.exists).toBe(false);
    reads++;
    if (reads === 2) {
      clearTimeout(timer);
      release();
    }
    await barrier;
    return snapshot;
  };
  const a = reader(db, readMissing),
    b = reader(otherDb, readMissing);
  try {
    expect(
      await Promise.allSettled([
        reserveRenewalNoticeLease(actor, "9001", a.observed),
        reserveRenewalNoticeLease(actor, "9001", b.observed),
      ]),
    ).toEqual(
      expect.arrayContaining([
        { status: "fulfilled", value: true },
        { status: "fulfilled", value: false },
      ]),
    );
  } finally {
    clearTimeout(timer);
  }
  expect(reads).toBe(2);
  expect(a.counts.create + b.counts.create).toBe(2);
  expect(a.counts.get + b.counts.get).toBe(3);
  expect(a.counts.transactions + b.counts.transactions).toBe(0);
  const saved = NoticeSafetyMarkerSchema.parse(
    (await noticeSafetyMarkerRef(db, "9001").get()).data(),
  );
  expect(saved).toMatchObject({ version: 1, sourceReadAt: { lease: 0, status: 0 } });
  expect(Object.keys(saved).sort()).toEqual([
    "observedAt",
    "scopeHash",
    "semanticHash",
    "sourceReadAt",
    "version",
  ]);
  expect((await db.collectionGroup("approval_safety").get()).size).toBe(1);
  expect((await db.collection("lease_renewal_workspaces").get()).size).toBe(0);
  expect((await db.collectionGroup("notice_reviews").get()).size).toBe(0);
});

it("54 warm reservations across independent clients use no create or transaction and preserve advanced bytes", async () => {
  await reserveRenewalNoticeLease(actor, "9001", db);
  const ref = noticeSafetyMarkerRef(db, "9001");
  const advanced = {
    ...(await ref.get()).data()!,
    version: 41,
    scopeHash: "a".repeat(64),
    semanticHash: "b".repeat(64),
    sourceReadAt: { lease: 100, status: 200 },
  };
  await ref.set(advanced);
  const a = reader(db),
    b = reader(otherDb);
  expect(
    await Promise.allSettled(
      Array.from({ length: 54 }, (_, index) =>
        reserveRenewalNoticeLease(actor, "9001", index % 2 ? a.observed : b.observed),
      ),
    ),
  ).toEqual(Array(54).fill({ status: "fulfilled", value: false }));
  expect(a.counts.get + b.counts.get).toBe(54);
  expect(a.counts.create + b.counts.create).toBe(0);
  expect(a.counts.transactions + b.counts.transactions).toBe(0);
  expect((await ref.get()).data()).toEqual(advanced);
});
