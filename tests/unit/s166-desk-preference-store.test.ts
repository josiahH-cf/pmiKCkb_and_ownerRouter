import { readFileSync } from "node:fs";

import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { decideLiveReadonlyRequest } from "@/lib/environment/live-readonly-request-policy";
import {
  RENEWAL_CONTROL_INVENTORY,
  RENEWAL_GOVERNANCE_MATRIX,
  RENEWAL_ROUTE_INVENTORY,
} from "@/lib/lease-renewal/role-action-governance";

// S166 (F15): the account-owned worklist view store and its route, against an in-memory Admin
// Firestore double. The emulator test (tests/firestore/s166-desk-preferences.test.ts) covers the
// real store and the client rules boundary. Synthetic accounts only.

const state = vi.hoisted(() => ({
  user: null as unknown as AuthenticatedUser,
  db: null as unknown as Firestore,
}));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => state.user,
}));

import { GET, POST } from "@/app/api/lease-renewal/desk-preferences/route";
import {
  RENEWAL_DESK_PREFERENCE_COLLECTION,
  deskPreferenceModeFor,
  getRenewalDeskPreference,
  renewalDeskPreferenceDocId,
  saveRenewalDeskPreference as savePreferenceWithRevision,
} from "@/lib/firestore/renewal-desk-preferences";

// S177 clients read the current revision before making a deliberate replacement.
async function saveRenewalDeskPreference(
  actor: AuthenticatedUser,
  input: { query: string },
  db: Firestore,
  now?: () => Date,
) {
  const current = await getRenewalDeskPreference(actor, db);
  return savePreferenceWithRevision(
    actor,
    { ...input, expectedRevision: current?.revision ?? 0 },
    db,
    now,
  );
}

function fakeDb() {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const db = {
    async runTransaction(
      work: (transaction: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (ref: { set: (value: unknown) => Promise<void> }, value: unknown) => void;
      }) => Promise<unknown>,
    ) {
      const writes: Promise<void>[] = [];
      const result = await work({
        get: (ref) => ref.get(),
        set: (ref, value) => {
          writes.push(ref.set(value));
        },
      });
      await Promise.all(writes);
      return result;
    },
    collection(name: string) {
      const documents = col(name);
      return {
        doc: (id: string) => ({
          id,
          async get() {
            return { exists: documents.has(id), id, data: () => documents.get(id) };
          },
          async set(data: Record<string, unknown>) {
            documents.set(id, structuredClone(data));
          },
        }),
      };
    },
  };
  return { db: db as unknown as Firestore, store };
}

const pat: AuthenticatedUser = {
  uid: "uid-pat",
  email: "pat.sample@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const lee: AuthenticatedUser = {
  uid: "uid-lee",
  email: "lee.sample@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const canary: AuthenticatedUser = {
  uid: "uid-canary",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

const SAVED = "v=2&sort=end_date&direction=desc&scope=all";

function post(body: unknown): Request {
  return new Request("http://localhost/api/lease-renewal/desk-preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      body && typeof body === "object"
        ? {
            ...body,
            expectedRevision:
              (fake.store
                .get(RENEWAL_DESK_PREFERENCE_COLLECTION)
                ?.get(renewalDeskPreferenceDocId(state.user.uid))?.revision as
                | number
                | undefined) ?? 0,
          }
        : body,
    ),
  });
}

let fake: ReturnType<typeof fakeDb>;

beforeEach(() => {
  fake = fakeDb();
  state.db = fake.db;
  state.user = pat;
});

