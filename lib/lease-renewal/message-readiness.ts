// S120 (R120.4) / S161: the missing-value callout for a prepared renewal message. It is computed
// from the same content the message shows and routes each gap to the control or page where the
// value is recorded. S161: it is information only. Nothing in it withholds editing, copy or the
// unsent draft; a missing value is a named marker in the text and one line here. Gmail transport,
// publication and recipient readiness are separate and local to the draft step.

import { MESSAGE_CHARGES } from "@/lib/lease-renewal/renewal-message-content";
import { POLICY_PRODUCT_LABELS } from "@/lib/lease-renewal/policy-content";
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
  /** The message's own missing-value list, in its order. */
  missing: ReadonlyArray<{ field: string; message: string }>;
  /**
   * S131: policy notes for this audience from the one applicability projection. Empty for an
   * unrelated lease. They are listed as information.
   */
  policyGates?: ReadonlyArray<{ field: string; message: string }>;
}

export interface MessageReadiness {
  items: MessageMissingInput[];
  /** True when the message carries no marked or missing value. Never a permission. */
  complete: boolean;
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
  subject: (channel: MessageChannel) => `renewal-message-${channel}-subject`,
  body: (channel: MessageChannel) => `renewal-message-${channel}-body`,
  readiness: (channel: MessageChannel) => `renewal-message-${channel}-readiness`,
  refine: (channel: MessageChannel) => `renewal-message-${channel}-refine`,
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
    return control("renewal-working-terms", "Working renewal terms");
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
  if (field.startsWith("policy.")) {
    const key = field.slice("policy.".length);
    const label =
      (POLICY_PRODUCT_LABELS as Record<string, string>)[key] ?? `${key} policy`;
    return control(`renewal-policy-content-${key}`, `${label} content and applicability`);
  }
  if (field === "signature")
    return control(MESSAGE_CONTROL_IDS.signature(channel), "Managed sender signature");
  if (field === "marker") return control(MESSAGE_CONTROL_IDS.body(channel), "Email body");
  return control(MESSAGE_CONTROL_IDS.inputs(channel), "Message inputs");
}

/**
 * The values the selected audience's message does not have yet, each with where it is recorded.
 * Optional fields (the response-request wording, signature decorations) never appear here because
 * the content model never lists them. Gmail, publication and recipients never appear here either:
 * they belong to the draft step, not to the message text.
 */
export function projectMessageReadiness(input: MessageReadinessInput): MessageReadiness {
  const items: MessageMissingInput[] = [];
  for (const entry of input.missing)
    items.push({
      field: entry.field,
      message: entry.message,
      target: messageInputTarget(input.channel, entry.field),
    });
  for (const gate of input.policyGates ?? [])
    items.push({
      field: gate.field,
      message: gate.message,
      target: messageInputTarget(input.channel, gate.field),
    });
  const complete = items.length === 0;
  return {
    items,
    complete,
    summary: complete
      ? "Every value in this message is filled in."
      : `${items.length} ${items.length === 1 ? "value is" : "values are"} marked in this message. You can edit, copy and draft it as it is.`,
  };
}
