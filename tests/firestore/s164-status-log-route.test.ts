import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

// S164: the Status log through the actual route and the actual stores. A status choice and a note
// each persist by their own request, are read back together with the server's actor and time, and
// reopen identically for another session. Only the session is substituted; values are synthetic.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: {
    uid: "editor-1",
    email: "editor1@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor" as "Editor" | "Approver",
  },
}));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => ({ ...testState.actor }),
}));

import { GET, POST } from "@/app/api/lease-renewal/work-status/route";
import { RENEWAL_STATUS_NOTE_COLLECTIONS } from "@/lib/firestore/renewal-status-notes";
import { RENEWAL_WORK_STATUS_COLLECTIONS } from "@/lib/firestore/renewal-work-status";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import type {
  RenewalWorkStatusActivity,
  RenewalWorkStatusRecord,
} from "@/lib/lease-renewal/work-status";
import {
  buildRenewalStatusLog,
  type RenewalStatusNote,
} from "@/lib/lease-renewal/work-status-notes";

const projectId = "pmi-kc-kb-s164-status-log-route-test";
const EDITOR = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const SECOND = { ...EDITOR, uid: "editor-2", email: "editor2@pmikcmetro.com" };
const CANARY = { ...EDITOR, uid: "canary-editor", email: "canary-editor@pmikcmetro.com" };
const OP = (n: number) =>
  `7a1d4c2e-9b3f-4c6d-8e9f-0000000000${String(n).padStart(2, "0")}`;
const NOTE = (n: number) =>
  `3c5e7a90-1d2f-4b6a-9c8e-0000000000${String(n).padStart(2, "0")}`;

interface LogRead {
  record: RenewalWorkStatusRecord | null;
  history: RenewalWorkStatusActivity[];
  notes: RenewalStatusNote[];
}

let app: App;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s164-status-log-route-${process.pid}`);
  testState.db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  testState.actor = { ...EDITOR };
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

function post(body: unknown) {
  return POST(
    new Request("http://local.test/api/lease-renewal/work-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function readLog(leaseId = "701"): Promise<LogRead> {
  const response = await GET(
    new Request(`http://local.test/api/lease-renewal/work-status?leaseId=${leaseId}`),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as LogRead;
}

async function countDocs(collection: string) {
  return (await testState.db!.collection(collection).get()).size;
}

function note(n: number, text: string, expectedRevision: number, op: number) {
  return {
    kind: "note",
    leaseId: "701",
    noteId: NOTE(n),
    text,
    expectedRevision,
    operationId: OP(op),
  };
}

