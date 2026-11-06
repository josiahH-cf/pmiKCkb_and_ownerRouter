import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S249 review fixes on the local Firestore emulator (synthetic values only; no provider, mailbox
// or production resource is reached):
//   B  the allowance check and the reservation are one transaction, so two sessions at 49 of 50
//      cannot both dispatch, through the store and through the mounted market-comps route;
//   G  every saved change of the automatic-start setting writes its history row in the same
//      transaction (who, when, why, before and after), and a refused change writes none;
//   D  the created Gmail drafts are read from the recorded outcomes, so a later preview that was
//      cancelled never hides the draft that is in Gmail.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: null as AuthenticatedUser | null,
  dispatches: 0,
  release: null as null | (() => void),
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => state.actor,
}));
vi.mock("@/lib/config/server", async (original) => ({
  ...(await original<typeof import("@/lib/config/server")>()),
  readServerConfig: () => ({
    allowedHostedDomain: "pmikcmetro.com",
    marketCompProvider: "rentcast",
    rentcastApiKey: "synthetic-rentcast-key",
  }),
}));
// The gate stays the real decision elsewhere; here it lets the call through so the reservation is
// what decides how many sessions dispatch.
vi.mock("@/lib/operations/runtime-suspension-gate", async (original) => ({
  ...(await original<typeof import("@/lib/operations/runtime-suspension-gate")>()),
  assertProductionRuntimeActionExecutable: async () => undefined,
  runProductionRuntimeGatedAction: async (_key: string, effect: () => unknown) =>
    effect(),
}));
vi.mock("@/lib/lease-renewal/market-comp-query-resolver", () => ({
  resolveCurrentMarketCompQueryBasis: async (_actor: unknown, leaseId: string) => ({
    leaseId,
    addressLabel: `Emulator subject address ${leaseId}`,
    policy: {
      maxRadiusMiles: 2,
      requestedCompCount: 15,
      lookupSubjectAttributes: true,
      providerVersion: "rentcast-avm-long-term-v1",
    },
    query: { bedrooms: 2 },
    attributes: [],
    baseRent: { status: "verified", value: 1200, sourcePath: "lease detail" },
    trendPostalCode: "64118",
  }),
}));
vi.mock(
  "@/lib/lease-renewal/providers/rentcast-market-comp-provider",
  async (original) => {
    const actual =
      await original<
        typeof import("@/lib/lease-renewal/providers/rentcast-market-comp-provider")
      >();
    class CountingProvider {
      async lookup() {
        state.dispatches += 1;
        // Hold the call open, so both sessions are in flight together.
        await new Promise<void>((resolve) => {
          state.release = resolve;
          setTimeout(resolve, 200);
        });
        return {
          rangeLow: 1100,
          rangeHigh: 1300,
          pointEstimate: 1200,
          compCount: 3,
          comparables: [{ rent: 1200, correlation: 0.9 }],
          source: "RentCast",
          retrievedAt: "2026-11-05T15:00:00.000Z",
          confidence: "Likely",
          billed: true,
        };
      }
      async lookupTrend() {
        throw new Error("not used");
      }
    }
    return { ...actual, RentCastMarketCompProvider: CountingProvider };
  },
);

import {
  POST as marketComps,
  resetMarketCompsCacheForTests,
} from "@/app/api/lease-renewal/market-comps/route";
import {
  KICKOFF_SETTING_AUDIT_COLLECTION,
  listKickoffSettingHistory,
  readKickoffAutomaticStart,
  saveKickoffAutomaticStart,
} from "@/lib/firestore/renewal-kickoff-settings";
import {
  getCreatedMessageDrafts,
  MESSAGE_DRAFT_COLLECTIONS,
} from "@/lib/firestore/renewal-message-drafts";
import {
  createRentcastUsageStore,
  RENTCAST_USAGE_COLLECTION,
  rentcastMonthKey,
  rentcastUsedCalls,
} from "@/lib/firestore/rentcast-usage";

const projectId = "pmi-kc-kb-s249-kickoff-backend-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const ALLOWANCE = 50;
const MONTH = rentcastMonthKey(Date.now());

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s249-kickoff-backend-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("RENTCAST_MONTHLY_ALLOWANCE", String(ALLOWANCE));
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  state.actor = editor;
  state.dispatches = 0;
  resetMarketCompsCacheForTests();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function seedBilled(billed: number) {
  await db
    .collection(RENTCAST_USAGE_COLLECTION)
    .doc(MONTH)
    .set({ billed_calls: billed, updated_at: "2026-11-05T15:00:00.000Z" });
}

