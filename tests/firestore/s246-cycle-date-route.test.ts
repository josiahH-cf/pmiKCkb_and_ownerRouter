import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S246 R-S246-5 / BEH-S246-2 through the mounted workspace route: the two staff choices for a
// lease RentVine reports renewed. The route reads the current RentVine lease end on the server
// (stood in here; no source is contacted) and never trusts the dates the browser sent. Synthetic
// values on the local emulator only.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: null as AuthenticatedUser | null,
  sourceEnd: null as string | null,
  sourceReads: 0,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: async () => testState.actor };
});
vi.mock("@/lib/lease-renewal/workspace-cycle-context", async (original) => ({
  ...(await original<typeof import("@/lib/lease-renewal/workspace-cycle-context")>()),
  resolveCurrentLeaseEndIso: async () => {
    testState.sourceReads += 1;
    return testState.sourceEnd;
  },
}));

import { POST } from "@/app/api/lease-renewal/workspace/route";
import {
  CYCLE_DATE_CHANGED_MESSAGE,
  RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS,
  getRenewalCycleDateDecision,
} from "@/lib/firestore/renewal-cycle-date-decisions";
import {
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";

const projectId = "pmi-kc-kb-s246-cycle-date-route-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const verification: AuthenticatedUser = {
  ...editor,
  uid: "verification-1",
  email: "canary-editor@pmikcmetro.com",
};
const LEASE = "4821";
const RECORDED = "2026-12-31";
const SOURCE = "2027-12-31";
const OP = (n: number) =>
  `6c9e3f40-7d6b-4e8f-8a9b-0000000000${String(n).padStart(2, "0")}`;

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s246-cycle-date-route-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  testState.actor = editor;
  testState.sourceEnd = SOURCE;
  testState.sourceReads = 0;
  await ensureRenewalWorkRecord(editor, LEASE, db, async () => ({
    kind: "lease_end",
    dateIso: RECORDED,
    source: "RentVine lease end",
  }));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

/** The parts of the route's JSON these checks read. */
interface RouteBody {
  readonly duplicate?: boolean;
  readonly error?: string;
  readonly decision?: Record<string, unknown>;
  readonly state?: { readonly completion?: Record<string, unknown> | null } | null;
  readonly writeback_paused?: boolean;
}

async function post(body: Record<string, unknown>) {
  const response = await POST(
    new Request("http://localhost/api/lease-renewal/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as RouteBody };
}

const choice = (
  operation: string,
  id: number,
  overrides: Record<string, unknown> = {},
) => ({
  operation,
  leaseId: LEASE,
  recordedDateIso: RECORDED,
  sourceDateIso: SOURCE,
  operationId: OP(id),
  ...overrides,
});

async function decisions() {
  return (await db.collection(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head).get()).size;
}

describe("S246 the two cycle date choices through the workspace route (BEH-S246-2)", () => {
  it("keep_working records the decision and leaves the work record unfinished", async () => {
    const saved = await post(choice("keep_working", 1));
    expect(saved.status).toBe(200);
    expect(saved.body.duplicate).toBe(false);
    expect(saved.body.decision).toMatchObject({
      leaseId: LEASE,
      decision: "keep_working",
      recordedDateIso: RECORDED,
      sourceDateIso: SOURCE,
      recordedByUid: editor.uid,
    });
    expect(testState.sourceReads).toBe(1);
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion).toBeNull();
    // A repeated delivery of the same request records nothing more.
    const replay = await post(choice("keep_working", 1));
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(await decisions()).toBe(1);
  });

  it("confirm_source_renewal records staff completion with the RentVine lease end as its evidence", async () => {
    const saved = await post(choice("confirm_source_renewal", 2));
    expect(saved.status).toBe(200);
    expect(saved.body.duplicate).toBe(false);
    expect(saved.body.state?.completion).toMatchObject({
      eventId: OP(2),
      actorUid: editor.uid,
      source: `RentVine lease end ${SOURCE}`,
    });
    expect(typeof saved.body.writeback_paused).toBe("boolean");
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion?.eventId).toBe(
      OP(2),
    );
    expect(await decisions()).toBe(0);
  });

  it("refuses both choices when RentVine no longer reports the date the page showed", async () => {
    testState.sourceEnd = "2028-01-31";
    for (const [operation, id] of [
      ["keep_working", 3],
      ["confirm_source_renewal", 4],
    ] as const) {
      const refused = await post(choice(operation, id));
      expect(refused.status, operation).toBe(409);
      expect(refused.body.error, operation).toBe(CYCLE_DATE_CHANGED_MESSAGE);
    }
    // An unreadable source is the same refusal: nothing is recorded on a guess.
    testState.sourceEnd = null;
    expect((await post(choice("keep_working", 5))).status).toBe(409);
    expect(await decisions()).toBe(0);
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion).toBeNull();
    expect(await getRenewalCycleDateDecision(editor, LEASE, db)).toBeNull();
  });

  it("accepts only the exact request shape", async () => {
    for (const body of [
      choice("keep_working", 6, { sourceDateIso: "12/31/2027" }),
      choice("keep_working", 7, { leaseId: "0" }),
      choice("confirm_source_renewal", 8, { note: "extra" }),
      choice("confirm_source_renewal", 9, { operationId: "not-an-id" }),
      { operation: "keep_working", leaseId: LEASE },
    ]) {
      const refused = await post(body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
    }
    expect(testState.sourceReads).toBe(0);
    expect(await decisions()).toBe(0);
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion).toBeNull();
  });

  it("a verification account records neither choice", async () => {
    testState.actor = verification;
    for (const [operation, id] of [
      ["keep_working", 10],
      ["confirm_source_renewal", 11],
    ] as const)
      expect((await post(choice(operation, id))).status, operation).toBe(403);
    // The refusal comes before any source read.
    expect(testState.sourceReads).toBe(0);
    expect(await decisions()).toBe(0);
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion).toBeNull();
  });
});
