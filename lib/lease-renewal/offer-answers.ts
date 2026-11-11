// S264 R-S264-6 (AC-S264-6): which exact offer a recorded answer covers.
//
// A tenant decision names the offer it answers: the confirmed send that carried the offer (its
// frozen snapshot), or an app-prepared offer staff verified was sent outside the app, with their
// reference. The newest unsent draft is never chosen for them. An answer that cannot be tied to
// one exact offer is recorded with that scope, and current acceptance then needs verification.
//
// An owner approval covers the offer's exact charge rows only when staff record, with the
// approval's own evidence, that the owner approved the reviewed offer as it stands: the server
// binds the snapshot current at that moment, with the approved base and dates, in the same
// transaction as the answer. An amount-only answer never covers charges, and an exact-terms
// answer covers only the base and dates.
//
// Coverage is rechecked wherever an answer is shown or used: an answer to an earlier offer never
// covers the current one, even when only one charge changed. The answer, its message and its
// evidence stay exactly as recorded. A human reply that paused a message is not a decision.
//
// The records live in their own collection keyed by the answer's event, so the strict work record
// is unchanged and an older version of the app reads every answer exactly as before.

import { z } from "zod";

import { cadenceLabel, formatCents } from "./offer-charges";
import {
  ownerApprovalScope,
  type OwnerApprovalScope,
  type OfferSnapshotIdentity,
} from "./owner-approval-scope";
import {
  describeOfferSnapshotChanges,
  offerSnapshotIntact,
  offerTermsUnchanged,
  type FrozenOfferSnapshot,
} from "./offer-snapshot";
import type { RenewalWorkspaceState } from "./workspace-state";

export const OFFER_ANSWER_SCHEMA_VERSION = "renewal-offer-answer/v1";

const evidenceText = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]|\{\{|\}\}/.test(value),
    "Use plain text without control characters or template tokens.",
  );
const reference = z.string().trim().min(1).max(160);