describe("S166 account-owned worklist view store (ARCH-S166-2)", () => {
  it("BEH-S166-5 / BEH-S166-6: a deliberate change is stored for the account and read back in a later session", async () => {
    expect(await getRenewalDeskPreference(pat, fake.db)).toBeNull();
    const saved = await saveRenewalDeskPreference(
      pat,
      { query: "v=2&direction=desc&sort=end_date&scope=all" },
      fake.db,
    );
    expect(saved.view).toBe(SAVED);
    // A fresh read with nothing but the account: no browser state is involved.
    expect(await getRenewalDeskPreference({ ...pat }, fake.db)).toMatchObject({
      view: SAVED,
    });
    const stored = fake.store
      .get(RENEWAL_DESK_PREFERENCE_COLLECTION)!
      .get(renewalDeskPreferenceDocId(pat.uid));
    expect(stored).toMatchObject({
      schemaVersion: "renewal-desk-preference/v1",
      uid: pat.uid,
      view: SAVED,
    });
    // Only the canonical view is kept: no name, address or label.
    expect(Object.keys(stored!).sort()).toEqual([
      "revision",
      "schemaVersion",
      "uid",
      "updatedAt",
      "view",
    ]);
  });

  it("BEH-S166-7: clearing persists the default and a later session opens the default", async () => {
    await saveRenewalDeskPreference(pat, { query: SAVED }, fake.db);
    const cleared = await saveRenewalDeskPreference(pat, { query: "v=2" }, fake.db);
    expect(cleared.view).toBe("");
    expect(await getRenewalDeskPreference(pat, fake.db)).toMatchObject({ view: "" });
    expect(fake.store.get(RENEWAL_DESK_PREFERENCE_COLLECTION)!.size).toBe(1);
  });

  it("BEH-S166-11 / AC-S166-2: two accounts keep separate views and neither write touches the other", async () => {
    await saveRenewalDeskPreference(pat, { query: SAVED }, fake.db);
    await saveRenewalDeskPreference(lee, { query: "v=2&overallStatus=blocked" }, fake.db);
    expect((await getRenewalDeskPreference(pat, fake.db))?.view).toBe(SAVED);
    expect((await getRenewalDeskPreference(lee, fake.db))?.view).toBe(
      "v=2&overallStatus=blocked",
    );
    await saveRenewalDeskPreference(lee, { query: "v=2" }, fake.db);
    expect((await getRenewalDeskPreference(pat, fake.db))?.view).toBe(SAVED);
    expect(renewalDeskPreferenceDocId(pat.uid)).not.toBe(
      renewalDeskPreferenceDocId(lee.uid),
    );
    expect(renewalDeskPreferenceDocId(pat.uid)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("BEH-S166-11: a document that names another account is never returned", async () => {
    await saveRenewalDeskPreference(lee, { query: SAVED }, fake.db);
    const documents = fake.store.get(RENEWAL_DESK_PREFERENCE_COLLECTION)!;
    // A misfiled copy under Pat's key still names Lee, so Pat gets no preference.
    documents.set(
      renewalDeskPreferenceDocId(pat.uid),
      documents.get(renewalDeskPreferenceDocId(lee.uid))!,
    );
    expect(await getRenewalDeskPreference(pat, fake.db)).toBeNull();
  });

  it("BEH-S166-10 / AC-S166-3: a stored view that no longer validates reads as no preference and is not rewritten", async () => {
    const documents = new Map<string, Record<string, unknown>>();
    fake.store.set(RENEWAL_DESK_PREFERENCE_COLLECTION, documents);
    const id = renewalDeskPreferenceDocId(pat.uid);
    for (const view of ["v=2&scope=retired_scope", "v=1", 12, null]) {
      const document = {
        schemaVersion: "renewal-desk-preference/v1",
        uid: pat.uid,
        view,
        updatedAt: "2026-10-01T15:00:00.000Z",
      };
      documents.set(id, document);
      expect(await getRenewalDeskPreference(pat, fake.db)).toBeNull();
      expect(documents.get(id)).toBe(document);
    }
    documents.set(id, { unexpected: true });
    expect(await getRenewalDeskPreference(pat, fake.db)).toBeNull();
  });

  it("BEH-S166-10: a request that is not a desk view is refused and nothing is stored", async () => {
    for (const query of ["", "scope=all", "v=3&scope=all", "?v=2"]) {
      await expect(
        saveRenewalDeskPreference(pat, { query }, fake.db),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(fake.store.get(RENEWAL_DESK_PREFERENCE_COLLECTION)?.size ?? 0).toBe(0);
  });

  it("keeps a verification account effect-free: its write is refused and its read is empty", async () => {
    await expect(
      saveRenewalDeskPreference(canary, { query: SAVED }, fake.db),
    ).rejects.toMatchObject({ status: 403 });
    expect(fake.store.get(RENEWAL_DESK_PREFERENCE_COLLECTION)?.size ?? 0).toBe(0);
    expect(await getRenewalDeskPreference(canary, fake.db)).toBeNull();
    expect(deskPreferenceModeFor(canary, {})).toBe("verification");
  });

  it("reports where the view can be remembered", () => {
    expect(
      deskPreferenceModeFor(pat, {
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
      }),
    ).toBe("saved");
    // The local Live read-only rehearsal keeps nothing unless Firestore is a local emulator.
    const rehearsal = { ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "live_readonly" };
    expect(deskPreferenceModeFor(pat, rehearsal)).toBe("unavailable");
    expect(
      deskPreferenceModeFor(pat, {
        ...rehearsal,
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:1",
      }),
    ).toBe("saved");
    expect(deskPreferenceModeFor(pat, { ENVIRONMENT_KIND: "nonsense" })).toBe(
      "unavailable",
    );
  });
});

describe("S166 worklist view route (ARCH-S166-2)", () => {
  it("BEH-S166-5 / BEH-S166-6: POST stores the signed-in account's view and GET returns it", async () => {
    const response = await POST(post({ query: SAVED }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ preference: { view: SAVED } });
    const read = await GET();
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.json()).toMatchObject({ preference: { view: SAVED } });
  });

  it("BEH-S166-11 / AC-S166-2: the account comes from the session, never the body", async () => {
    const refused = await POST(post({ query: SAVED, uid: lee.uid }));
    expect(refused.status).toBe(400);
    await POST(post({ query: SAVED }));
    state.user = lee;
    expect(await (await GET()).json()).toEqual({ preference: null });
    state.user = pat;
    expect(await (await GET()).json()).toMatchObject({ preference: { view: SAVED } });
  });

  it("refuses a verification account's write the way neighbouring stores do", async () => {
    state.user = canary;
    const response = await POST(post({ query: SAVED }));
    expect(response.status).toBe(403);
    expect(fake.store.get(RENEWAL_DESK_PREFERENCE_COLLECTION)?.size ?? 0).toBe(0);
  });

  it("refuses a malformed body without storing anything", async () => {
    expect((await POST(post({ query: "scope=all" }))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(400);
    expect(fake.store.get(RENEWAL_DESK_PREFERENCE_COLLECTION)?.size ?? 0).toBe(0);
  });
});

describe("S166 governance and environment registration", () => {
  it("registers the route, the control and one account-scoped matrix row", () => {
    expect(RENEWAL_GOVERNANCE_MATRIX.save_desk_preference).toMatchObject({
      roleCapability: "read",
      effect: "app_owned_write",
      externalRequirement: "none",
      actionKeys: [],
      exactConfirmation: false,
    });
    const source = "app/api/lease-renewal/desk-preferences/route.ts";
    expect(
      RENEWAL_ROUTE_INVENTORY.filter((entry) => entry.source === source).map((entry) => [
        entry.kind === "api" ? entry.method : null,
        entry.capability,
      ]),
    ).toEqual([
      ["GET", "read_workspace"],
      ["POST", "save_desk_preference"],
    ]);
    expect(
      RENEWAL_CONTROL_INVENTORY.filter(
        (entry) => entry.capability === "save_desk_preference",
      ),
    ).toEqual([
      expect.objectContaining({
        source: "components/lease-renewal/RenewalDeskViewMemory.tsx",
        enforcementSources: [source],
      }),
    ]);
    const body = readFileSync(source, "utf8");
    expect(body).toContain('renewalRoleCapability("save_desk_preference")');
    expect(body).toContain('renewalRoleCapability("read_workspace")');
  });

  it("allows the write under Live read-only only against a local emulator", () => {
    const descriptor = {
      ok: true as const,
      descriptor: {
        dataContext: "live_readonly" as const,
        environmentKind: "demo" as const,
        source: "explicit" as const,
      },
    };
    const request = {
      descriptor,
      method: "POST",
      pathname: "/api/lease-renewal/desk-preferences",
    };
    expect(decideLiveReadonlyRequest(request).allowed).toBe(false);
    expect(
      decideLiveReadonlyRequest({ ...request, firestoreEmulator: true }).allowed,
    ).toBe(true);
    expect(
      decideLiveReadonlyRequest({
        ...request,
        pathname: "/api/lease-renewal/desk-preferences/other",
        firestoreEmulator: true,
      }).allowed,
    ).toBe(false);
  });

  it("BEH-S166-13: the preference store is its own collection and reads no account history", () => {
    const store = readFileSync("lib/firestore/renewal-desk-preferences.ts", "utf8");
    expect(store).not.toMatch(/assistant-history|assistant_history|saved-questions/);
    expect(RENEWAL_DESK_PREFERENCE_COLLECTION).toBe("renewal_desk_preferences");
    const rules = readFileSync("firestore.rules", "utf8");
    // Server-only: no client rule names the collection, so the deny-all catch-all applies.
    expect(rules).not.toContain(RENEWAL_DESK_PREFERENCE_COLLECTION);
  });
});
