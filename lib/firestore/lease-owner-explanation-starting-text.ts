// S253 (R-S253-7): the team's starting text for the owner acknowledgment explanation.
//
// An Admin saves the text the team begins from; renewal staff may copy it into a lease's
// explanation and edit it there. The application ships none: until an Admin saves one, the
// starting text is empty and staff write the explanation on the lease. It is a company setting and
// never holds a lease's value: nothing written on a lease is read into it. A stale revision is
// refused and an operation id makes a retry return the first result. Saving reaches no provider.

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  OWNER_EXPLANATION_MAX_LENGTH,
  SHIPPED_OWNER_EXPLANATION_STARTING_TEXT,
} from "@/lib/lease-documents/owner-explanation";
import { normalizeParagraphText } from "@/lib/lease-documents/paragraph-text";

export const OWNER_EXPLANATION_STARTING_TEXT_COLLECTIONS = {
  current: "lease_owner_explanation_settings",
  activity: "lease_owner_explanation_settings_activity",
} as const;
export const OWNER_EXPLANATION_STARTING_TEXT_DOC_ID = "current";
const SCHEMA_VERSION = "owner-explanation-starting-text/v1";

const RecordSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    revision: z.number().int().positive(),
    /** Empty after an Admin deliberately clears it. */
    text: z.string().max(OWNER_EXPLANATION_MAX_LENGTH),
    updatedAt: z.string().datetime(),
    updatedByUid: z.string().trim().min(1).max(128),
  })
  .strict();

export const SaveOwnerExplanationStartingTextSchema = z
  .object({
    text: z.string().max(OWNER_EXPLANATION_MAX_LENGTH * 2),
    /** 0 when no starting text has been saved yet. */
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  })
  .strict();

export interface OwnerExplanationStartingText {
  readable: boolean;
  revision: number;
  /** The team's starting text; empty until an Admin saves one. */
  text: string;
  updatedAt: string | null;
}

function ref(db: Firestore) {
  return db
    .collection(OWNER_EXPLANATION_STARTING_TEXT_COLLECTIONS.current)
    .doc(OWNER_EXPLANATION_STARTING_TEXT_DOC_ID);
}

function view(raw: unknown): OwnerExplanationStartingText {
  const parsed = RecordSchema.safeParse(raw);
  if (!parsed.success)
    throw new EditableLayerError(
      "The saved starting text is unreadable; nothing was changed.",
      409,
    );
  return {
    readable: true,
    revision: parsed.data.revision,
    text: parsed.data.text,
    updatedAt: parsed.data.updatedAt,
  };
}

const NOTHING_SAVED: OwnerExplanationStartingText = {
  readable: true,
  revision: 0,
  text: SHIPPED_OWNER_EXPLANATION_STARTING_TEXT,
  updatedAt: null,
};

/** Never throws: an unreadable setting reads as no starting text and says so. */
export async function readOwnerExplanationStartingText(
  db?: Firestore,
): Promise<OwnerExplanationStartingText> {
  try {
    const snapshot = await ref(db ?? getAdminFirestore()).get();
    return snapshot.exists ? view(snapshot.data()) : NOTHING_SAVED;
  } catch {
    return { ...NOTHING_SAVED, readable: false };
  }
}

export async function saveOwnerExplanationStartingText(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<{ startingText: OwnerExplanationStartingText; duplicate: boolean }> {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (!can(actor.role, "manageAdmin") || isVerificationAccount(actor))
    throw new EditableLayerError(
      "An Admin saves the starting text for the owner explanation.",
      403,
    );
  const input = SaveOwnerExplanationStartingTextSchema.parse(raw);
  const text = normalizeParagraphText(input.text);
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text))
    throw new EditableLayerError(
      "The starting text has a character a form cannot show. Remove it and save again.",
      400,
    );
  if (text.length > OWNER_EXPLANATION_MAX_LENGTH)
    throw new EditableLayerError(
      `The starting text is ${text.length - OWNER_EXPLANATION_MAX_LENGTH} characters longer than the ${OWNER_EXPLANATION_MAX_LENGTH} this setting keeps. Shorten it and save again.`,
      400,
    );
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: "owner_explanation_starting_text_save",
    text,
    expectedRevision: input.expectedRevision,
  });
  const audit = db
    .collection(OWNER_EXPLANATION_STARTING_TEXT_COLLECTIONS.activity)
    .doc(input.operationId);
  return db.runTransaction(async (transaction) => {
    const [current, previous] = await Promise.all([
      transaction.get(ref(db)),
      transaction.get(audit),
    ]);
    const stored = current.exists ? view(current.data()) : NOTHING_SAVED;
    if (previous.exists) {
      if (previous.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This save differs from the one first sent. Reload and save again.",
          409,
        );
      return { startingText: stored, duplicate: true };
    }
    if (stored.revision !== input.expectedRevision)
      throw new EditableLayerError(
        "The starting text changed since the page was loaded. Reload before saving.",
        409,
      );
    const record = RecordSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      revision: stored.revision + 1,
      text,
      updatedAt: now,
      updatedByUid: actor.uid,
    });
    transaction.set(ref(db), record);
    // The activity keeps who changed the setting and when, never the text itself.
    transaction.create(audit, {
      action: "owner_explanation_starting_text_saved",
      actor_uid: actor.uid,
      created_at: now,
      request_hash: requestHash,
      revision: record.revision,
      characters: text.length,
    });
    return {
      startingText: {
        readable: true,
        revision: record.revision,
        text: record.text,
        updatedAt: record.updatedAt,
      },
      duplicate: false,
    };
  });
}
