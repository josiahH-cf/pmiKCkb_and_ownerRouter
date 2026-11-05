import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  OWNER_EXPLANATION_STARTING_TEXT_COLLECTIONS,
  readOwnerExplanationStartingText,
  saveOwnerExplanationStartingText,
} from "@/lib/firestore/lease-owner-explanation-starting-text";
import { OWNER_EXPLANATION_MAX_LENGTH } from "@/lib/lease-documents/owner-explanation";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// S253 R-S253-7: the team's starting text for the owner explanation is an Admin setting. The
// application ships none; nothing written on a lease is ever read into it. Synthetic text only.

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
const editor = { ...admin, uid: "editor-1", role: "Editor" } as AuthenticatedUser;
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-11-05T15:00:00.000Z";
const CURRENT = `${OWNER_EXPLANATION_STARTING_TEXT_COLLECTIONS.current}/current`;

let fake: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
});
afterEach(() => vi.unstubAllEnvs());

async function refusal(run: () => Promise<unknown>): Promise<EditableLayerError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(EditableLayerError);
    return error as EditableLayerError;
  }
  throw new Error("The save was accepted.");
}

describe("S253 the starting text ships empty", () => {
  it("reads as no starting text until an Admin saves one, and writes nothing by reading", async () => {
    expect(await readOwnerExplanationStartingText(db)).toEqual({
      readable: true,
      revision: 0,
      text: "",
      updatedAt: null,
    });
    expect(fake.store.size).toBe(0);
  });

  it("reads an unreadable setting as no starting text and says so", async () => {
    fake.seed(CURRENT, { text: 7 });
    expect(await readOwnerExplanationStartingText(db)).toEqual({
      readable: false,
      revision: 0,
      text: "",
      updatedAt: null,
    });
  });
});

describe("S253 an Admin saves the team's starting text", () => {
  it("keeps the text in its paragraphs with who saved it, and no text in the activity", async () => {
    const result = await saveOwnerExplanationStartingText(
      admin,
      {
        text: "SYNTHETIC starting text. \r\n\r\n\r\nSYNTHETIC second paragraph.  ",
        expectedRevision: 0,
        operationId: op(1),
      },
      db,
      NOW,
    );
    expect(result).toEqual({
      startingText: {
        readable: true,
        revision: 1,
        text: "SYNTHETIC starting text.\n\nSYNTHETIC second paragraph.",
        updatedAt: NOW,
      },
      duplicate: false,
    });
    expect(fake.store.get(CURRENT)).toEqual({
      schemaVersion: "owner-explanation-starting-text/v1",
      revision: 1,
      text: "SYNTHETIC starting text.\n\nSYNTHETIC second paragraph.",
      updatedAt: NOW,
      updatedByUid: "admin-1",
    });
    const activity = fake.store.get(
      `${OWNER_EXPLANATION_STARTING_TEXT_COLLECTIONS.activity}/${op(1)}`,
    )!;
    expect(activity).toMatchObject({
      action: "owner_explanation_starting_text_saved",
      actor_uid: "admin-1",
      revision: 1,
      characters: 53,
    });
    expect(JSON.stringify(activity)).not.toContain("SYNTHETIC");
    expect(await readOwnerExplanationStartingText(db)).toMatchObject({
      revision: 1,
      text: "SYNTHETIC starting text.\n\nSYNTHETIC second paragraph.",
    });
  });

  it("returns the first result for a repeated save and refuses a different one under the same identity", async () => {
    const body = { text: "SYNTHETIC text.", expectedRevision: 0, operationId: op(2) };
    await saveOwnerExplanationStartingText(admin, body, db, NOW);
    const again = await saveOwnerExplanationStartingText(admin, body, db, NOW);
    expect(again).toMatchObject({ duplicate: true, startingText: { revision: 1 } });
    const error = await refusal(() =>
      saveOwnerExplanationStartingText(
        admin,
        { ...body, text: "SYNTHETIC other text." },
        db,
        NOW,
      ),
    );
    expect(error.status).toBe(409);
    expect(fake.store.get(CURRENT)).toMatchObject({
      revision: 1,
      text: "SYNTHETIC text.",
    });
  });

  it("refuses a stale revision and keeps the saved text", async () => {
    await saveOwnerExplanationStartingText(
      admin,
      { text: "SYNTHETIC text.", expectedRevision: 0, operationId: op(3) },
      db,
      NOW,
    );
    const error = await refusal(() =>
      saveOwnerExplanationStartingText(
        admin,
        { text: "SYNTHETIC later text.", expectedRevision: 0, operationId: op(4) },
        db,
        NOW,
      ),
    );
    expect(error.status).toBe(409);
    expect(error.message).toBe(
      "The starting text changed since the page was loaded. Reload before saving.",
    );
    expect(fake.store.get(CURRENT)).toMatchObject({ text: "SYNTHETIC text." });
  });

  it("lets an Admin clear it back to empty", async () => {
    await saveOwnerExplanationStartingText(
      admin,
      { text: "SYNTHETIC text.", expectedRevision: 0, operationId: op(5) },
      db,
      NOW,
    );
    const cleared = await saveOwnerExplanationStartingText(
      admin,
      { text: "  \n ", expectedRevision: 1, operationId: op(6) },
      db,
      NOW,
    );
    expect(cleared.startingText).toMatchObject({ revision: 2, text: "" });
  });

  it("is an Admin's to save: renewal staff are refused and nothing is written", async () => {
    const error = await refusal(() =>
      saveOwnerExplanationStartingText(
        editor,
        { text: "SYNTHETIC text.", expectedRevision: 0, operationId: op(7) },
        db,
        NOW,
      ),
    );
    expect(error.status).toBe(403);
    expect(error.message).toBe(
      "An Admin saves the starting text for the owner explanation.",
    );
    expect(fake.store.size).toBe(0);
  });

  it("refuses a text the setting cannot keep, with how much it is over", async () => {
    const long = "SYNTHETIC ".repeat(OWNER_EXPLANATION_MAX_LENGTH / 10 + 2);
    const error = await refusal(() =>
      saveOwnerExplanationStartingText(
        admin,
        { text: long, expectedRevision: 0, operationId: op(8) },
        db,
        NOW,
      ),
    );
    expect(error.status).toBe(400);
    expect(error.message).toBe(
      `The starting text is ${long.trim().length - OWNER_EXPLANATION_MAX_LENGTH} characters longer than the ${OWNER_EXPLANATION_MAX_LENGTH} this setting keeps. Shorten it and save again.`,
    );
    const control = await refusal(() =>
      saveOwnerExplanationStartingText(
        admin,
        { text: "SYNTHETIC\u0007text", expectedRevision: 0, operationId: op(9) },
        db,
        NOW,
      ),
    );
    expect(control.status).toBe(400);
    expect(fake.store.size).toBe(0);
  });

  it("holds nothing of any lease: the setting has no lease, deposit or amount field", async () => {
    await expect(
      saveOwnerExplanationStartingText(
        admin,
        {
          text: "SYNTHETIC text.",
          expectedRevision: 0,
          operationId: op(10),
          leaseId: "701",
        },
        db,
        NOW,
      ),
    ).rejects.toThrow();
    expect(fake.store.size).toBe(0);
  });
});
