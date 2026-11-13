// S285 R-S285-2 / R-S285-6 (ARCH-S285-2): owner copy v2.1 and its own publication record, beside
// the v2.0 record of `renewal-message-publication.ts`, which this module reads and never changes.
//
// v2.1 is published only by an existing template approver, through the existing template store
// (owner, approver, unique name and change log), as its own record under its own name. The one
// resolver below returns the owner copy in use, the newest version whose publication reads back
// approved, to every composer, readiness check, content basis and dispatch check (they all read
// it through `currentRenewalMessage`). Until v2.1 reads back approved, owner messages are composed,
// reviewed, scheduled and sent under v2.0 exactly as before: the release holds no review and
// pauses no message.
//
// Publishing first states how many unsent owner messages were reviewed with the current wording
// and will be held for review. That count is taken again when the approver confirms; a different
// count refuses the publication so the stated number is the number held.

import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { createTemplate, listTemplates } from "@/lib/firestore/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  OWNER_RENEWAL_COPY_V2_1,
  SUPPLIED_RENEWAL_COPY,
  type OwnerCopyVersion,
} from "@/lib/lease-renewal/renewal-message-content";
import { ownerCopyVersionInUse } from "@/lib/lease-renewal/owner-copy-version";
import { ownerCopyV21Publication } from "./renewal-owner-copy-document";
import {
  getSuppliedRenewalPublication,
  suppliedRenewalPublication,
} from "./renewal-message-publication";
import { COMMUNICATION_SEQUENCE_COLLECTIONS } from "@/lib/gmail-hub/sequence-store";
import {
  keptContentBasis,
  relatedSequenceView,
  unsentMessageState,
  type AuthorizedContentBasis,
} from "@/lib/gmail-hub/current-message";

export { ownerCopyV21Publication };

/** The v2.1 record as it reads back: approved only when its exact content is approved. */
export async function getOwnerCopyV21Publication(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  const expected = ownerCopyV21Publication();
  const matches = (await listTemplates(actor, "lease-renewals", db)).filter(
    (record) => record.name.trim().toLowerCase() === expected.name.toLowerCase(),
  );
  const record =
    matches.length === 1 && matches[0].status === "Approved" ? matches[0] : null;
  if (
    !record ||
    record.body !== expected.body ||
    !record.approved_by_uid ||
    !record.last_reviewed_at
  )
    return {
      status: "unpublished" as const,
      ...expected,
      exists: matches.length > 0,
      reason:
        "The owner wording that asks about the term is prepared; its exact approved content record has not been published.",
    };
  return {
    status: "approved" as const,
    ...expected,
    exists: true,
    templateId: record.id,
    approvedByUid: record.approved_by_uid,
    reviewedAt: record.last_reviewed_at,
  };
}

type SuppliedPublicationRead = Awaited<ReturnType<typeof getSuppliedRenewalPublication>>;
type UnavailablePublicationRead = ReturnType<typeof suppliedRenewalPublication> & {
  readonly status: "unavailable";
  readonly reason: string;
};

/** One owner copy publication as composition reads it, with the version it publishes. */
export type OwnerCopyPublicationRead = (
  | SuppliedPublicationRead
  | UnavailablePublicationRead
) & { readonly version: OwnerCopyVersion; readonly copyRef?: string };

/**
 * ARCH-S285-2: the one resolver. Reads the v2.0 record (unchanged) and the v2.1 record, and returns
 * the owner copy in use for each owner question: v2.1 for the message that recommends a rent once
 * v2.1 reads back approved, else v2.0. A failed v2.1 read keeps v2.0 in use.
 */
export async function readOwnerCopyPublications(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  const unavailable: UnavailablePublicationRead = {
    ...suppliedRenewalPublication("owner"),
    status: "unavailable",
    reason:
      "Current supplied-template publication could not be read. Editing and copy continue; the Gmail draft waits for that readback.",
  };
  const [v20, v21] = await Promise.all([
    getSuppliedRenewalPublication(actor, "owner", db).catch(
      (): SuppliedPublicationRead | UnavailablePublicationRead => unavailable,
    ),
    getOwnerCopyV21Publication(actor, db).catch(() => null),
  ]);
  const v21Approved = v21?.status === "approved";
  const publicationFor = (
    ownerIntent: "recommend_rent" | "renew_or_not" | undefined,
  ): OwnerCopyPublicationRead => {
    const version = ownerCopyVersionInUse({ v21Approved, ownerIntent });
    if (version === "v2.1" && v21?.status === "approved")
      return {
        status: "approved",
        name: v21.name,
        body: v21.body,
        contentHash: v21.contentHash,
        ref: v21.ref,
        templateId: v21.templateId,
        approvedByUid: v21.approvedByUid,
        reviewedAt: v21.reviewedAt,
        version: "v2.1",
        copyRef: v21.copyRef,
      };
    return { ...v20, version: "v2.0" };
  };
  return {
    v20,
    v21,
    v21Approved,
    publicationFor,
    /** The version an approver is offered to publish, while it is not yet published. */
    readyToPublish: v21 !== null && v21.status !== "approved" && !v21.exists,
  };
}

