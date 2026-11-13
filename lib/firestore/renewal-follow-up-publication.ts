// S276 R-S276-8: the standard tenant follow-up message is its own versioned copy record, published
// by an existing template approver through the existing template publication (the template owner,
// approver, unique-name and change-log mechanisms of `createTemplate`), exactly as the supplied
// renewal copy is. It is a separate record and key from the tenant offer copy
// (`renewal-message-publication.ts`), which this module neither reads nor changes, so the offer's
// publication, its content hash and every tenant message in flight are untouched.
//
// Until this record reads back approved, the follow-up form opens with the timing filled in and the
// message blank. Shipping it, or publishing it, holds no message: the follow-up copy is in no send
// basis. Nothing in code publishes it; publishing is an approver's staff action.

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
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { FOLLOW_UP_COPY } from "@/lib/lease-renewal/follow-up-copy";

const SPACE = "lease-renewals";

/** The exact record a template approver publishes: its name, body and content hash. */
export function followUpCopyPublication() {
  const document = {
    schemaVersion: "renewal-follow-up-copy/v1",
    templateRef: FOLLOW_UP_COPY.ref,
    version: FOLLOW_UP_COPY.version,
    authority: FOLLOW_UP_COPY.authority,
    channel: "tenant",
    copy: {
      opening: FOLLOW_UP_COPY.opening,
      terms: FOLLOW_UP_COPY.terms,
      closing: FOLLOW_UP_COPY.closing,
    },
    signoff: FOLLOW_UP_COPY.signoff,
    rules: [
      "Fill the follow-up from the same reviewed lease facts as the tenant offer it follows.",
      "Use the first-name greeting and the sender signature rules of the tenant offer.",
      "Staff review and may change every word and every timing value before they confirm.",
      "Nothing is authorized until staff tick the follow-up option and confirm the review.",
    ],
  };
  return {
    name: `Renewal tenant follow-up, standard ${FOLLOW_UP_COPY.version}`,
    body: JSON.stringify(document, null, 2),
    contentHash: hashExecutionPreview(document),
    ref: FOLLOW_UP_COPY.ref,
  };
}

/** Whether the follow-up copy reads back approved, with the exact content. */
export async function getFollowUpCopyPublication(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  const expected = followUpCopyPublication();
  const matches = (await listTemplates(actor, SPACE, db)).filter(
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
      reason:
        "The standard follow-up message is prepared; its exact approved copy record has not been published or has changed.",
    };
  return {
    status: "approved" as const,
    ...expected,
    templateId: record.id,
    approvedByUid: record.approved_by_uid,
    reviewedAt: record.last_reviewed_at,
  };
}

/** An existing template approver publishes the follow-up copy. No other record changes. */
export async function publishFollowUpCopy(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  if (!can(actor.role, "approve") || isVerificationAccount(actor))
    throw new EditableLayerError(
      "An existing template approver must publish the standard follow-up message.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const expected = followUpCopyPublication();
  const previous = (await listTemplates(actor, SPACE, db)).find(
    (record) => record.name.trim().toLowerCase() === expected.name.toLowerCase(),
  );
  if (previous) {
    const readback = await getFollowUpCopyPublication(actor, db);
    if (readback.status !== "approved")
      throw new EditableLayerError(
        "This follow-up copy version already exists with different or unapproved content. Review that template in the existing content workflow.",
        409,
      );
    return { ...readback, duplicate: true };
  }
  await createTemplate(
    actor,
    SPACE,
    {
      name: expected.name,
      body: expected.body,
      audience: "Tenant",
      channel: "Gmail",
      status: "Approved",
      last_reviewed_at: new Date().toISOString(),
      note: `${FOLLOW_UP_COPY.authority}; exact standard follow-up ${FOLLOW_UP_COPY.version} content ${expected.contentHash}.`,
    },
    db,
  );
  const readback = await getFollowUpCopyPublication(actor, db);
  if (readback.status !== "approved")
    throw new EditableLayerError(
      "The standard follow-up message publication did not read back approved.",
      409,
    );
  return { ...readback, duplicate: false };
}
