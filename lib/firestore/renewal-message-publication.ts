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
import {
  SUPPLIED_RENEWAL_COPY,
  MESSAGE_CHARGES,
} from "@/lib/lease-renewal/renewal-message-content";

export function suppliedRenewalPublication(channel: "owner" | "tenant") {
  const document = {
    schemaVersion: "renewal-supplied-copy/v2",
    templateRef: `${channel}-renewal:v2.0`,
    version: SUPPLIED_RENEWAL_COPY.version,
    authority: SUPPLIED_RENEWAL_COPY.authority,
    channel,
    copy: SUPPLIED_RENEWAL_COPY[channel],
    chargeLabels: channel === "tenant" ? MESSAGE_CHARGES : {},
    signoff: SUPPLIED_RENEWAL_COPY.signoff,
    rules: [
      "Use current reviewed lease facts and explicit owner-approved terms.",
      "Conditional charges require amount, cadence, effective date, source and applicability.",
      "Do not reuse example amounts, recipient addresses, signature values, editing notes or colors.",
      "Unresolved links and absent legal content do not appear in recipient copy.",
      "HTML and plain text come from the same reviewed model; attachments remain exact reviewed files.",
      "The managed sender reviews an unsent draft and sends manually in Gmail.",
    ],
  };
  return {
    name: `Renewal ${channel} — supplied September 10 2026 v2.0`,
    body: JSON.stringify(document, null, 2),
    contentHash: hashExecutionPreview(document),
    ref: `${channel}-renewal:v2.0` as "owner-renewal:v2.0" | "tenant-renewal:v2.0",
  };
}

export async function getSuppliedRenewalPublication(
  actor: AuthenticatedUser,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
) {
  const expected = suppliedRenewalPublication(channel);
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
  ) {
    return {
      status: "unpublished" as const,
      ...expected,
      reason:
        "The supplied v2.0 copy is prepared; its exact approved content record has not been published or has changed.",
    };
  }
  return {
    status: "approved" as const,
    ...expected,
    templateId: record.id,
    approvedByUid: record.approved_by_uid,
    reviewedAt: record.last_reviewed_at,
  };
}

/** Uses the existing template owner, approver, unique-name and change-log mechanisms. No old version changes. */
export async function publishSuppliedRenewalTemplate(
  actor: AuthenticatedUser,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
) {
  if (!can(actor.role, "approve") || isVerificationAccount(actor))
    throw new EditableLayerError(
      "An existing template approver must publish supplied renewal content.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const expected = suppliedRenewalPublication(channel);
  const previous = (await listTemplates(actor, "lease-renewals", db)).find(
    (record) => record.name.trim().toLowerCase() === expected.name.toLowerCase(),
  );
  if (previous) {
    const readback = await getSuppliedRenewalPublication(actor, channel, db);
    if (readback.status !== "approved")
      throw new EditableLayerError(
        "This publication version already exists with different or unapproved content. Review that template in the existing content workflow.",
        409,
      );
    return { ...readback, duplicate: true };
  }
  await createTemplate(
    actor,
    "lease-renewals",
    {
      name: expected.name,
      body: expected.body,
      audience: channel === "owner" ? "Owner" : "Tenant",
      channel: "Gmail",
      status: "Approved",
      last_reviewed_at: new Date().toISOString(),
      note: `${SUPPLIED_RENEWAL_COPY.authority}; exact normalized v2.0 content ${expected.contentHash}.`,
    },
    db,
  );
  const readback = await getSuppliedRenewalPublication(actor, channel, db);
  if (readback.status !== "approved")
    throw new EditableLayerError(
      "The exact supplied template publication did not read back approved.",
      409,
    );
  return { ...readback, duplicate: false };
}
