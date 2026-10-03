import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import * as notesStore from "@/lib/firestore/renewal-status-notes";
import {
  RENEWAL_STATUS_NOTE_COLLECTIONS,
  listRenewalStatusNotes,
  saveRenewalStatusNote,
} from "@/lib/firestore/renewal-status-notes";
import {
  RENEWAL_WORK_STATUS_COLLECTIONS,
  getRenewalWorkStatus,
  listRenewalWorkStatusActivity,
  saveRenewalWorkStatus,
} from "@/lib/firestore/renewal-work-status";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import { projectRenewalWorkStatus } from "@/lib/lease-renewal/work-status";
import { buildRenewalStatusLog } from "@/lib/lease-renewal/work-status-notes";

// S164: notes are their own lease-bound entries beside the staff status. One composed note is one
// entry across every save and retry, a note needs no status change and no work record, and neither
// kind of save disturbs the other. Values are synthetic and the store is the local emulator.

const projectId = "pmi-kc-kb-s164-status-notes-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const secondEditor: AuthenticatedUser = {
  uid: "editor-2",
  email: "editor2@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const canary: AuthenticatedUser = {
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OP = (n: number) =>
  `7a1d4c2e-9b3f-4c6d-8e9f-0000000000${String(n).padStart(2, "0")}`;
const NOTE = (n: number) =>
  `3c5e7a90-1d2f-4b6a-9c8e-0000000000${String(n).padStart(2, "0")}`;

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s164-status-notes-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function countDocs(collection: string) {
  return (await db.collection(collection).get()).size;
}

function note(
  n: number,
  text: string,
  expectedRevision: number,
  op: number,
  leaseId = "701",
) {
  return {
    kind: "note" as const,
    leaseId,
    noteId: NOTE(n),
    text,
    expectedRevision,
    operationId: OP(op),
  };
}

