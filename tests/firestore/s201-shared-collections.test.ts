import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type {
  CollectionBasis,
  CollectionSource,
} from "@/lib/lease-renewal/shared-collections";
const fixture = vi.hoisted(() => ({
  db: null as Firestore | null,
  user: null as AuthenticatedUser | null,
  source: null as CollectionSource | null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => fixture.user,
}));
vi.mock("@/lib/lease-renewal/shared-collection-source", () => ({
  readSharedCollectionSource: async () => fixture.source,
}));
import {
  RenewalSharedCollectionStore,
  SHARED_COLLECTIONS,
} from "@/lib/firestore/renewal-shared-collections";
import { GET, POST } from "@/app/api/lease-renewal/collections/route";
const a: AuthenticatedUser = {
    uid: "collection-editor-one",
    email: "collection-editor-one@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  },
  b: AuthenticatedUser = {
    ...a,
    uid: "collection-editor-two",
    email: "collection-editor-two@pmikcmetro.com",
  };
let env: RulesTestEnvironment,
  app: ReturnType<typeof initializeApp>,
  db: Firestore,
  store: RenewalSharedCollectionStore,
  clock: Date;
const basis: CollectionBasis = {
  mode: "period",
  origin: "worklist",
  dateField: "lease_end",
  from: "2026-12-01",
  through: "2026-12-31",
  criteria: "",
  selectedLeaseIds: ["701", "702"],
};
function source(ids = ["701", "702"], cycle = "2026-12-31"): CollectionSource {
  return {
    complete: true,
    readAt: "2026-10-09T15:00:00Z",
    issues: [],
    records: ids.map((id) => ({
      member: { leaseId: id, cycleKey: `source:lease_end:${cycle}`, cycleDate: cycle },
      label: `Synthetic collection lease ${id}`,
      href: `/lease-renewal/live/desk/lease/${id}`,
      lifecycle: "Renewal active",
      workStatus: "In progress",
    })),
    matches: () => ids,
  };
}
const prepare = (
  id: string = randomUUID(),
  version = 0,
  name = "December reviewed group",
) => ({
  action: "review" as const,
  collectionId: id,
  expectedVersion: version,
  name,
  basis,
  reviewId: randomUUID(),
});
const confirm = (reviewId: string) => ({
  action: "save" as const,
  reviewId,
  operationId: randomUUID(),
});
async function create() {
  const input = prepare(),
    review = await store.review(a, input, fixture.source!);
  const command = confirm(review.id);
  const result = await store.save(a, command, async () => fixture.source!);
  return { input, review, command, collection: result.collection! };
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-shared-collection-test",
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-shared-collection-test" },
    `shared-collection-${process.pid}`,
  );
  db = getFirestore(app);
  fixture.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await env.clearFirestore();
  clock = new Date("2026-10-09T15:00:00Z");
  store = new RenewalSharedCollectionStore(db, () => clock);
  fixture.user = a;
  fixture.source = source();
});
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
  vi.unstubAllEnvs();
});
describe("S201 actual shared reviewed membership transactions and routes", () => {
  it("stores reviewed stable lease/cycle IDs and source criteria, shared with another existing staff actor without copying private chats", async () => {
    await db
      .collection("assistant_history_users")
      .doc("private-sentinel")
      .set({ owner_uid: a.uid, privateText: "Private conversation stays private" });
    const c = await create();
    expect(c.collection.members.map((m) => m.leaseId)).toEqual(["701", "702"]);
    expect(c.collection.basis).toEqual(basis);
    expect((await store.list(b)).collections).toEqual([c.collection]);
    expect(JSON.stringify(await store.get(b, c.collection.id))).not.toContain(
      "Private conversation",
    );
    expect(
      (
        await db.collection("assistant_history_users").doc("private-sentinel").get()
      ).data(),
    ).toEqual({ owner_uid: a.uid, privateText: "Private conversation stays private" });
    expect((await db.collection("action_executions").get()).empty).toBe(true);
  });
  it("refreshes current status separately, keeps missing or changed-cycle members, and changes membership only after reviewing the complete difference", async () => {
    const c = await create();
    fixture.source = source(["701", "703"], "2027-01-31");
    fixture.source.records[0].workStatus = "Completed: recorded by staff";
    const current = await store.statuses(b, c.collection.id, fixture.source);
    expect(current.collection.members).toEqual(c.collection.members);
    expect(current.statuses).toMatchObject([
      { state: "cycle_changed", workStatus: "Completed: recorded by staff" },
      { state: "unavailable", href: null },
    ]);
    const proposal = await store.review(b, prepare(c.collection.id, 1), fixture.source);
    expect(proposal.added.map((m) => m.leaseId)).toEqual(["701", "703"]);
    expect(proposal.removed.map((m) => m.leaseId)).toEqual(["701", "702"]);
    expect((await store.get(a, c.collection.id))!.version).toBe(1);
    fixture.source.complete = false;
    await expect(
      store.save(b, confirm(proposal.id), async () => fixture.source!),
    ).rejects.toMatchObject({ status: 409 });
    expect((await store.get(a, c.collection.id))!.members).toEqual(c.collection.members);
    fixture.source.complete = true;
    const saved = await store.save(b, confirm(proposal.id), async () => fixture.source!);
    expect(saved.collection!.members.map((m) => m.leaseId)).toEqual(["701", "703"]);
  });
  it("fences two membership edits and a name edit by one reviewed version and reconciles an old receipt to the current state", async () => {
    const c = await create(),
      one = await store.review(
        a,
        prepare(c.collection.id, 1, "First editor change"),
        fixture.source!,
      ),
      two = await store.review(
        b,
        prepare(c.collection.id, 1, "Second editor change"),
        fixture.source!,
      );
    const result = await Promise.allSettled([
      store.save(a, confirm(one.id), async () => fixture.source!),
      store.save(b, confirm(two.id), async () => fixture.source!),
      store.rename(b, {
        action: "rename",
        collectionId: c.collection.id,
        expectedVersion: 1,
        name: "Name only",
        operationId: randomUUID(),
      }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await store.get(a, c.collection.id))!.version).toBe(2);
    const noSource = vi.fn(async () => {
      throw new Error("outage");
    });
    const recovered = await store.save(a, c.command, noSource);
    expect(noSource).not.toHaveBeenCalled();
    expect(recovered.acceptedVersion).toBe(1);
    expect(recovered.collection!.version).toBe(2);
    expect(
      (
        await db
          .collection(SHARED_COLLECTIONS.heads)
          .doc(c.collection.id)
          .collection("versions")
          .get()
      ).size,
    ).toBe(2);
    await expect(
      store.save(a, { ...c.command, reviewId: one.id }, async () => fixture.source!),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("refuses changed fresh membership, expired reviews, fabricated or duplicate source identities and incomplete reads without altering the head", async () => {
    const c = await create(),
      proposal = await store.review(a, prepare(c.collection.id, 1), fixture.source!);
    fixture.source = source(["701", "702", "703"]);
    await expect(
      store.save(a, confirm(proposal.id), async () => fixture.source!),
    ).rejects.toMatchObject({ status: 409 });
    clock = new Date("2026-10-09T15:11:00Z");
    await expect(
      store.save(a, confirm(proposal.id), async () => source()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.review(
        a,
        {
          ...prepare(),
          basis: { ...basis, mode: "explicit", selectedLeaseIds: ["999"] },
        },
        source(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const duplicate = source();
    duplicate.records.push(duplicate.records[0]);
    await expect(store.review(a, prepare(), duplicate)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      store.review(a, prepare(), { ...source(), complete: false }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await store.get(a, c.collection.id))!.version).toBe(1);
  });
  it("keeps receipt/review ownership private and refuses spoofed bodies, external accounts and verification mutations through the actual HTTP and owning store", async () => {
    const c = await create();
    expect(await store.receipt(b, c.command.operationId)).toEqual({
      state: "not_recorded",
    });
    await expect(store.readReview(b, c.review.id)).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await GET(
          new Request(
            `http://local.test/api/lease-renewal/collections?id=${c.collection.id}`,
          ),
        )
      ).status,
    ).toBe(200);
    const request = (body: unknown) =>
      new Request("http://local.test/api/lease-renewal/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await POST(request({ ...prepare(), ownerUid: b.uid }))).status).toBe(400);
    fixture.user = { ...a, uid: "canary-editor", email: "canary-editor@pmikcmetro.com" };
    expect((await POST(request(prepare()))).status).toBe(403);
    await expect(store.review(fixture.user, prepare(), source())).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      store.get(
        { ...a, hd: "other.example", email: "external@other.example" },
        c.collection.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await GET(new Request("http://local.test/api/lease-renewal/collections?id=guess")))
        .status,
    ).toBe(400);
  });
});