describe("S249 B: the allowance check and the reservation are one transaction", () => {
  it("two concurrent reservations at 49 of 50: exactly one is granted", async () => {
    await seedBilled(49);
    const store = createRentcastUsageStore(editor, db);
    const results = await Promise.all([
      store.reserveMonth(MONTH, { allowance: ALLOWANCE, reservationId: "a1b2c3d4-0001" }),
      store.reserveMonth(MONTH, { allowance: ALLOWANCE, reservationId: "a1b2c3d4-0002" }),
    ]);
    expect(results.filter((result) => result.reserved)).toHaveLength(1);
    const usage = await store.readMonth(MONTH);
    expect(usage).toMatchObject({ billedCalls: 49, heldCalls: 1 });
    expect(rentcastUsedCalls(usage)).toBe(50);
  });

  it("two concurrent market-comps lookups at 49 of 50: exactly one dispatches and the count ends at 50", async () => {
    await seedBilled(49);
    const call = (leaseId: string) =>
      marketComps(
        new Request("http://local.test/api/lease-renewal/market-comps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leaseId }),
        }),
      );
    // Two different leases, so neither is answered from the result cache.
    const answers = await Promise.all([call("701"), call("702")]);
    const bodies = await Promise.all(answers.map((answer) => answer.json()));
    expect(state.dispatches).toBe(1);
    expect(bodies.filter((body) => body.reason === "out_of_allowance")).toHaveLength(1);
    expect(bodies.filter((body) => body.confidence === "Likely")).toHaveLength(1);
    const usage = await createRentcastUsageStore(editor, db).readMonth(MONTH);
    expect(usage).toMatchObject({ billedCalls: 50, heldCalls: 0 });
  });

  it("a released place is free again; an uncertain one stays held for the month", async () => {
    await seedBilled(48);
    const store = createRentcastUsageStore(editor, db);
    await store.reserveMonth(MONTH, {
      allowance: ALLOWANCE,
      reservationId: "b1b2c3d4-0001",
    });
    await store.reserveMonth(MONTH, {
      allowance: ALLOWANCE,
      reservationId: "b1b2c3d4-0002",
    });
    expect(
      (
        await store.reserveMonth(MONTH, {
          allowance: ALLOWANCE,
          reservationId: "b1b2c3d4-0003",
        })
      ).reserved,
    ).toBe(false);
    await store.settleReservation(MONTH, "b1b2c3d4-0001", "released");
    await store.settleReservation(MONTH, "b1b2c3d4-0002", "uncertain");
    // An uncertain place is never released later.
    await store.settleReservation(MONTH, "b1b2c3d4-0002", "released");
    expect(await store.readMonth(MONTH)).toMatchObject({ billedCalls: 48, heldCalls: 1 });
    expect(
      (
        await store.reserveMonth(MONTH, {
          allowance: ALLOWANCE,
          reservationId: "b1b2c3d4-0004",
        })
      ).reserved,
    ).toBe(true);
  });

  it("an increment keeps the places held by calls in flight", async () => {
    const store = createRentcastUsageStore(editor, db);
    await store.reserveMonth(MONTH, {
      allowance: ALLOWANCE,
      reservationId: "c1b2c3d4-0001",
    });
    await store.incrementMonth(MONTH, 1);
    expect(await store.readMonth(MONTH)).toMatchObject({ billedCalls: 1, heldCalls: 1 });
  });
});

