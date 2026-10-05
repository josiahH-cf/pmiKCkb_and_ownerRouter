import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  getPersonalView,
  savePersonalView,
  PERSONAL_VIEW_COLLECTION,
  personalViewDocId,
} from "@/lib/firestore/personal-views";
import {
  RENEWAL_DESK_PREFERENCE_COLLECTION,
  renewalDeskPreferenceDocId,
} from "@/lib/firestore/renewal-desk-preferences";
const projectId = "pmi-kc-kb-s177-personal-views-test";
const pat = {
  uid: "fixture-pat",
  email: "pat.fixture@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const lee = { ...pat, uid: "fixture-lee", email: "lee.fixture@pmikcmetro.com" };
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `s177-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});
const value = {
  query: "v=2&q=Jane+Doe&scope=all",
  layout: { columns: { c0: 320 }, panelWidth: 480 },
};
describe("S177 actual private preference transactions", () => {
  it("is durable across sessions, private per account and retains desktop intent", async () => {
    await savePersonalView(pat, { surface: "renewals", expectedRevision: 0, value }, db);
    expect(await getPersonalView({ ...pat }, "renewals", db)).toMatchObject({
      revision: 1,
      value,
    });
    expect(await getPersonalView(lee, "renewals", db)).toMatchObject({
      revision: 0,
      value: { query: "", layout: { columns: {} } },
    });
    await savePersonalView(
      lee,
      {
        surface: "renewals",
        expectedRevision: 0,
        value: { query: "v=2", layout: { columns: {} } },
      },
      db,
    );
    expect((await getPersonalView(pat, "renewals", db)).value).toEqual(value);
  });
  it("rejects one concurrent stale writer in real emulator transactions", async () => {
    const results = await Promise.allSettled([
      savePersonalView(pat, { surface: "renewals", expectedRevision: 0, value }, db),
      savePersonalView(
        pat,
        {
          surface: "renewals",
          expectedRevision: 0,
          value: { ...value, query: "v=2&sort=end_date&direction=desc" },
        },
        db,
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect((await getPersonalView(pat, "renewals", db)).revision).toBe(1);
  });
  it("reads v1 without a migration write and preserves its valid sort", async () => {
    const ref = db
      .collection(RENEWAL_DESK_PREFERENCE_COLLECTION)
      .doc(renewalDeskPreferenceDocId(pat.uid));
    const previous = {
      uid: pat.uid,
      schemaVersion: "renewal-desk-preference/v1",
      view: "v=2&sort=end_date&direction=desc",
      updatedAt: "2026-10-01T15:00:00.000Z",
    };
    await ref.set(previous);
    expect((await getPersonalView(pat, "renewals", db)).value.query).toBe(previous.view);
    expect((await ref.get()).data()).toEqual(previous);
    expect((await db.collection(PERSONAL_VIEW_COLLECTION).get()).empty).toBe(true);
  });
  it("refuses forged ownership, verification writes and unknown schema fields", async () => {
    await expect(
      savePersonalView(
        pat,
        { surface: "renewals", expectedRevision: 0, value, uid: lee.uid } as never,
        db,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      savePersonalView(
        { ...pat, email: "canary-editor@pmikcmetro.com" },
        { surface: "renewals", expectedRevision: 0, value },
        db,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await db.collection(PERSONAL_VIEW_COLLECTION).get()).empty).toBe(true);
  });
  it("keeps the server collection closed to every direct client", async () => {
    const client = testEnv
      .authenticatedContext(pat.uid, {
        email: pat.email,
        email_verified: true,
        role: pat.role,
      })
      .firestore();
    const ref = doc(
      client,
      PERSONAL_VIEW_COLLECTION,
      personalViewDocId(pat.uid, "renewals"),
    );
    await assertFails(setDoc(ref, value));
    await assertFails(getDoc(ref));
  });
  it("expires private saved searches after 90 days without a read mutation, keeping CAS safe until TTL deletion", async () => {
    const old = new Date("2020-01-01T00:00:00.000Z");
    await savePersonalView(
      pat,
      { surface: "renewals", expectedRevision: 0, value },
      db,
      () => old,
    );
    const ref = db
      .collection(PERSONAL_VIEW_COLLECTION)
      .doc(personalViewDocId(pat.uid, "renewals"));
    const before = (await ref.get()).data()!;
    expect((await getPersonalView(pat, "renewals", db)).value.query).toBe("");
    expect((await getPersonalView(pat, "renewals", db)).revision).toBe(1);
    expect(before.expiresAt.toMillis()).toBe(old.getTime() + 90 * 86_400_000);
    expect((await ref.get()).data()).toEqual(before);
    await savePersonalView(pat, { surface: "renewals", expectedRevision: 1, value }, db);
    expect((await getPersonalView(pat, "renewals", db)).value).toEqual(value);
  });
});