/**
 * R-S285-6: an owner message authorized with the current (v2.0) wording that still holds unsent
 * authorized work, and whose dispatch check binds the publication (an authorization that carries
 * the sender signature setup). Publishing v2.1 holds exactly these for review. A renew-or-not
 * message keeps v2.0 and is not counted.
 */
export function heldOnOwnerWordingPublish(
  data: Record<string, unknown> | null | undefined,
  id = "sequence",
): boolean {
  const view = relatedSequenceView(id, data);
  if (!view || !data) return false;
  const context = data.context as { purpose?: unknown; replyTo?: unknown } | undefined;
  if (context?.purpose !== "renewal_owner" || context.replyTo) return false;
  if (!view.state || !["active", "paused", "needs_reconciliation"].includes(view.state))
    return false;
  if (!unsentMessageState(view)) return false;
  const authorization = data.authorization as
    | {
        revision?: number;
        signatureSetup?: unknown;
        initial?: { plainText?: unknown };
      }
    | undefined;
  if (!authorization?.signatureSetup) return false;
  // The question it asked: from the values kept with this authorization, else its own wording.
  const kept =
    typeof authorization.revision === "number"
      ? keptContentBasis({
          authorization: { revision: authorization.revision },
          authorizedContentBasis: data.authorizedContentBasis as
            | AuthorizedContentBasis
            | undefined,
        })
      : null;
  const intent = kept?.values.find((input) => input.key === "ownerIntent")?.value;
  if (intent === "Renew or not") return false;
  if (intent === "Recommend a rent") {
    // Already reviewed with the term-stating wording: publishing changes nothing for it.
    return !kept?.values.some((input) => input.key === "renewalStart");
  }
  const text =
    typeof authorization.initial?.plainText === "string"
      ? authorization.initial.plainText
      : "";
  return text.includes(SUPPLIED_RENEWAL_COPY.owner.consideration);
}

/** R-S285-6: the count the publish control states, from stored sequence state only. */
export async function countOwnerMessagesHeldOnPublish(
  db: Firestore = getAdminFirestore(),
): Promise<number> {
  const snapshot = await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
    .where("context.purpose", "==", "renewal_owner")
    .get();
  return snapshot.docs.filter((doc) =>
    heldOnOwnerWordingPublish(doc.data() as Record<string, unknown>, doc.id),
  ).length;
}

function assertOwnerCopyApprover(actor: AuthenticatedUser) {
  if (!can(actor.role, "approve") || isVerificationAccount(actor))
    throw new EditableLayerError(
      "An existing template approver must publish the new owner wording.",
      403,
    );
}

/** R-S285-6: what the approver reads before publishing. Reads only. */
export async function previewOwnerCopyPublication(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  assertOwnerCopyApprover(actor);
  const read = await readOwnerCopyPublications(actor, db);
  return {
    status: read.v21Approved ? ("approved" as const) : ("ready" as const),
    heldCount: read.v21Approved ? 0 : await countOwnerMessagesHeldOnPublish(db),
  };
}

/**
 * R-S285-6: publish owner copy v2.1 through the existing template store as its own approved
 * record. The approver confirms the count they were shown; when the count changed since, nothing is
 * published and the current count is returned for a new review. No earlier version changes.
 */
export async function publishOwnerCopyV21(
  actor: AuthenticatedUser,
  expectedHeldCount: number,
  db: Firestore = getAdminFirestore(),
) {
  assertOwnerCopyApprover(actor);
  assertMutationAllowed(requireEnvironmentDescriptor());
  const expected = ownerCopyV21Publication();
  const existing = await getOwnerCopyV21Publication(actor, db);
  if (existing.status === "approved")
    return { ...existing, duplicate: true, heldCount: 0 };
  if (existing.exists)
    throw new EditableLayerError(
      "This owner wording version already exists with different or unapproved content. Review that template in the existing content workflow.",
      409,
    );
  const heldCount = await countOwnerMessagesHeldOnPublish(db);
  if (heldCount !== expectedHeldCount)
    throw Object.assign(
      new EditableLayerError(
        `The number of unsent owner messages changed to ${heldCount} since this review, so nothing was published. Review the new owner wording again.`,
        409,
      ),
      { heldCount },
    );
  await createTemplate(
    actor,
    "lease-renewals",
    {
      name: expected.name,
      body: expected.body,
      audience: "Owner",
      channel: "Gmail",
      status: "Approved",
      last_reviewed_at: new Date().toISOString(),
      note: `${OWNER_RENEWAL_COPY_V2_1.authority}; exact normalized v2.1 content ${expected.contentHash}.`,
    },
    db,
  );
  const readback = await getOwnerCopyV21Publication(actor, db);
  if (readback.status !== "approved")
    throw new EditableLayerError(
      "The new owner wording publication did not read back approved.",
      409,
    );
  return { ...readback, duplicate: false, heldCount };
}