describe("S249 G: the automatic-start setting keeps its change history", () => {
  it("a saved change writes one history row with who, when, why and the state before and after", async () => {
    const saved = await saveKickoffAutomaticStart(
      admin,
      {
        enabled: false,
        expectedVersion: 0,
        reason: "Pausing while the allowance is reviewed.",
        nowIso: "2026-11-05T16:00:00.000Z",
      },
      db,
    );
    expect(saved).toMatchObject({ enabled: false, version: 1 });
    await saveKickoffAutomaticStart(
      admin,
      {
        enabled: true,
        expectedVersion: 1,
        reason: "Allowance reviewed.",
        nowIso: "2026-11-05T17:00:00.000Z",
      },
      db,
    );
    const history = await listKickoffSettingHistory(10, db);
    expect(history).toEqual([
      {
        setting: "renewal_kickoff_automatic_start",
        action: "changed",
        actorUid: "admin-1",
        actorEmail: "admin1@pmikcmetro.com",
        at: "2026-11-05T17:00:00.000Z",
        reason: "Allowance reviewed.",
        before: { enabled: false, version: 1 },
        after: { enabled: true, version: 2 },
      },
      {
        setting: "renewal_kickoff_automatic_start",
        action: "changed",
        actorUid: "admin-1",
        actorEmail: "admin1@pmikcmetro.com",
        at: "2026-11-05T16:00:00.000Z",
        reason: "Pausing while the allowance is reviewed.",
        before: { enabled: true, version: 0 },
        after: { enabled: false, version: 1 },
      },
    ]);
    expect((await readKickoffAutomaticStart(db)).version).toBe(2);
  });

  it("a refused change (a stale version or a non-Admin) writes no history and no setting", async () => {
    await expect(
      saveKickoffAutomaticStart(
        admin,
        { enabled: false, expectedVersion: 4, reason: "Stale view." },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      saveKickoffAutomaticStart(
        editor,
        { enabled: false, expectedVersion: 0, reason: "Not an Admin." },
        db,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await db.collection(KICKOFF_SETTING_AUDIT_COLLECTION).get()).size).toBe(0);
    expect((await readKickoffAutomaticStart(db)).version).toBe(0);
  });
});

describe("S249 D: the created Gmail drafts come from the recorded outcomes", () => {
  const CYCLE = "6c37bdcd-8264-4249-813f-0289307dd725";
  async function attempt(
    id: string,
    recordedAt: string,
    body: string,
    outcome: Record<string, unknown> | null,
    overrides: Record<string, unknown> = {},
  ) {
    await db
      .collection(MESSAGE_DRAFT_COLLECTIONS.snapshots)
      .doc(id)
      .set({
        leaseId: "9101",
        cycleId: CYCLE,
        channel: "owner",
        actorUid: editor.uid,
        executionId: id,
        recordedAt,
        preview: { status: "ready", subject: "Renewal for 101 Sample Pl", body },
        ...(outcome ? { outcome } : {}),
        ...overrides,
      });
  }

  it("a later cancelled preview leaves the created draft as the last created; replaced ones are counted", async () => {
    await attempt("exec-a", "2026-11-05T14:00:00.000Z", "Revision A.", {
      status: "created",
      executionId: "exec-a",
    });
    // Previewed for revision B and cancelled: no outcome recorded.
    await attempt("exec-b", "2026-11-05T15:00:00.000Z", "Revision B.", null);
    // Another sender's draft and another cycle's are not this sender's drafts for this cycle.
    await attempt(
      "exec-other",
      "2026-11-05T16:00:00.000Z",
      "Other sender.",
      { status: "created", executionId: "exec-other" },
      { actorUid: "editor-2" },
    );
    await attempt(
      "exec-old",
      "2026-10-05T16:00:00.000Z",
      "Other cycle.",
      { status: "created", executionId: "exec-old" },
      { cycleId: "00000000-0000-4000-8000-000000000000" },
    );
    expect(await getCreatedMessageDrafts(editor, "9101", CYCLE, "owner", db)).toEqual({
      latest: {
        executionId: "exec-a",
        subject: "Renewal for 101 Sample Pl",
        body: "Revision A.",
        recordedAt: "2026-11-05T14:00:00.000Z",
      },
      earlier: 0,
    });
    // A confirmed replacement: the earlier created draft is counted as still in Gmail.
    await attempt("exec-c", "2026-11-05T17:00:00.000Z", "Revision C.", {
      status: "reconciliation",
      resolution: "created",
      executionId: "exec-c",
    });
    expect(
      await getCreatedMessageDrafts(editor, "9101", CYCLE, "owner", db),
    ).toMatchObject({
      latest: { executionId: "exec-c", body: "Revision C." },
      earlier: 1,
    });
  });

  it("reads none where no draft was created", async () => {
    await attempt("exec-b", "2026-11-05T15:00:00.000Z", "Revision B.", null);
    expect(await getCreatedMessageDrafts(editor, "9101", CYCLE, "owner", db)).toBeNull();
  });
});
