import { z } from "zod";
import { RENEWAL_STEPPER_STEPS } from "@/lib/lease-renewal/renewal-process";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  sheetFieldShape,
  type SheetFieldIntent,
  type SheetEditableField,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { RenewalMarketBasis } from "@/lib/lease-renewal/renewal-progress";
import {
  ApprovedBaseInputSchema,
  type ApprovedBase,
} from "@/lib/lease-renewal/owner-approval-scope";
import {
  OFF_CYCLE_DECISIONS,
  OFF_CYCLE_REASON_MAX,
  OFF_CYCLE_REVIEW_WORDS,
  type OffCycleEndDateReview,
} from "@/lib/lease-renewal/off-cycle-review";

const text = z.string().trim().min(1).max(500);
export const renewalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Enter a valid date.",
  );
const money = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
    "Use cents precision.",
  );
export const RenewalTermsSchema = z
  .object({
    rent: money.refine((value) => value > 0),
    effectiveDate: renewalDate,
    endDate: renewalDate,
  })
  .strict()
  .refine(
    (value) => value.endDate > value.effectiveDate,
    "The end date must follow the effective date.",
  );
export const CycleBasisSchema = z
  .object({
    kind: z.enum(["lease_end", "review_date"]),
    dateIso: renewalDate,
    source: text,
  })
  .strict();
export type RenewalCycleBasis = z.infer<typeof CycleBasisSchema>;
/**
 * S154: a work record for a lease whose source reports no lease end or review date when work is
 * first saved. It carries no date, so none is invented to satisfy the dated cycle shape.
 */
export const LeaseBoundBasisSchema = z
  .object({ kind: z.literal("lease_bound"), source: text })
  .strict();
export type RenewalLeaseBoundBasis = z.infer<typeof LeaseBoundBasisSchema>;
export type RenewalWorkBasis = RenewalCycleBasis | RenewalLeaseBoundBasis;
export function parseRenewalWorkBasis(basis: unknown): RenewalWorkBasis {
  return (basis as { kind?: unknown } | null)?.kind === "lease_bound"
    ? LeaseBoundBasisSchema.parse(basis)
    : CycleBasisSchema.parse(basis);
}
/** The recorded basis date, or null for a lease-bound record that has none. */
export function workBasisDateIso(basis: RenewalWorkBasis): string | null {
  return basis.kind === "lease_bound" ? null : basis.dateIso;
}
/** S156: the label stored when staff record work without naming a source or channel. */
export const STAFF_RECORD_SOURCE = "Staff record";
export const MANUAL_ACTIVITIES = {
  // S251 R-S251-4: the housing program contact about its renewal process. Part of the path only
  // for a lease whose Housing assistance fact is Yes; its outcome, date and the program's
  // requirements (as notes) are recorded with the same activity form as every other activity.
  program_contact: {
    label: "Housing program contact about the renewal process",
    section: "owner",
    conditional: true,
  },
  owner_outreach: { label: "Owner outreach", section: "owner", conditional: false },
  tenant_offer: {
    label: "Tenant offer delivered",
    section: "tenant",
    conditional: false,
  },
  information_form: {
    label: "Information form sent",
    section: "tenant",
    conditional: true,
  },
  form_returned: {
    label: "Information form returned",
    section: "tenant",
    conditional: true,
  },
  documents: {
    label: "Required documents prepared",
    section: "documents",
    conditional: false,
  },
  document_delivery: {
    label: "Required documents delivered",
    section: "documents",
    conditional: false,
  },
  signatures: {
    label: "Required signatures complete",
    section: "documents",
    conditional: false,
  },
  insurance: {
    label: "Insurance and additional insured follow-up",
    section: "documents",
    conditional: true,
  },
  rhino: { label: "Rhino renewal follow-up", section: "documents", conditional: true },
  pet: { label: "Animal follow-up", section: "documents", conditional: true },
  charges: {
    label: "Applicable recurring-charge follow-up",
    section: "documents",
    conditional: true,
  },
  inspection: { label: "Inspection follow-up", section: "documents", conditional: true },
  filter: {
    label: "Air filter delivery follow-up",
    section: "documents",
    conditional: true,
  },
  utilities: {
    label: "Utility proof follow-up",
    section: "documents",
    conditional: true,
  },
  assisted_housing: {
    label: "Applicable assisted-housing form, owner signature and submission follow-up",
    section: "documents",
    conditional: true,
  },
  non_renewal_handoff: {
    label: "Non-renewal handoff recorded",
    section: "documents",
    conditional: false,
  },
} as const;
export type ManualActivity = keyof typeof MANUAL_ACTIVITIES;
const activityKeys = Object.keys(MANUAL_ACTIVITIES) as [
  ManualActivity,
  ...ManualActivity[],
];
/**
 * S234 R-S234-1: who approved for the owner, how and when, as staff choose them. Nothing is
 * pre-selected from an incoming message; the store verifies the party against the lease's current
 * owner roster and a linked reply against this lease's own owner renewal thread.
 */