describe("S164 status log through the route", () => {
  it("BEH-S164-3/BEH-S164-4/BEH-S164-5/AC-S164-1: a note and a status choice each persist by their own request and read back together with the server's actor and time", async () => {
    // A note first: no status exists, none is sent and none is created.
    const noted = await post(note(1, "Owner asked for a call back next week.", 0, 1));
    expect(noted.status).toBe(200);
    const first = await readLog();
    expect(first.record).toBeNull();
    expect(first.history).toEqual([]);
    expect(first.notes).toHaveLength(1);
    expect(first.notes[0]).toMatchObject({
      noteId: NOTE(1),
      revision: 1,
      text: "Owner asked for a call back next week.",
      recordedByUid: EDITOR.uid,
      recordedByLabel: EDITOR.email,
    });

    testState.actor = { ...SECOND };
    const status = await post({
      leaseId: "701",
      status: "waiting_on_owner_response",
      expectedRevision: 0,
      operationId: OP(2),
    });
    expect(status.status).toBe(200);

    const log = await readLog();
    expect(log.record).toMatchObject({
      revision: 1,
      status: "waiting_on_owner_response",
      recordedByUid: SECOND.uid,
      recordedByLabel: SECOND.email,
      cycleId: null,
    });
    expect(log.notes).toEqual(first.notes);
    const entries = buildRenewalStatusLog(log.history, log.notes);
    expect(entries.map((entry) => [entry.kind, entry.byLabel])).toEqual([
      ["note", EDITOR.email],
      ["status", SECOND.email],
    ]);
    for (const entry of entries) {
      expect(Date.now() - Date.parse(entry.at)).toBeLessThan(120_000);
    }
    // Neither save made a work record, a cycle or workspace activity.
    for (const collection of [
      RENEWAL_WORKSPACE_COLLECTIONS.head,
      RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead,
      RENEWAL_WORKSPACE_COLLECTIONS.cycles,
      RENEWAL_WORKSPACE_COLLECTIONS.activity,
    ])
      expect(await countDocs(collection), collection).toBe(0);
  });

  it("BEH-S164-6/BEH-S164-7/BEH-S164-9/AC-S164-2: continued saves and a repeated request leave one entry; another note is a second entry", async () => {
    expect((await post(note(1, "Called the owner", 0, 1))).status).toBe(200);
    expect((await post(note(1, "Called the owner, left a voicemail", 1, 2))).status).toBe(
      200,
    );
    // The response to the second save was lost and the same request is sent again.
    const repeated = await post(note(1, "Called the owner, left a voicemail", 1, 2));
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({
      duplicate: true,
      note: { revision: 2 },
    });
    // An empty continuation stores nothing.
    expect((await post(note(1, "   ", 2, 3))).status).toBe(400);
    let log = await readLog();
    expect(log.notes).toHaveLength(1);
    expect(log.notes[0]).toMatchObject({
      revision: 2,
      text: "Called the owner, left a voicemail",
    });
    expect(log.notes[0].updatedAt >= log.notes[0].recordedAt).toBe(true);

    expect((await post(note(2, "Tenant confirmed the new term.", 0, 4))).status).toBe(
      200,
    );
    log = await readLog();
    expect(log.notes.map((entry) => entry.noteId)).toEqual([NOTE(1), NOTE(2)]);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)).toBe(2);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.operations)).toBe(3);
  });

  it("BEH-S164-10/BEH-S164-11/BEH-S164-12/AC-S164-3: text about finished work changes nothing else, earlier entries stay as recorded, and another session reopens the same log", async () => {
    await post({
      leaseId: "701",
      status: "preparing_owner_outreach",
      expectedRevision: 0,
      operationId: OP(1),
    });
    const before = await readLog();
    testState.actor = { ...SECOND };
    const response = await post(
      note(1, "Renewal complete. Owner approved, lease signed, RentVine updated.", 0, 2),
    );
    expect(response.status).toBe(200);
    // Another person's entry cannot be continued by this one.
    testState.actor = { ...EDITOR };
    expect((await post(note(1, "Rewritten", 1, 3))).status).toBe(403);

    const after = await readLog();
    expect(after.record).toEqual(before.record);
    expect(after.history).toEqual(before.history);
    expect(after.notes).toHaveLength(1);
    expect(after.notes[0]).toMatchObject({
      text: "Renewal complete. Owner approved, lease signed, RentVine updated.",
      recordedByUid: SECOND.uid,
      revision: 1,
    });
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.activity)).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(0);
    // Another session (for example the same lease opened on a phone) reads the same log.
    testState.actor = { ...SECOND, role: "Approver" };
    expect(await readLog()).toEqual(after);
    // Another lease has its own, empty log.
    expect(await readLog("702")).toEqual({ record: null, history: [], notes: [] });
  });

  it("AC-S164-1: a verification account is refused for a note and for a status, and nothing is written", async () => {
    testState.actor = { ...CANARY };
    expect((await post(note(1, "A verification note", 0, 1))).status).toBe(403);
    expect(
      (
        await post({
          leaseId: "701",
          status: "verifying_lease_and_rent",
          expectedRevision: 0,
          operationId: OP(2),
        })
      ).status,
    ).toBe(403);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)).toBe(0);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.operations)).toBe(0);
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.head)).toBe(0);
    // It can still read.
    expect(await readLog()).toEqual({ record: null, history: [], notes: [] });
  });
});