describe("S164 status notes store", () => {
  it("BEH-S164-3/BEH-S164-11/AC-S164-1: a note saves with no status, no status change and no work record, and creates none of them", async () => {
    const saved = await saveRenewalStatusNote(
      editor,
      note(1, "Owner asked for a call back next week.", 0, 1),
      db,
    );
    expect(saved.duplicate).toBe(false);
    expect(saved.note).toMatchObject({
      schemaVersion: "renewal-status-note/v1",
      leaseId: "701",
      noteId: NOTE(1),
      revision: 1,
      text: "Owner asked for a call back next week.",
      recordedByUid: editor.uid,
      recordedByLabel: editor.email,
      eventId: OP(1),
    });
    expect(Date.parse(saved.note.recordedAt)).not.toBeNaN();
    expect(saved.note.updatedAt).toBe(saved.note.recordedAt);
    expect(saved.notes).toEqual([saved.note]);

    // No staff status, cycle, work record or workspace activity was manufactured for the note.
    expect(await getRenewalWorkStatus(editor, "701", db)).toBeNull();
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.head)).toBe(0);
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.activity)).toBe(0);
    expect(await getRenewalWorkspace(editor, "701", db)).toBeNull();
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(0);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.leaseBoundHead)).toBe(0);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(0);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(0);
  });

  it("BEH-S164-6/BEH-S164-7/AC-S164-2: repeated saves of one composition stay one entry with its first attribution; another note is a distinct entry", async () => {
    const first = await saveRenewalStatusNote(
      editor,
      note(1, "Called the owner", 0, 1),
      db,
    );
    const second = await saveRenewalStatusNote(
      editor,
      note(1, "Called the owner, left a voicemail", 1, 2),
      db,
    );
    const third = await saveRenewalStatusNote(
      editor,
      note(1, "Called the owner, left a voicemail.\nWill try again Friday.", 2, 3),
      db,
    );
    expect(third.note).toMatchObject({
      noteId: NOTE(1),
      revision: 3,
      text: "Called the owner, left a voicemail.\nWill try again Friday.",
      recordedAt: first.note.recordedAt,
      recordedByUid: editor.uid,
      recordedByLabel: editor.email,
      eventId: OP(3),
    });
    expect(second.note.recordedAt).toBe(first.note.recordedAt);
    expect(await listRenewalStatusNotes(editor, "701", db)).toHaveLength(1);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)).toBe(1);

    const another = await saveRenewalStatusNote(
      secondEditor,
      note(2, "Tenant confirmed the new term.", 0, 4),
      db,
    );
    expect(another.note).toMatchObject({
      noteId: NOTE(2),
      revision: 1,
      recordedByUid: secondEditor.uid,
      recordedByLabel: secondEditor.email,
    });
    const listed = await listRenewalStatusNotes(editor, "701", db);
    expect(listed.map((entry) => entry.noteId)).toEqual([NOTE(1), NOTE(2)]);
    // The earlier entry is exactly as it was saved.
    expect(listed[0]).toEqual(third.note);
    // R-S164-10: once the same person starts a later note, the earlier one is history. It cannot
    // be rewritten through the route; the later note still continues.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const later = await saveRenewalStatusNote(editor, note(3, "Second note", 0, 5), db);
    await expect(
      saveRenewalStatusNote(editor, note(1, "Rewritten history", 3, 6), db),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await listRenewalStatusNotes(editor, "701", db)).find(
        (entry) => entry.noteId === NOTE(1),
      ),
    ).toEqual(third.note);
    const continued = await saveRenewalStatusNote(
      editor,
      note(3, "Second note, continued", later.note.revision, 7),
      db,
    );
    expect(continued.note.revision).toBe(2);
    // Notes are kept per lease.
    expect(await listRenewalStatusNotes(editor, "702", db)).toEqual([]);
  });

  it("BEH-S164-8/AC-S164-2: empty or whitespace-only input is refused and stores nothing", async () => {
    for (const text of ["", "   ", "\n\n  \n"]) {
      await expect(
        saveRenewalStatusNote(editor, note(1, text, 0, 1), db),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      saveRenewalStatusNote(editor, note(1, "x".repeat(4001), 0, 1), db),
    ).rejects.toMatchObject({ status: 400 });
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)).toBe(0);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.operations)).toBe(0);
    // An emptied composition never erases the note that was already saved.
    const saved = await saveRenewalStatusNote(
      editor,
      note(1, "Keys returned.", 0, 2),
      db,
    );
    await expect(
      saveRenewalStatusNote(editor, note(1, "  ", 1, 3), db),
    ).rejects.toMatchObject({ status: 400 });
    expect(await listRenewalStatusNotes(editor, "701", db)).toEqual([saved.note]);
  });

  it("BEH-S164-9/AC-S164-2: retrying the same operation resolves as a duplicate with one entry; a changed request under that id and a stale revision are refused", async () => {
    const input = note(1, "Sent the comparison to the owner.", 0, 1);
    const first = await saveRenewalStatusNote(editor, input, db);
    const again = await saveRenewalStatusNote(editor, input, db);
    expect(again.duplicate).toBe(true);
    expect(again.note).toEqual(first.note);
    expect(again.notes).toHaveLength(1);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)).toBe(1);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.operations)).toBe(1);

    await expect(
      saveRenewalStatusNote(editor, { ...input, text: "Different text" }, db),
    ).rejects.toMatchObject({ status: 409 });
    await expect(saveRenewalStatusNote(secondEditor, input, db)).rejects.toMatchObject({
      status: 409,
    });
    // A save that read an older revision of the composition is a real conflict.
    await expect(
      saveRenewalStatusNote(editor, note(1, "Sent it twice.", 0, 2), db),
    ).rejects.toMatchObject({ status: 409 });
    expect(await listRenewalStatusNotes(editor, "701", db)).toEqual([first.note]);
    // Saving the same text again under a new request changes nothing and appends nothing.
    const unchanged = await saveRenewalStatusNote(
      editor,
      note(1, "Sent the comparison to the owner.", 1, 3),
      db,
    );
    expect(unchanged.duplicate).toBe(true);
    expect(unchanged.note).toEqual(first.note);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.operations)).toBe(1);
  });

  it("BEH-S164-10/AC-S164-3: another person cannot rewrite a note, a note id is bound to its lease, and the store offers no edit or delete of history", async () => {
    const original = await saveRenewalStatusNote(
      editor,
      note(1, "Owner approved by phone.", 0, 1),
      db,
    );
    await expect(
      saveRenewalStatusNote(secondEditor, note(1, "Rewritten by someone else", 1, 2), db),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveRenewalStatusNote(editor, note(1, "Moved to another lease", 1, 3, "702"), db),
    ).rejects.toMatchObject({ status: 409 });
    expect(await listRenewalStatusNotes(editor, "701", db)).toEqual([original.note]);
    expect(await listRenewalStatusNotes(editor, "702", db)).toEqual([]);
    expect(
      Object.keys(notesStore).filter((name) => /delete|remove|edit|clear/i.test(name)),
    ).toEqual([]);
  });

  it("BEH-S164-1/BEH-S164-5/BEH-S164-11/AC-S164-3: notes and status changes keep their own records; a note never moves the status revision and a status change never touches a note", async () => {
    const status = await saveRenewalWorkStatus(
      editor,
      {
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    const noted = await saveRenewalStatusNote(
      secondEditor,
      note(1, "Renewal is complete and the lease is signed.", 0, 2),
      db,
    );
    // Text about finished work is only text: the status, its revision and its history are as saved.
    expect(await getRenewalWorkStatus(editor, "701", db)).toEqual(status.record);
    expect(await listRenewalWorkStatusActivity(editor, "701", db)).toEqual(
      status.history,
    );
    // The status editor still holds revision 1: its next save is not a conflict.
    const next = await saveRenewalWorkStatus(
      editor,
      {
        leaseId: "701",
        status: "preparing_tenant_offer",
        expectedRevision: 1,
        operationId: OP(3),
      },
      db,
    );
    expect(next.record).toMatchObject({ revision: 2, status: "preparing_tenant_offer" });
    // The composition that was open during the status change continues at its own revision.
    const continued = await saveRenewalStatusNote(
      secondEditor,
      note(1, "Renewal is complete and the lease is signed. Filed the copy.", 1, 4),
      db,
    );
    expect(continued.note).toMatchObject({
      revision: 2,
      recordedAt: noted.note.recordedAt,
    });
    expect(await getRenewalWorkspace(editor, "701", db)).toBeNull();

    const log = buildRenewalStatusLog(
      await listRenewalWorkStatusActivity(editor, "701", db),
      await listRenewalStatusNotes(editor, "701", db),
    );
    expect(log.map((entry) => [entry.kind, entry.byLabel])).toEqual([
      ["status", editor.email],
      ["note", secondEditor.email],
      ["status", editor.email],
    ]);
    expect(log.every((entry) => !Number.isNaN(Date.parse(entry.at)))).toBe(true);
  });

  it("AC-S164-1: a verification identity, a forged actor field and a malformed identity are refused without writing", async () => {
    await expect(
      saveRenewalStatusNote(canary, note(1, "A verification note", 0, 1), db),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveRenewalStatusNote(
        editor,
        { ...note(1, "Forged", 0, 2), recordedByUid: "forged" } as unknown as Parameters<
          typeof saveRenewalStatusNote
        >[1],
        db,
      ),
    ).rejects.toThrow();
    await expect(
      saveRenewalStatusNote(
        editor,
        { ...note(1, "Bad lease", 0, 3), leaseId: "lease-1" },
        db,
      ),
    ).rejects.toThrow();
    await expect(
      saveRenewalStatusNote(
        editor,
        { ...note(1, "Bad id", 0, 4), noteId: "not-a-uuid" },
        db,
      ),
    ).rejects.toThrow();
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.notes)).toBe(0);
    expect(await countDocs(RENEWAL_STATUS_NOTE_COLLECTIONS.operations)).toBe(0);
  });

  it("BEH-S164-12/AC-S164-1: on a lease whose work record has no source date, the status binds to that record and a note still needs nothing", async () => {
    const record = await ensureRenewalWorkRecord(editor, "703", db, async () => null);
    expect(record.basis.kind).toBe("lease_bound");
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(0);
    const before = await getRenewalWorkspace(editor, "703", db);

    const saved = await saveRenewalWorkStatus(
      editor,
      {
        leaseId: "703",
        status: "verifying_lease_and_rent",
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    expect(saved.record.cycleId).toBe(record.cycleId);
    expect(
      projectRenewalWorkStatus({ available: true, record: saved.record }, record.cycleId),
    ).toMatchObject({ state: "recorded", cycleRelation: "current" });
    await saveRenewalStatusNote(
      editor,
      note(1, "Month to month, no end date.", 0, 2, "703"),
      db,
    );
    // The work record is exactly as it was: no revision, completion or activity came from either.
    expect(await getRenewalWorkspace(editor, "703", db)).toEqual(before);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(0);
  });
});