export const OwnerApprovalInputSchema = z
  .object({
    party: z
      .discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("owner"),
            sourceRef: z.string().trim().min(1).max(300),
            // PR #162 review: the owner as staff saw them, and the roster they chose from.
            label: z.string().trim().min(1).max(200),
            rosterFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
        z
          .object({
            kind: z.literal("representative"),
            name: z.string().trim().min(1).max(200),
            capacity: z.string().trim().min(1).max(200),
          })
          .strict(),
      ])
      .optional(),
    channel: z
      .discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("linked_reply"),
            sequenceId: z.string().uuid(),
            evidenceId: z.string().trim().min(1).max(300),
          })
          .strict(),
        z
          .object({
            kind: z.literal("written"),
            medium: z.string().trim().min(1).max(120),
            reference: z.string().trim().min(1).max(240),
          })
          .strict(),
        z
          .object({
            kind: z.literal("conversation"),
            participants: z.string().trim().min(1).max(240),
          })
          .strict(),
      ])
      .optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type OwnerApprovalInput = z.infer<typeof OwnerApprovalInputSchema>;
/** S234 R-S234-1: the approval evidence the store verified and the record keeps. */
export const OwnerApprovalEvidenceSchema = z
  .object({
    party: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("owner"),
          label: z.string().min(1),
          sourceRef: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("representative"),
          name: z.string().min(1),
          capacity: z.string().min(1),
        })
        .strict(),
    ]),
    channel: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("linked_reply"),
          sequenceId: z.string().uuid(),
          senderEmail: z.string().min(1),
          threadId: z.string().min(1),
          messageId: z.string().min(1),
          receivedAt: z.string().datetime(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("written"),
          medium: z.string().min(1),
          reference: z.string().min(1),
        })
        .strict(),
      z
        .object({ kind: z.literal("conversation"), participants: z.string().min(1) })
        .strict(),
    ]),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type OwnerApprovalEvidence = z.infer<typeof OwnerApprovalEvidenceSchema>;
/** S234 BEH-S234-1: the approval items still missing, named for the refusal; null when none. */
export function missingOwnerApprovalItems(input: OwnerApprovalInput | undefined) {
  const missing = [
    !input?.party &&
      "who approved (an owner of record, or an authorized representative with name and capacity)",
    !input?.channel &&
      "how they approved (a reply in this lease's renewal thread, another written channel with its reference, or a conversation with its participants)",
    !input?.occurredAt && "when they approved",
  ].filter((item): item is string => Boolean(item));
  return missing.length ? `Before recording Approved, add ${missing.join("; ")}.` : null;
}
const common = {
  // S156: staff knowledge from a call or outside work needs no narrative; the store labels an
  // unnamed source as a plain staff record.
  source: text.max(240).optional(),
  reason: z.string().trim().max(1000).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
};
export const RenewalWorkspaceActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("activity"),
      activity: z.enum(activityKeys),
      outcome: z.enum(["not_started", "waiting", "done", "not_applicable"]),
      applicabilityPolicy: text.max(240).optional(),
      ...common,
    })
    .strict(),
  z
    .object({
      kind: z.literal("owner_response"),
      outcome: z.enum([
        "approved_terms",
        "revision_requested",
        "declined_non_renewal",
        "no_response",
        // S251 R-S251-5: the owner wants to renew this tenant; the rent is decided separately.
        "renew_tenant",
      ]),
      terms: RenewalTermsSchema.optional(),
      approval: OwnerApprovalInputSchema.optional(),
      // S262 R-S262-1: the exact Amount approved and what the answer covers, approving branch only.
      approvedBase: ApprovedBaseInputSchema.optional(),
      ...common,
    })
    .strict(),
  // S251 R-S251-6: "Rent for this renewal" on an assisted lease, recorded for this cycle.
  z
    .object({
      kind: z.literal("rent_choice"),
      choice: z.enum(["keep_current", "propose_change"]),
      ...common,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tenant_response"),
      outcome: z.enum([
        "awaiting_response",
        "accepted",
        "counter_change_requested",
        "declined_nonrenewing",
        "needs_verification",
      ]),
      ...common,
    })
    .strict(),
  z.object({ kind: z.literal("complete"), ...common }).strict(),
  z.object({ kind: z.literal("reopen"), ...common }).strict(),
  // S282 R-S282-1: the review of an off-cycle lease end date, for the exact value staff reviewed.
  // The reason is required: the operating rule says to record why an atypical lease is included
  // or held. One short line, not an attestation.
  z
    .object({
      kind: z.literal("end_date_review"),
      decision: z.enum(OFF_CYCLE_DECISIONS, {
        error: OFF_CYCLE_REVIEW_WORDS.decisionRequired,
      }),
      endDateIso: renewalDate,
      ...common,
      reason: z
        .string({ error: OFF_CYCLE_REVIEW_WORDS.reasonRequired })
        .trim()
        .min(1, OFF_CYCLE_REVIEW_WORDS.reasonRequired)
        .max(OFF_CYCLE_REASON_MAX),
    })
    .strict(),
  z
    .object({
      kind: z.literal("preparation"),
      rangeLow: money.optional(),
      rangeHigh: money.optional(),
      pmiNumber: money.optional(),
      // S118: the browser declares only a downgrade-capable origin; the server compares the
      // saved range against the fresh starting rule again before the owner message uses it.
      rangeBasis: z.enum(["starting_rule", "provider", "reviewed"]).optional(),
      recommendationBasis: z.enum(["provider", "reviewed"]).optional(),
      observationId: z.string().uuid().nullable().optional(),
      trendObservationId: z.string().uuid().optional(),
      analysisReference: z.string().trim().max(1000).optional(),
      ...common,
    })
    .strict(),
]);
export type RenewalWorkspaceAction = z.infer<typeof RenewalWorkspaceActionSchema>;
/**
 * S66 (AC-S66-8): the exact Working renewal terms and economic decisions an owner approval covers,
 * captured by the server when staff record the approval. Absent when the Working terms were
 * incomplete at that moment; the packet then names the missing approval instead of using it.
 */
