// S120 (R120.4): one output-readiness result for a prepared renewal message. It is computed from
// the same content, review and sender basis the final preparation uses, routes each genuine gap
// to the control that resolves it, and governs the supported final-body exports. Gmail transport,
// publication and recipient readiness stay separate gates and are never folded in here.

import { MESSAGE_CHARGES } from "@/lib/lease-renewal/renewal-message-content";
import { RENEWAL_RESOURCE_FIELDS } from "@/lib/lease-renewal/resource-locations";

export type MessageChannel = "owner" | "tenant";

export type MessageInputTarget =
  | { kind: "control"; id: string; label: string }
  | { kind: "route"; href: string; label: string };

export interface MessageMissingInput {
  field: string;
  message: string;
  target: MessageInputTarget;
}

export interface MessageReadinessInput {
  channel: MessageChannel;
  /** The deterministic content model's own missing list, in its order. */
  missing: ReadonlyArray<{ field: string; message: string }>;
  /** A content validation failure the composer raised for the current inputs. */
  contentError?: string;
  /** A preparation record exists for this lease, cycle and audience. */
  saved: boolean;
  /** Unsaved edits differ from the saved record. */
  dirty: boolean;
  /** The saved review does not match the current source facts. */
  needsReview: boolean;
  /** The saved signature belongs to the signed-in managed sender. */
  signatureMatchesActor: boolean;
  /** The saved record carries a signature at all. */
  signatureSaved: boolean;
}

export interface MessageReadiness {
  items: MessageMissingInput[];
  bodyReady: boolean;
  summary: string;
}

/** Stable element ids for the controls the readiness list can open and focus. */
export const MESSAGE_CONTROL_IDS = {
  inputs: (channel: MessageChannel) => `renewal-message-${channel}-inputs`,
  origin: (channel: MessageChannel) => `renewal-message-${channel}-origin`,
  charge: (channel: MessageChannel, id: string) =>
    `renewal-message-${channel}-charge-${id}`,
  insurance: (channel: MessageChannel) => `renewal-message-${channel}-insurance-policy`,
  signature: (channel: MessageChannel) => `renewal-message-${channel}-signature-name`,
  adoptSignature: (channel: MessageChannel) =>
    `renewal-message-${channel}-adopt-signature`,
  reviewed: (channel: MessageChannel) => `renewal-message-${channel}-reviewed`,
  readiness: (channel: MessageChannel) => `renewal-message-${channel}-readiness`,
  attachment: "renewal-message-owner-attachment",
} as const;

const RESOURCE_FIELD_BY_MESSAGE_FIELD: Record<string, string> = {
  insuranceFlyer: "insurance_flyer",
  rbpFlyer: "rbp_flyer",
  informationForm: "renewal_information_form",
};

/** The exact Connections entry for one shared resource; the anchor is the entry's own form. */
export function resourceEntryHref(resourceId: string): string {
  return `/connections#renewal-resource-entry-${resourceId}`;
}

function resourceLabel(resourceId: string): string {
  return (
    RENEWAL_RESOURCE_FIELDS.find((field) => field.id === resourceId)?.label ?? resourceId
  );
}

/** The control, section or page that resolves one content field for the given audience. */
export function messageInputTarget(
  channel: MessageChannel,
  field: string,
): MessageInputTarget {
  const control = (id: string, label: string): MessageInputTarget => ({
    kind: "control",
    id,
    label,
  });
  if (field === "names" || field === "address" || field === "leaseEndDate")
    return control("renewal-section-lease-details", "Lease details (source facts)");
  if (field === "currentBaseRent")
    return control("renewal-rent-and-charges", "Rent and charges: current base rent");
  if (field === "range" || field === "comps")
    return control("renewal-section-comps", "Market evidence: comp preparation");
  if (field === "attachment")
    return control(MESSAGE_CONTROL_IDS.attachment, "Reviewed screenshot attachment");
  if (field === "ownerTerms")
    return control("renewal-manual-owner_response", "Owner response and exact terms");
  if (field === "leaseOrigin")
    return control(MESSAGE_CONTROL_IDS.origin(channel), "Current lease origin");
  if (field.startsWith("charge.")) {
    const id = field.slice("charge.".length);
    const label = (MESSAGE_CHARGES as Record<string, string>)[id] ?? id;
    return control(MESSAGE_CONTROL_IDS.charge(channel, id), `${label} charge`);
  }
  if (field === "insuranceTransition")
    return control(
      MESSAGE_CONTROL_IDS.insurance(channel),
      "Insurance transition applicability",
    );
  if (field in RESOURCE_FIELD_BY_MESSAGE_FIELD) {
    const resourceId = RESOURCE_FIELD_BY_MESSAGE_FIELD[field];
    return {
      kind: "route",
      href: resourceEntryHref(resourceId),
      label: `Shared resource link: ${resourceLabel(resourceId)}`,
    };
  }
  if (field === "signature")
    return control(MESSAGE_CONTROL_IDS.signature(channel), "Managed sender signature");
  if (field === "signature_actor")
    return control(
      MESSAGE_CONTROL_IDS.adoptSignature(channel),
      "Signature for the signed-in sender",
    );
  if (field === "review")
    return control(MESSAGE_CONTROL_IDS.reviewed(channel), "Review and save");
  return control(MESSAGE_CONTROL_IDS.inputs(channel), "Message inputs");
}

/**
 * The actual missing requirements for the selected audience's final body, each with its target.
 * Optional fields (the response-request wording, signature decorations) never appear here because
 * the content model never lists them. Missing Gmail, publication or recipients never appear here
 * either: they gate the draft and the addressed copy, not the locally prepared body.
 */
export function projectMessageReadiness(input: MessageReadinessInput): MessageReadiness {
  const items: MessageMissingInput[] = [];
  if (input.contentError)
    items.push({
      field: "content",
      message: input.contentError,
      target: messageInputTarget(input.channel, "content"),
    });
  for (const entry of input.missing)
    items.push({
      field: entry.field,
      message: entry.message,
      target: messageInputTarget(input.channel, entry.field),
    });
  if (!input.saved || input.dirty || input.needsReview)
    items.push({
      field: "review",
      message: input.dirty
        ? "Save your edits, then review the message against its current facts."
        : "Review and save this preparation against its current source facts.",
      target: messageInputTarget(input.channel, "review"),
    });
  else if (input.signatureSaved && !input.signatureMatchesActor)
    items.push({
      field: "signature_actor",
      message: "Review the signature as the signed-in managed sender before final copy.",
      target: messageInputTarget(input.channel, "signature_actor"),
    });
  const bodyReady = items.length === 0;
  return {
    items,
    bodyReady,
    summary: bodyReady
      ? "Ready for final copy: every required input is reviewed."
      : `${items.length} input${items.length === 1 ? "" : "s"} remain for final use`,
  };
}