/** What the save request names about the exact offer an answer covers. */
export const OfferAnswerInputSchema = z.discriminatedUnion("kind", [
  /** A tenant decision answering the offer a confirmed send carried. */
  z
    .object({
      kind: z.literal("linked_communication"),
      sequenceId: reference,
      occurrenceId: reference,
    })
    .strict(),
  /** A tenant decision answering an app-prepared offer staff verified was sent outside the app. */
  z
    .object({
      kind: z.literal("external_offer"),
      executionId: reference,
      reference: evidenceText,
    })
    .strict(),
  /** A tenant decision that cannot be tied to one exact offer. */
  z.object({ kind: z.literal("unattributed") }).strict(),
  /** An owner approval of the reviewed offer as it stands, charges included. */
  z
    .object({
      kind: z.literal("owner_reviewed_offer"),
      snapshotId: reference,
      snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type OfferAnswerInput = z.infer<typeof OfferAnswerInputSchema>;

export type OfferAnswerAttribution =
  | {
      readonly kind: "linked_communication";
      readonly sequenceId: string;
      readonly occurrenceId: string;
      readonly sentAtMs: number | null;
    }
  | {
      readonly kind: "external_offer";
      readonly executionId: string;
      readonly reference: string;
      readonly reviewedByUid: string;
    }
  | { readonly kind: "unattributed" }
  | { readonly kind: "owner_reviewed_offer"; readonly reviewedByUid: string };

export interface OfferAnswerRecord {
  readonly schemaVersion: typeof OFFER_ANSWER_SCHEMA_VERSION;
  readonly leaseId: string;
  readonly cycleId: string;
  /** The recorded answer's own event (its work record entry). */
  readonly eventId: string;
  readonly party: "tenant" | "owner";
  readonly outcome: string;
  readonly attribution: OfferAnswerAttribution;
  /** The exact offer the answer covers; null when it is not tied to one. */
  readonly offer: FrozenOfferSnapshot | null;
  readonly recordedAt: string;
  readonly recordedByUid: string;
}

/** The tenant decisions that answer an offer (a wait or a check answers none). */
export const TENANT_DECISION_OUTCOMES: ReadonlySet<string> = new Set([
  "accepted",
  "counter_change_requested",
  "declined_nonrenewing",
]);

/** A stored record read back, kept only when its shape and frozen offer are intact. */
export function readOfferAnswerRecord(raw: unknown): OfferAnswerRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<OfferAnswerRecord>;
  if (
    value.schemaVersion !== OFFER_ANSWER_SCHEMA_VERSION ||
    typeof value.leaseId !== "string" ||
    typeof value.cycleId !== "string" ||
    typeof value.eventId !== "string" ||
    (value.party !== "tenant" && value.party !== "owner") ||
    typeof value.outcome !== "string" ||
    !value.attribution ||
    typeof value.attribution !== "object"
  )
    return null;
  if (value.offer !== null && (!value.offer || !offerSnapshotIntact(value.offer)))
    return null;
  return value as OfferAnswerRecord;
}

export type OfferAnswerCoverage =
  /** No exact offer is recorded for this answer. */
  | { readonly state: "not_attributed" }
  /** The answer covers the current offer exactly. */
  | { readonly state: "covers" }
  /** The answer covers an earlier offer; these are the differences, in staff words. */
  | {
      readonly state: "earlier_offer";
      readonly changes: readonly string[];
      /** True when only the charges differ (the base and dates are the ones answered). */
      readonly chargesOnly: boolean;
    }
  /** The current offer could not be read, so coverage is not known. */
  | { readonly state: "current_unknown" };

/** Recheck an answer against the current offer: equal identity covers, anything else does not. */
export function offerAnswerCoverage(
  record: Pick<OfferAnswerRecord, "offer"> | null,
  current: FrozenOfferSnapshot | null | undefined,
): OfferAnswerCoverage {
  if (!record?.offer) return { state: "not_attributed" };
  if (!current) return { state: "current_unknown" };
  if (
    record.offer.snapshotId === current.snapshotId &&
    record.offer.snapshotHash === current.snapshotHash
  )
    return { state: "covers" };
  return {
    state: "earlier_offer",
    changes: describeOfferSnapshotChanges(record.offer.snapshot, current.snapshot),
    chargesOnly: offerTermsUnchanged(record.offer.snapshot, current.snapshot),
  };
}

/** The tenant decision's coverage in staff words; acceptance of an uncovered offer needs verification. */
export function describeTenantAnswerCoverage(
  outcome: string,
  coverage: OfferAnswerCoverage,
): string {
  const accepted = outcome === "accepted";
  const lead = accepted
    ? "Current acceptance needs verification"
    : "This answer needs verification";
  switch (coverage.state) {
    case "covers":
      return accepted
        ? "This acceptance answers the current offer."
        : "This answer responds to the current offer.";
    case "not_attributed":
      return `${lead}: the answer is not linked to one exact offer.`;
    case "current_unknown":
      return `${lead}: the current offer could not be read to compare.`;
    case "earlier_offer":
      return `${lead}: it answers an earlier offer. ${coverage.changes.join(" ")}`.trim();
  }
}

/** The owner's approval coverage of the offer's charges, in staff words. */
export function describeOwnerOfferCoverage(
  scope: OwnerApprovalScope | null,
  coverage: OfferAnswerCoverage,
): string {
  if (scope?.kind === "amount_only")
    return "The owner approved the base rent only, so the offer's charges are not covered.";
  if (scope?.kind !== "offer_snapshot")
    return "The owner's approval covers the base and dates, not the offer's charges.";
  switch (coverage.state) {
    case "covers":
      return "The owner's approval covers the current offer, charges included.";
    case "current_unknown":
      return "The owner approved an exact offer; the current offer could not be read to compare.";
    case "not_attributed":
      return "The owner's approval covers the base and dates, not the offer's charges.";
    case "earlier_offer":
      return `The owner approved an earlier offer, so the current offer's charges are not covered. ${coverage.changes.join(" ")}`.trim();
  }
}

/** What the response editors show and offer, carried with the tenant message's own read. */
export interface OfferAnswersView {
  readonly current: {
    readonly snapshotId: string;
    readonly snapshotHash: string;
    readonly summary: string;
    readonly charged: boolean;
  } | null;
  readonly candidates: readonly {
    readonly kind: "linked_communication" | "external_offer";
    readonly sequenceId?: string;
    readonly occurrenceId?: string;
    readonly executionId?: string;
    readonly at: string | null;
    readonly snapshotId: string;
    readonly summary: string;
    readonly current: boolean;
  }[];
  readonly tenant: {
    readonly outcome: string;
    readonly eventId: string;
    readonly attribution: OfferAnswerAttribution["kind"] | null;
    readonly answered: string | null;
    readonly coverage: OfferAnswerCoverage["state"];
    readonly line: string;
  } | null;
  readonly owner: {
    readonly eventId: string;
    readonly scope: OwnerApprovalScope["kind"];
    readonly coverage: OfferAnswerCoverage["state"];
    readonly line: string;
  } | null;
}

/** An offer's terms and charges in one line, as staff review them. */
export function offerSummary(snapshot: FrozenOfferSnapshot["snapshot"]): string {
  const rows = snapshot.rows.map(
    (row) =>
      `${row.label} ${row.amountCents === null ? "(amount not entered)" : formatCents(row.amountCents)}${row.cadence ? ` ${cadenceLabel(row.cadence)}` : ""}`,
  );
  const base =
    snapshot.base.rent === null
      ? null
      : `Rent ${formatCents(Math.round(snapshot.base.rent * 100))} per month`;
  return [base, ...(rows.length ? rows : ["no other charges"])]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

/**
 * The response editors' view: the current offer, the offers a tenant decision can name, and each
 * recorded answer's coverage of the current offer, rechecked now.
 */
export function buildOfferAnswersView(input: {
  readonly workspace: RenewalWorkspaceState | null;
  readonly current: FrozenOfferSnapshot | null;
  readonly candidates: readonly {
    readonly kind: "linked_communication" | "external_offer";
    readonly sequenceId?: string;
    readonly occurrenceId?: string;
    readonly executionId?: string;
    readonly atMs: number | null;
    readonly offer: FrozenOfferSnapshot;
  }[];
  readonly tenantRecord: OfferAnswerRecord | null;
  readonly ownerRecord: OfferAnswerRecord | null;
}): OfferAnswersView {
  const { workspace, current } = input;
  const tenant = workspace?.tenantResponse ?? null;
  // Each answer's own record, by its event: a record of another answer or party covers nothing.
  const tenantRecord =
    input.tenantRecord?.party === "tenant" && input.tenantRecord.eventId === tenant?.eventId
      ? input.tenantRecord
      : null;
  const ownerRecord = input.ownerRecord?.party === "owner" ? input.ownerRecord : null;
  const tenantCoverage = offerAnswerCoverage(tenantRecord, current);
  const scope = ownerApprovalScope(workspace, ownerOfferApproval(ownerRecord));
  const ownerCoverage = offerAnswerCoverage(
    scope?.kind === "offer_snapshot" ? ownerRecord : null,
    current,
  );
  return {
    current: current
      ? {
          snapshotId: current.snapshotId,
          snapshotHash: current.snapshotHash,
          summary: offerSummary(current.snapshot),
          charged: current.snapshot.rows.length > 0,
        }
      : null,
    candidates: input.candidates.map((candidate) => ({
      kind: candidate.kind,
      ...(candidate.sequenceId ? { sequenceId: candidate.sequenceId } : {}),
      ...(candidate.occurrenceId ? { occurrenceId: candidate.occurrenceId } : {}),
      ...(candidate.executionId ? { executionId: candidate.executionId } : {}),
      at: candidate.atMs === null ? null : new Date(candidate.atMs).toISOString(),
      snapshotId: candidate.offer.snapshotId,
      summary: offerSummary(candidate.offer.snapshot),
      current:
        current !== null &&
        candidate.offer.snapshotId === current.snapshotId &&
        candidate.offer.snapshotHash === current.snapshotHash,
    })),
    tenant: tenant
      ? {
          outcome: tenant.outcome,
          eventId: tenant.eventId,
          attribution: tenantRecord?.attribution.kind ?? null,
          answered: tenantRecord?.offer ? offerSummary(tenantRecord.offer.snapshot) : null,
          coverage: tenantCoverage.state,
          line: describeTenantAnswerCoverage(tenant.outcome, tenantCoverage),
        }
      : null,
    owner:
      scope && workspace?.ownerResponse
        ? {
            eventId: workspace.ownerResponse.eventId,
            scope: scope.kind,
          coverage: ownerCoverage.state,
          line: describeOwnerOfferCoverage(scope, ownerCoverage),
        }
      : null,
  };
}

/** S262's identity for the offer an owner approval record binds, for `ownerApprovalScope`. */
export function ownerOfferApproval(
  record: OfferAnswerRecord | null,
): { eventId: string; cycleId: string; offer: OfferSnapshotIdentity } | null {
  if (!record || record.party !== "owner" || !record.offer) return null;
  return {
    eventId: record.eventId,
    cycleId: record.cycleId,
    offer: {
      snapshotId: record.offer.snapshotId,
      snapshotHash: record.offer.snapshotHash,
    },
  };
}
