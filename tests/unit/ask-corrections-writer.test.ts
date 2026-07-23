import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ASK_CORRECTIONS_COLLECTION,
  getAskCorrection,
  listAskCorrections,
  setAskCorrectionStatus,
  writeAskCorrection,
} from "@/lib/firestore/ask-corrections";
import type { CorrectionRequest } from "@/lib/schemas";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}
const editor = userWith("Editor", "editor-1");
const admin = userWith("Admin", "admin-1");

const INPUT: CorrectionRequest = {
  ask_log_id: "log-1",
  space_id: "kb",
  question: "What is the late fee grace period?",
  kind: "wrong_fact",
  note: "The grace period is 5 days, not 3.",
  source_state: "Verified",
  citations: [],
};

let db: FakeFirestore;
beforeEach(() => {
  db = new FakeFirestore();
});
function fs(): Firestore {
  return db as unknown as Firestore;
}

describe("writeAskCorrection (AC-S32-1)", () => {
  it("writes exactly one Proposed correction and mutates nothing else", async () => {
    const record = await writeAskCorrection(editor, INPUT, fs());
    expect(record.status).toBe("Proposed");
    expect(record.kind).toBe("wrong_fact");
    expect(record.note).toBe("The grace period is 5 days, not 3.");
    expect(record.question).toBe(INPUT.question);
    expect(record.user_uid).toBe("editor-1");
    expect(record.ask_log_id).toBe("log-1");

    // Exactly one ask_corrections record exists; the store holds nothing else.
    const keys = [...db.store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith(`${ASK_CORRECTIONS_COLLECTION}/`)).toBe(true);

    const readback = await getAskCorrection(admin, record.id, fs());
    expect(readback?.status).toBe("Proposed");
  });

  it("lists Proposed corrections for the review lane", async () => {
    await writeAskCorrection(editor, INPUT, fs());
    await writeAskCorrection(editor, { ...INPUT, note: "Another note." }, fs());
    const proposed = await listAskCorrections(admin, { status: "Proposed" }, fs());
    expect(proposed).toHaveLength(2);
    expect(proposed.every((c) => c.status === "Proposed")).toBe(true);
  });
});

describe("setAskCorrectionStatus (Admin-only decision)", () => {
  it("is Admin-only — an Editor cannot approve/dismiss a correction", async () => {
    const record = await writeAskCorrection(editor, INPUT, fs());
    await expect(
      setAskCorrectionStatus(editor, record.id, "Approved", fs()),
    ).rejects.toThrow(EditableLayerError);
    // Unchanged: still Proposed.
    expect((await getAskCorrection(admin, record.id, fs()))?.status).toBe("Proposed");
  });

  it("approves a Proposed correction and preserves its other fields", async () => {
    const record = await writeAskCorrection(editor, INPUT, fs());
    const decided = await setAskCorrectionStatus(admin, record.id, "Approved", fs());
    expect(decided.status).toBe("Approved");
    expect(decided.decided_by_uid).toBe("admin-1");
    // The partial update preserved the note/question/kind.
    expect(decided.note).toBe(INPUT.note);
    expect(decided.question).toBe(INPUT.question);
    expect(decided.kind).toBe("wrong_fact");
  });

  it("rejects deciding a correction that is not Proposed (double-decide)", async () => {
    const record = await writeAskCorrection(editor, INPUT, fs());
    await setAskCorrectionStatus(admin, record.id, "Dismissed", fs());
    await expect(
      setAskCorrectionStatus(admin, record.id, "Approved", fs()),
    ).rejects.toThrow(/only a Proposed correction/i);
  });
});
