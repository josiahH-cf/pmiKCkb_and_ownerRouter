import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { SearchResult } from "@/lib/search/entity-types";
import type { RawLease } from "@/lib/integrations/rentvine/client";
const fixture = vi.hoisted(() => ({
  db: null as Firestore | null,
  views: [] as RawLease[],
  fail: false,
  partial: false,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: {} }),
}));
vi.mock("@/lib/lease-renewal/admitted-notice-source", () => ({
  readCoherentRenewalDisplaySource: async () => {
    if (fixture.fail) throw Error("PRIVATE_PROVIDER_BODY");
    return {
      snapshot: {
        views: fixture.views,
        complete: !fixture.partial,
        readAtMs: Date.parse("2026-10-09T15:00:00Z"),
      },
      currency: { state: fixture.partial ? "stale" : "fresh" },
    };
  },
}));
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  createMaintenanceTicket,
  MAINTENANCE_TICKET_COLLECTIONS as M,
} from "@/lib/firestore/maintenance-tickets";
import { VENDOR_COLLECTIONS as V } from "@/lib/firestore/vendors";
import { searchEntities, readSearchEntity } from "@/lib/search/server-search";
import { GET } from "@/app/api/search/entities/route";
const staff: AuthenticatedUser = {
  uid: "search-managed-staff",
  email: "search-managed-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
let env: RulesTestEnvironment,
  app: ReturnType<typeof initializeApp>,
  db: Firestore,
  ticketId: string;
const url = (query: string) =>
  new Request(`http://local.test/api/search/entities?${query}`);
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-s203-search-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-s203-search-test" },
    `entity-search-${process.pid}`,
  );
  fixture.db = db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await env.clearFirestore();
  fixture.fail = fixture.partial = false;
  fixture.views = [
    {
      leaseID: 701,
      unit: { unitID: 801, address: "East 123 Fixture Lane" },
      property: {
        propertyID: 901,
        name: "Miller property",
        owners: [{ contactID: 101, name: "Miller owner" }],
      },
      tenants: [{ contactID: 201, name: "Miller resident" }],
      description: "PRIVATE_LEASE_BODY",
    },
  ];
  setAuthResolverForTest(() => staff);
  const ticket = await createMaintenanceTicket(
    staff,
    {
      summary: "Miller dripping fixture",
      description: "PRIVATE_TICKET_BODY",
      priority: "Normal",
      unit: {
        unitId: "unit:801",
        label: "East 123 Fixture Lane",
        confidence: "Verified",
      },
    },
    db,
    "901",
  );
  ticketId = ticket.id;
  await db.collection(V.vendors).doc("vendor-1").set({
    id: "vendor-1",
    uid: "vendor-uid",
    email: "miller-vendor@example.invalid",
    status: "active",
    displayName: "Miller Plumbing",
    data_mode: "live",
    inviteVersion: 1,
    createdAt: "2026-10-09T15:00:00Z",
    updatedAt: "2026-10-09T15:00:00Z",
    privateText: "PRIVATE_VENDOR_BODY",
  });
});
afterAll(async () => {
  setAuthResolverForTest(null);
  await env.cleanup();
  await deleteApp(app);
  vi.unstubAllEnvs();
});
it("actual authenticated HTTP returns every supported metadata type, labeled relations and real destinations without body content", async () => {
  const response = await GET(url("q=Miller&type=all&limit=50"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const result = await response.json();
  expect(new Set(result.results.map((r: SearchResult) => r.entity.type))).toEqual(
    new Set(["lease", "owner", "resident", "property", "unit", "ticket", "vendor"]),
  );
  expect(
    result.results.find((r: SearchResult) => r.entity.type === "ticket").entity.href,
  ).toBe(`/maintenance?ticket_id=${ticketId}`);
  expect(result.limitations).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);
  expect((await db.collection("action_executions").get()).empty).toBe(true);
});
it("fresh edits, deletes and vendor suspension supersede previous index metadata, including selected-result hydration", async () => {
  await searchEntities(staff, { q: "Miller" });
  await db
    .collection(M.tickets)
    .doc(ticketId)
    .update({ summary: "Repaired kitchen fixture" });
  expect((await searchEntities(staff, { q: "Miller", type: "ticket" })).results).toEqual(
    [],
  );
  expect(
    (await searchEntities(staff, { q: "Repaired", type: "ticket" })).results[0].entity.id,
  ).toBe(ticketId);
  await db.collection(M.tickets).doc(ticketId).delete();
  expect((await readSearchEntity(staff, "ticket", ticketId)).entity).toBeNull();
  await db.collection(V.vendors).doc("vendor-1").update({ status: "disabled" });
  expect((await readSearchEntity(staff, "vendor", "vendor-1")).entity).toBeNull();
  expect((await searchEntities(staff, { q: "Miller", type: "vendor" })).results).toEqual(
    [],
  );
});
it("a failed source replaces its former cache with an explicit partial result and recovers without serving an old identity", async () => {
  await searchEntities(staff, { q: "Miller" });
  fixture.fail = true;
  const failed = await searchEntities(staff, { q: "Miller" });
  expect(failed.results.map((r) => r.entity.type).sort()).toEqual(["ticket", "vendor"]);
  expect(failed.limitations).toEqual([
    expect.objectContaining({ source: "renewals", status: "unavailable" }),
  ]);
  expect(JSON.stringify(failed)).not.toContain("PRIVATE_PROVIDER_BODY");
  fixture.fail = false;
  fixture.views = [];
  expect(
    (await searchEntities(staff, { q: "Miller" })).results
      .map((r) => r.entity.type)
      .sort(),
  ).toEqual(["ticket", "vendor"]);
  fixture.partial = true;
  expect((await searchEntities(staff, { q: "nothing" })).limitations[0]).toMatchObject({
    source: "renewals",
    status: "partial",
  });
});
it("refuses current external/vendor/unmanaged identities before any result or old cache and does not invent an internal Space restriction", async () => {
  await searchEntities(staff, { q: "Miller" });
  for (const actor of [
    { ...staff, hd: "external.invalid", email: "external@external.invalid" },
    { ...staff, role: "Vendor" },
  ])
    await expect(
      searchEntities(actor as AuthenticatedUser, { q: "Miller" }),
    ).rejects.toMatchObject({ status: 403 });
  setAuthResolverForTest(() => null);
  expect((await GET(url("q=Miller"))).status).toBe(401);
  setAuthResolverForTest(() => ({ ...staff, uid: "different-managed-staff" }));
  expect((await GET(url("q=Miller"))).status).toBe(200);
});
it("bounds HTTP input, ignores non-Live and incomplete vendor enrollment, and treats punctuation literally", async () => {
  for (const query of [
    "q=Miller&q=other",
    "q=Miller&actorUid=forged",
    "q=Miller&type=secret",
    "q=Miller&limit=51",
  ])
    expect((await GET(url(query))).status).toBe(400);
  await db
    .collection(V.vendors)
    .doc("vendor-1")
    .update({ setupEffectFence: { pending: true } });
  expect((await searchEntities(staff, { q: "Miller", type: "vendor" })).results).toEqual(
    [],
  );
  await db.collection(M.tickets).doc(ticketId).update({ data_mode: "test" });
  expect((await searchEntities(staff, { q: "Miller", type: "ticket" })).results).toEqual(
    [],
  );
  const response = await GET(url("q=.*&type=all"));
  expect((await response.json()).results).toEqual([]);
});
