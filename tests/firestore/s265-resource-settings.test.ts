import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

// S265 AC-S265-1 (R-S265-1, ARCH-S265-1, ARCH-S265-3) through the actual resource-locations route
// on the emulator: the Admin-only save, the exact versioned compare-and-save, idempotent replay and
// private history. The server binds each tenant audience check to the entry's purpose and exact
// link and gives it a proof identity and version; a same-link change is a new proof, an unchanged
// re-save keeps it. A stale save, an Editor save, a check on a legal-form location and a check
// dated later than today are refused without a write. Synthetic values only.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  role: "Admin",
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  const actor = () => ({
    uid: "s265-admin",
    email: "s265-admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: state.role,
  });
  return {
    ...actual,
    requireCapability: async () => actor(),
    requireCapabilityInSpace: async () => actor(),
  };
});

import { GET, POST } from "@/app/api/lease-renewal/resource-locations/route";
import { RENEWAL_RESOURCE_COLLECTIONS } from "@/lib/firestore/renewal-resource-locations";
import {
  TENANT_RESOURCE_PURPOSES,
  tenantResourceUse,
} from "@/lib/lease-renewal/tenant-resource-evidence";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";

const projectId = "demo-pmi-s265-resource-settings";
let app: App, db: Firestore, testEnv: RulesTestEnvironment;
const URL_A = "https://fixture-rental.net/insurance-flyer.pdf";
// Real calendar dates relative to the run: the emulator lane keeps real timers.
const DAY_MS = 86_400_000;
const today = () => businessDateIso(Date.now());
const check = {
  documentVersion: "Insurance flyer 2026-11",
  audience: { kind: "tenant_wide" },
  method: "signed_out_open",
  result: "current_document",
  checkedBy: "Fixture Resource Owner",
  checkedOn: businessDateIso(Date.now() - DAY_MS),
  validUntil: businessDateIso(Date.now() + 60 * DAY_MS),
};
function post(body: unknown) {
  return POST(
    new Request("http://fixture.invalid/api/lease-renewal/resource-locations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
async function settings() {
  return (await (await GET()).json()).settings;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s265-resource-settings-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  state.role = "Admin";
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

describe("S265 AC-S265-1: the tenant audience check through the existing versioned save", () => {
  it("binds a check to the entry's purpose and exact link with a proof identity and version, and reads it back as usable", async () => {
    const first = await post({
      expectedVersion: 0,
      operationId: "a5c1b7f2-0f4c-4d77-9a54-0b9d0d265001",
      resource: {
        id: "insurance_flyer",
        url: URL_A,
        verified: true,
        tenantAccess: check,
      },
    });
    expect(first.status).toBe(200);
    const read = await settings();
    expect(read.version).toBe(1);
    const stored = read.entries.insurance_flyer;
    expect(stored).toMatchObject({
      id: "insurance_flyer",
      url: URL_A,
      verified: true,
      recordedByUid: "s265-admin",
      tenantAccess: {
        ...check,
        purpose: TENANT_RESOURCE_PURPOSES.insurance_flyer,
        destination: URL_A,
        proof: { version: 1 },
      },
    });
    expect(stored.tenantAccess.proof.id).toMatch(/^[a-f0-9]{32}$/);
    expect(tenantResourceUse("insurance_flyer", stored, today()).state).toBe("usable");
    // The same request replays as a duplicate; nothing changes.
    expect(
      await (
        await post({
          expectedVersion: 0,
          operationId: "a5c1b7f2-0f4c-4d77-9a54-0b9d0d265001",
          resource: {
            id: "insurance_flyer",
            url: URL_A,
            verified: true,
            tenantAccess: check,
          },
        })
      ).json(),
    ).toMatchObject({ duplicate: true, settings: { version: 1 } });

    // An unchanged re-save keeps the proof; a same-link change is a new proof and version.
    expect(
      (
        await post({
          expectedVersion: 1,
          operationId: "a5c1b7f2-0f4c-4d77-9a54-0b9d0d265002",
          resource: {
            id: "insurance_flyer",
            url: URL_A,
            verified: true,
            tenantAccess: check,
          },
        })
      ).status,
    ).toBe(200);
    const kept = (await settings()).entries.insurance_flyer.tenantAccess.proof;
    expect(kept).toEqual(stored.tenantAccess.proof);
    expect(
      (
        await post({
          expectedVersion: 2,
          operationId: "a5c1b7f2-0f4c-4d77-9a54-0b9d0d265003",
          resource: {
            id: "insurance_flyer",
            url: URL_A,
            verified: true,
            tenantAccess: { ...check, documentVersion: "Insurance flyer 2026-12" },
          },
        })
      ).status,
    ).toBe(200);
    const changed = (await settings()).entries.insurance_flyer.tenantAccess.proof;
    expect(changed.version).toBe(3);
    expect(changed.id).not.toBe(stored.tenantAccess.proof.id);
    const history = await db.collection(RENEWAL_RESOURCE_COLLECTIONS.activity).get();
    expect(history.size).toBe(3);
    expect(
      history.docs
        .find((doc) => doc.id === "a5c1b7f2-0f4c-4d77-9a54-0b9d0d265003")
        ?.data(),
    ).toMatchObject({
      actor_uid: "s265-admin",
      resource_id: "insurance_flyer",
      prior: { tenantAccess: { documentVersion: "Insurance flyer 2026-11" } },
      next: { tenantAccess: { documentVersion: "Insurance flyer 2026-12" } },
    });

    // Revoking the check is a saved change; the same link is Source pending again.
    expect(
      (
        await post({
          expectedVersion: 3,
          operationId: "a5c1b7f2-0f4c-4d77-9a54-0b9d0d265004",
          resource: { id: "insurance_flyer", url: URL_A, verified: true },
        })
      ).status,
    ).toBe(200);
    const revoked = (await settings()).entries.insurance_flyer;
    expect(revoked.tenantAccess).toBeUndefined();
    expect(tenantResourceUse("insurance_flyer", revoked, today())).toMatchObject({
      state: "source_pending",
      code: "no_audience_check",
    });
  });

  it("refuses a stale save, an Editor save, a check on a legal location and a future check date without writing", async () => {
    expect(
      (
        await post({
          expectedVersion: 0,
          operationId: "b5c1b7f2-0f4c-4d77-9a54-0b9d0d265001",
          resource: { id: "insurance_flyer", url: URL_A, verified: true },
        })
      ).status,
    ).toBe(200);
    const stale = await post({
      expectedVersion: 0,
      operationId: "b5c1b7f2-0f4c-4d77-9a54-0b9d0d265002",
      resource: {
        id: "insurance_flyer",
        url: URL_A,
        verified: true,
        tenantAccess: check,
      },
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe(
      "Another operator changed the links. Reload before saving.",
    );
    const legal = await post({
      expectedVersion: 1,
      operationId: "b5c1b7f2-0f4c-4d77-9a54-0b9d0d265003",
      resource: {
        id: "standard_lease",
        url: "https://fixture-rental.net/lease.pdf",
        verified: true,
        tenantAccess: check,
      },
    });
    expect(legal.status).toBe(400);
    const future = await post({
      expectedVersion: 1,
      operationId: "b5c1b7f2-0f4c-4d77-9a54-0b9d0d265004",
      resource: {
        id: "insurance_flyer",
        url: URL_A,
        verified: true,
        tenantAccess: { ...check, checkedOn: businessDateIso(Date.now() + 2 * DAY_MS) },
      },
    });
    expect(future.status).toBe(400);
    expect((await future.json()).error).toBe(
      "The check date cannot be later than today.",
    );
    state.role = "Editor";
    expect(
      (
        await post({
          expectedVersion: 1,
          operationId: "b5c1b7f2-0f4c-4d77-9a54-0b9d0d265005",
          resource: {
            id: "insurance_flyer",
            url: URL_A,
            verified: true,
            tenantAccess: check,
          },
        })
      ).status,
    ).toBe(403);
    const read = await settings();
    expect(read.version).toBe(1);
    expect(read.entries.insurance_flyer.tenantAccess).toBeUndefined();
    expect(read.entries.standard_lease).toBeUndefined();
  });

  it("reads a legacy record saved before S265 unchanged and Source pending for tenants", async () => {
    await db
      .collection(RENEWAL_RESOURCE_COLLECTIONS.settings)
      .doc("current")
      .set({
        version: 16,
        entries: {
          renewal_information_form: {
            id: "renewal_information_form",
            url: "https://fixture-rental.net/renewal-form",
            verified: true,
            recordedAt: "2026-09-15T10:00:00.000Z",
            recordedByUid: "fixture-admin",
          },
        },
      });
    const read = await settings();
    expect(read.version).toBe(16);
    expect(
      tenantResourceUse(
        "renewal_information_form",
        read.entries.renewal_information_form,
        today(),
      ),
    ).toMatchObject({ state: "source_pending", code: "no_audience_check" });
  });
});
