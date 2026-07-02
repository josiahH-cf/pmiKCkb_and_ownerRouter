// Owner-notice DRAFT for Maintenance Work Order Intake (M-5, owner 2026-07-01: build the owner-notice
// stage as a non-executable DRAFT).
//
// Composes a source-tagged draft notice to the property owner from a WorkOrderDraft, in the same
// draft-only shape as the renewal owner email (reuses DraftFact). GOVERNANCE: draft ONLY —
// `production_allowed` and `send_allowed` are literal `false`; a human approves and sends. Any fact we
// don't have (owner name, an unmatched unit) renders a visible `Needs Verification:` marker, never an
// invented value. Pure + deterministic: no I/O, no Date.now().

import type { DraftFact } from "@/lib/lease-renewal/owner-draft";
import type { WorkOrderDraft } from "@/lib/maintenance/work-order-draft";

const NEEDS_VERIFICATION = "Needs Verification";

export interface OwnerNoticeInput {
  workOrder: WorkOrderDraft;
  /** Owner recipient name, if known; absent → a Needs-Verification marker. */
  ownerName?: string;
  /** A human property label, if nicer than the matched unit label. */
  propertyLabel?: string;
}

export interface OwnerNoticeDraft {
  kind: "maintenance_owner_notice";
  subject: string;
  body: string;
  facts: DraftFact[];
  /** Inputs that were absent and rendered as `Needs Verification:` markers. */
  missingInputs: string[];
  production_allowed: false;
  send_allowed: false;
}

function isUnverified(value: string | undefined | null): boolean {
  return !value || value.startsWith(NEEDS_VERIFICATION);
}

/** Compose a source-tagged owner maintenance-notice draft. No send; missing inputs stay visible. */
export function buildOwnerNoticeDraft(input: OwnerNoticeInput): OwnerNoticeDraft {
  const { workOrder } = input;
  const facts: DraftFact[] = [];
  const missingInputs: string[] = [];

  const rawProperty = input.propertyLabel ?? workOrder.unit?.label;
  const propertyResolved = !isUnverified(rawProperty);
  const property = propertyResolved
    ? (rawProperty as string)
    : `[${NEEDS_VERIFICATION}: property/unit, match the location to a unit]`;
  if (!propertyResolved) missingInputs.push("property/unit (unmatched location)");
  facts.push({
    key: "property",
    label: "Property",
    value: property,
    source: "Maintenance intake (RentVine unit match)",
    confidence: propertyResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  facts.push({
    key: "issue",
    label: "Reported issue",
    value: workOrder.summary,
    source: "Maintenance intake (reporter)",
    confidence: "Likely",
  });
  facts.push({
    key: "priority",
    label: "Priority",
    value: workOrder.priority,
    source: "Maintenance intake",
    confidence: "Likely",
  });
  facts.push({
    key: "photos",
    label: "Photos on file",
    value: String(workOrder.photoRefs.length),
    source: "Maintenance intake",
    confidence: "Verified",
  });

  const ownerResolved = !isUnverified(input.ownerName);
  const ownerName = ownerResolved
    ? (input.ownerName as string)
    : `[${NEEDS_VERIFICATION}: owner name]`;
  if (!ownerResolved) missingInputs.push("owner name/contact");
  facts.push({
    key: "owner",
    label: "Owner",
    value: ownerName,
    source: "Owner record",
    confidence: ownerResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  const photoLine =
    workOrder.photoRefs.length > 0
      ? `${workOrder.photoRefs.length} photo(s) are on file.`
      : "No photos are on file yet.";

  const subject = `Maintenance request for ${property}`;
  const body = [
    `Hello ${ownerName},`,
    ``,
    `We received a maintenance request at ${property}: ${workOrder.summary}.`,
    `Priority: ${workOrder.priority}. ${photoLine}`,
    ``,
    `We'll coordinate getting this addressed and keep you posted. If you have a preferred vendor or any questions, just let us know.`,
    ``,
    `Thanks,`,
    `PMI KC Metro`,
  ].join("\n");

  return {
    kind: "maintenance_owner_notice",
    subject,
    body,
    facts,
    missingInputs,
    production_allowed: false,
    send_allowed: false,
  };
}