export interface ApprovedWorkingTerms {
  rent: number;
  effectiveDate: string;
  endDate: string;
  /** Each Working terms field revision at approval; any later save of a term makes it stale. */
  fieldRevisions: { rent: number; effectiveDate: number; endDate: number };
  /** The calculated charges the approval covered (policy version, applicability and amounts). */
  economicsHash: string;
  chargePolicyVersion: string | null;
}
export const ApprovedWorkingTermsSchema = z
  .object({
    rent: z.number().finite().positive(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fieldRevisions: z
      .object({
        rent: z.number().int().positive(),
        effectiveDate: z.number().int().positive(),
        endDate: z.number().int().positive(),
      })
      .strict(),
    economicsHash: z.string().regex(/^[a-f0-9]{64}$/),
    chargePolicyVersion: z.string().min(1).nullable(),
  })
  .strict();
export interface StaffRecord {
  eventId: string;
  actorUid: string;
  recordedAt: string;
  source: string;
  reason?: string;
  occurredAt?: string;
  termsRevision: number;
}
export interface StaffActivityRecord extends StaffRecord {
  /** Staff-cited existing policy/predicate; this record grants no policy or provider authority. */
  applicabilityPolicy?: string;
  outcome: "not_started" | "waiting" | "done" | "not_applicable";
}
export interface RenewalWorkspaceState {
  schemaVersion: "renewal-workspace/v1";
  leaseId: string;
  cycleId: string;
  /**
   * S262 R-S262-5: the cycle this work record replaced when it was established; null for the
   * lease's first cycle. Absent on records established before cycles bound future terms.
   */
  previousCycleId?: string | null;
  basis: RenewalWorkBasis;
  revision: number;
  termsRevision: number;
  ownerResponse:
    | (StaffRecord & {
        outcome:
          | "approved_terms"
          | "revision_requested"
          | "declined_non_renewal"
          | "no_response"
          | "renew_tenant";
        terms?: z.infer<typeof RenewalTermsSchema>;
        approvedWorkingTerms?: ApprovedWorkingTerms;
        /** S234 R-S234-1: who approved, how and when; absent on records made before S234. */
        approval?: OwnerApprovalEvidence;
        /**
         * S262 R-S262-1/3: the exact amount the owner approved, the working base revision it
         * covers and its scope. Absent on answers recorded without an amount, and never backfilled.
         */
        approvedBase?: ApprovedBase;
      })
    | null;
  tenantResponse:
    | (StaffRecord & {
        outcome:
          | "awaiting_response"
          | "accepted"
          | "counter_change_requested"
          | "declined_nonrenewing"
          | "needs_verification";
        /** S234 R-S234-5: the Working term revisions current when the answer was recorded. */
        workingTermRevisions?: WorkingTermRevisions;
      })
    | null;
  activities: Partial<Record<ManualActivity, StaffActivityRecord>>;
  /**
   * S251 R-S251-6: the staff choice for "Rent for this renewal" on this cycle. Absent on records
   * made before S251 and on every lease where no choice was recorded.
   */
  rentChoice?: (StaffRecord & { choice: "keep_current" | "propose_change" }) | null;
  completion: StaffRecord | null;
  preparation: {
    market: RenewalMarketBasis;
    source: string;
    analysisReference?: string;
    observationId?: string;
    recordedAt: string;
    recordedByUid: string;
    revision: number;
  } | null;
  sourceUpdates: Record<
    string,
    {
      eventId: string;
      intent: SheetFieldIntent;
      state: "pending" | "prepared" | "verified" | "unavailable";
      proposalId?: string;
      executionId?: string;
      reason?: string;
      /**
       * S248 R-S248-11: the value comes from the app's own confirmed send, never a staff entry.
       * It is bound to that exact message; absent on every staff-recorded value.
       */
      derivedFrom?: { sequenceId: string; occurrenceId: string };
      /**
       * S278 R-S278-1: a Market value prepared from the reviewed current-cycle recommendation,
       * bound to that exact entry and how it was reviewed. Absent on every other value.
       */
      fromRecommendation?: {
        field: "terms_rent" | "recommended_rent";
        revision: number;
        eventId: string;
        review: "staff_save" | "owner_message_review";
      };
      /** S278 R-S278-3: when the confirmed update's receipt was created, once it is read back. */
      receiptAt?: string;
    }
  >;
  /**
   * S282 R-S282-1/3: the off-cycle end date reviews recorded on this cycle, oldest first. Each is
   * bound to the exact end date value reviewed; only one matching the lease end the source
   * reports now is current, and the rest are history. Absent on records made before S282.
   */
  endDateReviews?: OffCycleEndDateReview[];
}
export function emptyRenewalWorkspace(
  leaseId: string,
  cycleId: string,
  basis: RenewalWorkBasis,
): RenewalWorkspaceState {
  return {
    schemaVersion: "renewal-workspace/v1",
    leaseId,
    cycleId,
    basis: parseRenewalWorkBasis(basis),
    revision: 0,
    termsRevision: 0,
    ownerResponse: null,
    tenantResponse: null,
    activities: {},
    completion: null,
    preparation: null,
    sourceUpdates: {},
  };
}
const TERMS_DEPENDENT_MANUAL: readonly ManualActivity[] = [
  "tenant_offer",
  "documents",
  "document_delivery",
  "signatures",
  "charges",
  "assisted_housing",
];
export function currentStaffActivity(state: RenewalWorkspaceState, key: ManualActivity) {
  const record = state.activities[key];
  return record &&
    (!TERMS_DEPENDENT_MANUAL.includes(key) ||
      record.termsRevision === state.termsRevision)
    ? record
    : null;
}
/**
 * S234 R-S234-2 (ARCH-S234-2): the staff record's owner outcome, the cycle's one owner outcome.
 * With `endDateIso` it is read only when the record belongs to that lease term. Null when staff
 * have recorded no owner response for it; only then is an earlier progress-route record read.
 */
export function staffOwnerOutcome(
  state: RenewalWorkspaceState | null | undefined,
  endDateIso?: string | null,
): Exclude<
  NonNullable<RenewalWorkspaceState["ownerResponse"]>["outcome"],
  "renew_tenant"
> | null {
  if (!state?.ownerResponse) return null;
  const basis = workBasisDateIso(state.basis);
  if (endDateIso !== undefined && basis !== null && basis !== endDateIso) return null;
  // S251: "Renew" answers whether to renew the tenant; the owner's rent decision is still to come,
  // so the earlier process model reads it as awaiting the owner's response.
  return state.ownerResponse.outcome === "renew_tenant"
    ? "no_response"
    : state.ownerResponse.outcome;
}
export function currentManualOwnerTerms(state: RenewalWorkspaceState) {
  return state.ownerResponse?.outcome === "approved_terms"
    ? (state.ownerResponse.terms ?? null)
    : null;
}
/** The renewal branch's required staff activities, in the order the summary checks them. */
export const MANUAL_REQUIRED_RENEWAL: readonly ManualActivity[] = Object.freeze([
  "owner_outreach",
  "tenant_offer",
  "information_form",
  "form_returned",
  "documents",
  "document_delivery",
  "signatures",
  "insurance",
  "rhino",
  "pet",
  "charges",
  "inspection",
  "filter",
  "utilities",
  "assisted_housing",
]);
/** The tenant response recorded against the current terms; an earlier-terms answer is not current. */
export function currentManualTenantOutcome(state: RenewalWorkspaceState) {
  return state.tenantResponse &&
    state.tenantResponse.termsRevision === state.termsRevision
    ? state.tenantResponse.outcome
    : null;
}
/** Either party's current decline takes the cycle to the non-renewal handoff. */
export function manualNonRenewal(state: RenewalWorkspaceState | null): boolean {
  return Boolean(
    state &&
    (state.ownerResponse?.outcome === "declined_non_renewal" ||
      currentManualTenantOutcome(state) === "declined_nonrenewing"),
  );
}
/**
 * Done, or Not applicable on a conditional activity. A terms-dependent record from earlier terms
 * is not current. This feeds guidance only; it never makes other work unavailable.
 */
export function manualActivitySatisfied(
  state: RenewalWorkspaceState,
  key: ManualActivity,
): boolean {
  const activity = currentStaffActivity(state, key);
  return (
    activity?.outcome === "done" ||
    (activity?.outcome === "not_applicable" && MANUAL_ACTIVITIES[key].conditional)
  );
}
/** S248 R-S248-4: the next step once a reply is observed; no outcome is chosen for staff. */
export const OWNER_DECISION_AFTER_REPLY_LABEL = "Record the owner's decision";
export const TENANT_DECISION_AFTER_REPLY_LABEL = "Record the tenant's decision";

/** The shared next-action wording for one staff-recorded activity, response or completion. */
export function manualActionLabel(
  key: ManualActivity | "owner_response" | "tenant_response" | "complete",
  /** S234 R-S234-4: after "Revision requested" the owner step is to revise and ask again. */
  options: {
    ownerRevisionRequested?: boolean;
    ownerReplied?: boolean;
    tenantReplied?: boolean;
  } = {},
): string {
  if (key === "owner_response" && options.ownerRevisionRequested)
    return "Update the working terms and ask the owner again";
  if (key === "owner_response" && options.ownerReplied)
    return OWNER_DECISION_AFTER_REPLY_LABEL;
  if (key === "tenant_response" && options.tenantReplied)
    return TENANT_DECISION_AFTER_REPLY_LABEL;
  return key in MANUAL_ACTIVITIES
    ? MANUAL_ACTIVITIES[key as ManualActivity].label
    : key === "owner_response"
      ? "Record owner response"
      : key === "tenant_response"
        ? "Record tenant response"
        : "Review recorded completion";
}
/**
 * S248: what the app's own evidence fills on this staff record (see `outreachFill` in
 * `outreach-evidence.ts`). Absent, the summary reads the staff record alone, exactly as before.
 */
export interface ManualEvidenceFill {
  readonly owner_outreach: unknown | null;
  readonly tenant_offer: unknown | null;
  readonly ownerReplyAtMs: number | null;
  readonly tenantReplyAtMs: number | null;
}

/** S251 R-S251-6: the rent choice recorded on this cycle, or null when none is. */
export function currentRentChoice(
  state: RenewalWorkspaceState | null | undefined,
): "keep_current" | "propose_change" | null {
  return state?.rentChoice?.choice ?? null;
}

export function manualRenewalSummary(
  state: RenewalWorkspaceState | null,
  options: {
    standingOwnerAuthority?: boolean;
    evidence?: ManualEvidenceFill | null;
    /**
     * S251: the lease's Housing assistance fact when it is Yes. Absent or null, the standard
     * order applies and the assisted-housing follow-up is not part of the lease's path.
     */
    housingAssistance?: { readonly program: string } | null;
  } = {},
) {
  const standing = options.standingOwnerAuthority === true;
  const assisted = Boolean(options.housingAssistance);
  const evidence = options.evidence ?? null;
  let nextActivity:
    | ManualActivity
    | "owner_response"
    | "tenant_response"
    // S154/S156: with nothing recorded yet the suggestion is simply the first staff activity.
    | "complete" = "owner_outreach";
  let waitingParty: "staff" | "owner" | "tenant" = "staff";
  let ownerReplied = false;
  let tenantReplied = false;
  const nonRenewal = manualNonRenewal(state);
  // S248 R-S248-1: an accepted renewal message fills the outreach or offer staff have not recorded.
  const recorded = (key: ManualActivity) =>
    manualActivitySatisfied(state!, key) ||
    (key === "owner_outreach" && Boolean(evidence?.owner_outreach)) ||
    (key === "tenant_offer" && Boolean(evidence?.tenant_offer));
  const satisfied = (key: ManualActivity) =>
    key === "owner_outreach" && standing && !assisted
      ? true
      : // S251 R-S251-9: without Housing assistance Yes the assisted-housing follow-up asks nothing.
        key === "assisted_housing" && !assisted
        ? true
        : recorded(key);
  // The owner response step, as the standard path reads it. S248 R-S248-4: an observed owner
  // reply after the latest staff answer is the team's move.
  const replied =
    state?.ownerResponse?.outcome !== "revision_requested" &&
    evidence?.ownerReplyAtMs !== null &&
    evidence?.ownerReplyAtMs !== undefined;
  const ownerResponseWaiting: "staff" | "owner" =
    state?.ownerResponse?.outcome === "revision_requested" || replied ? "staff" : "owner";
  // S251 ARCH-S251-2: the assisted order. The program contact, then the owner's answer on renewing
  // this tenant, then the rent choice; an approval of terms settles the answer and the rent together.
  const answer = state?.ownerResponse?.outcome;
  const renewing = answer === "renew_tenant" || answer === "approved_terms";
  const rentChoice = currentRentChoice(state);
  const rentSettled =
    answer === "approved_terms" ||
    rentChoice === "keep_current" ||
    (rentChoice === "propose_change" && standing);
  if (state) {
    if (nonRenewal)
      nextActivity = satisfied("non_renewal_handoff")
        ? "complete"
        : "non_renewal_handoff";
    else if (assisted && !recorded("program_contact")) nextActivity = "program_contact";
    else if (assisted && !renewing && !recorded("owner_outreach"))
      nextActivity = "owner_outreach";
    else if (
      // The owner response step: the standard path's owner decision, the assisted owner's answer
      // on renewing, or a proposed change waiting on the owner's rent decision.
      (assisted && !renewing) ||
      (assisted && !rentSettled && rentChoice === "propose_change") ||
      (!assisted &&
        satisfied("owner_outreach") &&
        !standing &&
        state.ownerResponse?.outcome !== "approved_terms")
    ) {
      nextActivity = "owner_response";
      ownerReplied = replied;
      waitingParty = ownerResponseWaiting;
    } else if (assisted && !rentSettled) {
      // Renew is recorded and no rent choice yet: the rent choice is the team's move.
      nextActivity = "owner_response";
      waitingParty = "staff";
    } else if (!assisted && !satisfied("owner_outreach")) nextActivity = "owner_outreach";
    else if (!satisfied("tenant_offer")) {
      nextActivity = "tenant_offer";
    } else if (currentManualTenantOutcome(state) !== "accepted") {
      const currentResponse = currentManualTenantOutcome(state);
      nextActivity =
        currentResponse === "counter_change_requested"
          ? "owner_response"
          : "tenant_response";
      tenantReplied =
        nextActivity === "tenant_response" &&
        currentResponse !== "needs_verification" &&
        evidence?.tenantReplyAtMs !== null &&
        evidence?.tenantReplyAtMs !== undefined;
      waitingParty =
        currentResponse === "counter_change_requested" ||
        currentResponse === "needs_verification" ||
        tenantReplied
          ? "staff"
          : "tenant";
    } else
      nextActivity = MANUAL_REQUIRED_RENEWAL.find((key) => !satisfied(key)) ?? "complete";
  }
  if (!state && assisted) nextActivity = "program_contact";
  else if (!state && standing) nextActivity = "tenant_offer";
  // S156: completion is the staff record itself. The suggested next activity is guidance and
  // neither grants nor withholds it; once completion is recorded, nothing is suggested next.
  const complete = Boolean(state?.completion);
  if (complete) nextActivity = "complete";
  const pendingSourceUpdates = Object.values(state?.sourceUpdates ?? {}).filter(
    (entry) => entry.state !== "verified",
  ).length;
  const stageIndex = ["program_contact", "owner_outreach", "owner_response"].includes(
    nextActivity,
  )
    ? 1
    : ["tenant_offer", "tenant_response", "information_form", "form_returned"].includes(
          nextActivity,
        )
      ? 2
      : ["documents", "document_delivery"].includes(nextActivity)
        ? 3
        : nextActivity === "signatures"
          ? 4
          : 5;
  return {
    step: { ...RENEWAL_STEPPER_STEPS[stageIndex], index: stageIndex },
    complete,
    nextActivity,
    waitingParty,
    nonRenewal: Boolean(nonRenewal),
    pendingSourceUpdates,
    // S234 R-S234-4: present only while the owner's recorded answer asks for a revision.
    ...(!complete &&
    nextActivity === "owner_response" &&
    state?.ownerResponse?.outcome === "revision_requested"
      ? { ownerRevisionRequested: true as const }
      : {}),
    // S248 R-S248-4: present only while an observed reply waits for staff to record the decision.
    ...(!complete && nextActivity === "owner_response" && ownerReplied
      ? { ownerReplied: true as const }
      : {}),
    ...(!complete && nextActivity === "tenant_response" && tenantReplied
      ? { tenantReplied: true as const }
      : {}),
    label: complete
      ? "Completed: recorded by staff"
      : !state
        ? "Manual work not recorded"
        : nextActivity === "complete"
          ? "Ready for staff completion"
          : "Manual work in progress",
  };
}
const SHEET_ACTIVITY: Partial<Record<ManualActivity, SheetEditableField>> = {
  tenant_offer: "renewal_letter_sent",
  information_form: "info_form_sent",
  form_returned: "form_returned",
  document_delivery: "lease_docs_sent",
  signatures: "esign_complete",
  insurance: "additional_insured_verified",
  rhino: "rhino_renewed",
  pet: "pet_registered",
  charges: "recurring_charge_added",
  inspection: "added_to_inspection_sheet",
  filter: "air_filter_setup",
  utilities: "utility_proof",
};
export function manualActionSheetIntent(
  action: RenewalWorkspaceAction,
): SheetFieldIntent | null {
  let field: SheetEditableField | undefined, outcome: string | undefined;
  if (action.kind === "activity") {
    field = SHEET_ACTIVITY[action.activity];
    outcome = action.outcome;
  }
  if (action.kind === "owner_response") {
    field = "owner_pricing_confirmed";
    outcome = action.outcome === "approved_terms" ? "done" : "waiting";
  }
  if (action.kind === "tenant_response") {
    field = "tenant_responded";
    outcome = ["accepted", "counter_change_requested", "declined_nonrenewing"].includes(
      action.outcome,
    )
      ? "done"
      : "waiting";
  }
  if (action.kind === "complete") {
    field = "renewal_completed";
    outcome = "done";
  }
  if (action.kind === "reopen") {
    field = "renewal_completed";
    outcome = "not_started";
  }
  const source = action.source ?? STAFF_RECORD_SOURCE;
  if (action.kind === "preparation") {
    // S278 R-S278-1: the Sheet market value takes the reviewed Rent to recommend (S118 R118.3),
    // prepared from the working record by `market-value-source.ts`. The comparison figure this
    // form saves, often filled from the provider's point estimate, no longer feeds the Sheet, and
    // the low/high range stays app evidence. Preparing is not writing.
    return null;
  }
  if (!field || !outcome) return null;
  const shape = sheetFieldShape(field);
  // A boolean column cannot represent N/A; leave that fact in the app rather than claim Yes.
  if (outcome === "not_applicable" && (shape === "yes_no" || shape === "boolean"))
    return null;
  const value =
    shape === "yes_no" || shape === "boolean"
      ? outcome === "done"
      : ({
          done: "Done — recorded by staff",
          not_applicable: "Not applicable — recorded by staff",
          waiting: "Waiting — recorded by staff",
          not_started: "Not started — recorded by staff",
        }[outcome] ?? outcome);
  return { field, value, source };
}
/** S248 R-S248-11: the words a Sheet value from the app's confirmed send carries. */
export const DERIVED_SHEET_SOURCE_LABEL = "From the app's confirmed send";
/**
 * S248 R-S248-11: the operating Sheet value a derived outreach record prepares: the same field and
 * the same Done the staff record of that activity prepares, attributed to the app's confirmed
 * send. Null when the activity has no Sheet column (owner outreach), exactly as for staff.
 */
export function derivedOutreachSheetIntent(
  activity: "owner_outreach" | "tenant_offer",
): SheetFieldIntent | null {
  const field = SHEET_ACTIVITY[activity];
  if (!field) return null;
  const shape = sheetFieldShape(field);
  return {
    field,
    value:
      shape === "yes_no" || shape === "boolean"
        ? true
        : "Done, from the app's confirmed send",
    source: DERIVED_SHEET_SOURCE_LABEL,
  };
}
/** S234 R-S234-5: each Working term's revision (0 when the term was never saved). */
export interface WorkingTermRevisions {
  rent: number;
  effectiveDate: number;
  endDate: number;
}
export function planRenewalWorkspaceAction(
  current: RenewalWorkspaceState,
  raw: RenewalWorkspaceAction,
  meta: {
    actorUid: string;
    recordedAt: string;
    eventId: string;
    /** S234 R-S234-5: the Working term revisions the store read with a tenant answer. */
    workingTermRevisions?: WorkingTermRevisions | null;
    /** S66: the server-captured Working terms an approval covers; null when incomplete. */
    approvedWorkingTerms?: ApprovedWorkingTerms | null;
    /** S234 R-S234-1: the approval evidence the store verified for this exact approval. */
    approvalEvidence?: OwnerApprovalEvidence | null;
    /** S262 R-S262-2: the approved base the store wrote in the same transaction. */
    approvedBase?: ApprovedBase | null;
    /** S282: the server-derived staff identity a recorded review shows (never the browser's). */
    actorLabel?: string;
  },
): RenewalWorkspaceState {
  const action = RenewalWorkspaceActionSchema.parse(raw);
  if (action.occurredAt && Date.parse(action.occurredAt) > Date.parse(meta.recordedAt))
    throw new EditableLayerError("The occurrence time cannot be in the future.", 400);
  const next: RenewalWorkspaceState = {
    ...current,
    revision: current.revision + 1,
    activities: { ...current.activities },
    sourceUpdates: { ...current.sourceUpdates },
  };
  const source = action.source ?? STAFF_RECORD_SOURCE;
  const {
    approvedWorkingTerms: capturedTerms,
    approvalEvidence,
    workingTermRevisions,
    approvedBase: writtenBase,
    actorLabel,
    ...recordMeta
  } = meta;
  let record: StaffRecord = {
    ...recordMeta,
    source,
    termsRevision: current.termsRevision,
    ...(action.reason ? { reason: action.reason } : {}),
    ...(action.occurredAt ? { occurredAt: action.occurredAt } : {}),
  };
  if (action.kind === "activity") {
    if (
      action.outcome === "not_applicable" &&
      !MANUAL_ACTIVITIES[action.activity].conditional
    )
      throw new EditableLayerError(
        "Not applicable is available only for work that depends on the lease. Record this work as Not started, Waiting or Done.",
        400,
      );
    next.activities[action.activity] = {
      ...record,
      outcome: action.outcome,
      ...(action.outcome === "not_applicable" && action.applicabilityPolicy
        ? { applicabilityPolicy: action.applicabilityPolicy }
        : {}),
    };
  } else if (action.kind === "owner_response") {
    // S156: an owner response is the recorded fact alone. Working terms are saved independently
    // on the lease, so an approval needs no terms and none are manufactured to hold them.
    if (action.outcome !== "approved_terms" && action.terms)
      throw new EditableLayerError(
        "Only explicit owner approval can carry approved terms.",
        400,
      );
    // S234 R-S234-1: an approval names who approved, how and when; nothing else carries them.
    if (action.outcome !== "approved_terms" && action.approval)
      throw new EditableLayerError("Only an approval records who approved and how.", 400);
    // S262 R-S262-1: only the approving branch records an Amount approved. A decline, a requested
    // change and no response keep their outcome without changing the renewal rent.
    if (action.outcome !== "approved_terms" && action.approvedBase)
      throw new EditableLayerError(
        "Only an approval records an amount approved. Choose Approved, or record this outcome without an amount.",
        400,
      );
    if (action.approvedBase && !writtenBase)
      throw new EditableLayerError(
        "The approved amount could not be saved with this answer. Reload and record it again.",
        409,
      );
    let approval: OwnerApprovalEvidence | null = null;
    if (action.outcome === "approved_terms") {
      const missing = missingOwnerApprovalItems(action.approval);
      if (missing) throw new EditableLayerError(missing, 400);
      if (Date.parse(action.approval!.occurredAt!) > Date.parse(meta.recordedAt))
        throw new EditableLayerError("The approval time cannot be in the future.", 400);
      const input = action.approval!;
      // A named representative and a written channel or conversation are the staff's own typed
      // facts. An owner of record and a linked reply need the store's verified readback.
      const typed =
        input.party!.kind === "representative" && input.channel!.kind !== "linked_reply"
          ? {
              party: input.party!,
              channel: input.channel! as Exclude<
                OwnerApprovalEvidence["channel"],
                { kind: "linked_reply" }
              >,
              occurredAt: input.occurredAt!,
            }
          : null;
      if (!approvalEvidence && !typed)
        throw new EditableLayerError(
          "The approval's party and channel could not be verified. Reload and record it again.",
          409,
        );
      approval = OwnerApprovalEvidenceSchema.parse(approvalEvidence ?? typed);
    }
    // An approval recorded without terms keeps the terms already on record (S156 BEH-4).
    const terms =
      action.terms ??
      (action.outcome === "approved_terms" ? current.ownerResponse?.terms : undefined);
    // S66: an approval covers the Working terms and charges the server captured as it was
    // recorded. Approving different terms or charges is a terms change like any other.
    const binding = action.outcome === "approved_terms" ? (capturedTerms ?? null) : null;
    const approvedBase =
      action.outcome === "approved_terms" && action.approvedBase
        ? (writtenBase ?? null)
        : null;
    const covered = (value: ApprovedWorkingTerms | null | undefined) =>
      value
        ? JSON.stringify([
            value.rent,
            value.effectiveDate,
            value.endDate,
            value.economicsHash,
          ])
        : null;
    // S262: like the captured terms, the approved base counts by value. An answer re-recorded
    // with the rent the earlier answer covered keeps the terms revision; a different amount, or
    // an answer that no longer names one, is a terms change.
    const prior = current.ownerResponse;
    const priorRent =
      prior?.approvedBase?.amount ??
      prior?.approvedWorkingTerms?.rent ??
      prior?.terms?.rent ??
      null;
    const baseChanged = approvedBase
      ? priorRent === null || Math.abs(priorRent - approvedBase.amount) >= 0.005
      : action.outcome === "approved_terms" && prior?.approvedBase !== undefined;
    const changed =
      JSON.stringify(current.ownerResponse?.terms ?? null) !==
        JSON.stringify(terms ?? null) ||
      current.ownerResponse?.outcome !== action.outcome ||
      covered(current.ownerResponse?.approvedWorkingTerms) !== covered(binding) ||
      baseChanged;
    if (changed) {
      next.termsRevision++;
      for (const activity of TERMS_DEPENDENT_MANUAL) {
        const field = SHEET_ACTIVITY[activity];
        if (field) delete next.sourceUpdates[field];
      }
      delete next.sourceUpdates.tenant_responded;
      delete next.sourceUpdates.renewal_completed;
    }
    record = { ...record, termsRevision: next.termsRevision };
    next.ownerResponse = {
      ...record,
      ...(approval ? { occurredAt: approval.occurredAt } : {}),
      outcome: action.outcome,
      ...(terms ? { terms } : {}),
      ...(binding ? { approvedWorkingTerms: binding } : {}),
      ...(approval ? { approval } : {}),
      ...(approvedBase ? { approvedBase } : {}),
    };
  } else if (action.kind === "tenant_response") {
    next.tenantResponse = {
      ...record,
      outcome: action.outcome,
      ...(workingTermRevisions ? { workingTermRevisions } : {}),
    };
  } else if (action.kind === "complete") {
    // S156: staff record completion when their actual work is complete; the checklist is guidance.
    next.completion = record;
  } else if (action.kind === "reopen") {
    next.completion = null;
  } else if (action.kind === "rent_choice") {
    // S251 R-S251-6 / R-S251-12: the choice changes the order of steps and what is prepared; it
    // changes no rent, charge, recipient or approved wording by itself.
    next.rentChoice = { ...record, choice: action.choice };
  } else if (action.kind === "end_date_review") {
    // S282 R-S282-1/3: one review per save, appended so an earlier decision stays as history. It
    // is bound to this cycle and the exact end date value reviewed, with the server's actor and
    // time. It changes no terms, prepares no Sheet value and reaches no provider.
    next.endDateReviews = [
      ...(current.endDateReviews ?? []),
      {
        eventId: meta.eventId,
        cycleId: current.cycleId,
        endDateIso: action.endDateIso,
        decision: action.decision,
        reason: action.reason,
        actorUid: meta.actorUid,
        actorLabel: actorLabel ?? meta.actorUid,
        recordedAt: meta.recordedAt,
      },
    ];
  } else {
    if (
      action.rangeLow !== undefined &&
      action.rangeHigh !== undefined &&
      action.rangeLow > action.rangeHigh
    )
      throw new EditableLayerError("The range low must not exceed the high.", 400);
    const market: RenewalMarketBasis = { ...(current.preparation?.market ?? {}) };
    for (const key of ["rangeLow", "rangeHigh", "pmiNumber"] as const) {
      delete market[key];
      if (action[key] !== undefined) market[key] = action[key];
    }
    delete market.rangeBasis;
    if (action.rangeBasis) market.rangeBasis = action.rangeBasis;
    delete market.recommendationBasis;
    if (action.recommendationBasis)
      market.recommendationBasis = action.recommendationBasis;
    // The store resolves provider observations and screenshots. Browser numbers never become provider facts.
    next.preparation = {
      market,
      source,
      recordedAt: meta.recordedAt,
      recordedByUid: meta.actorUid,
      revision: next.revision,
      ...(action.analysisReference
        ? { analysisReference: action.analysisReference }
        : {}),
      ...(current.preparation?.observationId
        ? { observationId: current.preparation.observationId }
        : {}),
    };
  }
  const intent =
    action.kind === "complete" && manualRenewalSummary(current).nonRenewal
      ? null
      : manualActionSheetIntent(action);
  if (action.kind === "activity" && !intent && SHEET_ACTIVITY[action.activity])
    delete next.sourceUpdates[SHEET_ACTIVITY[action.activity]!];
  // S278 R-S278-1: a comparison save withdraws an unconfirmed market value an earlier comparison
  // figure prepared; a value read back from the Sheet stays on record, and a Market value
  // prepared from the reviewed Rent to recommend is not the comparison's to withdraw.
  if (
    action.kind === "preparation" &&
    !intent &&
    next.sourceUpdates.market_value &&
    next.sourceUpdates.market_value.state !== "verified" &&
    !next.sourceUpdates.market_value.fromRecommendation
  )
    delete next.sourceUpdates.market_value;
  if (intent)
    next.sourceUpdates[intent.field] = {
      eventId: meta.eventId,
      intent,
      state: "pending",
    };
  return next;
}
