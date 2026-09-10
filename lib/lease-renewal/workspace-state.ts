import { z } from "zod";
import { RENEWAL_STEPPER_STEPS } from "@/lib/lease-renewal/renewal-process";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  sheetFieldShape,
  type SheetFieldIntent,
  type SheetEditableField,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { RenewalMarketBasis } from "@/lib/lease-renewal/renewal-progress";

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
export const MANUAL_ACTIVITIES = {
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
  pet: { label: "Pet registration follow-up", section: "documents", conditional: true },
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
const common = {
  source: text.max(240),
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
      ]),
      terms: RenewalTermsSchema.optional(),
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
  z
    .object({
      kind: z.literal("preparation"),
      rangeLow: money.optional(),
      rangeHigh: money.optional(),
      pmiNumber: money.optional(),
      observationId: z.string().uuid().nullable().optional(),
      trendObservationId: z.string().uuid().optional(),
      analysisReference: z.string().trim().max(1000).optional(),
      ...common,
    })
    .strict(),
]);
export type RenewalWorkspaceAction = z.infer<typeof RenewalWorkspaceActionSchema>;
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
  basis: RenewalCycleBasis;
  revision: number;
  termsRevision: number;
  ownerResponse:
    | (StaffRecord & {
        outcome:
          | "approved_terms"
          | "revision_requested"
          | "declined_non_renewal"
          | "no_response";
        terms?: z.infer<typeof RenewalTermsSchema>;
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
      })
    | null;
  activities: Partial<Record<ManualActivity, StaffActivityRecord>>;
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
    }
  >;
}
export function emptyRenewalWorkspace(
  leaseId: string,
  cycleId: string,
  basis: RenewalCycleBasis,
): RenewalWorkspaceState {
  return {
    schemaVersion: "renewal-workspace/v1",
    leaseId,
    cycleId,
    basis: CycleBasisSchema.parse(basis),
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
export function currentManualOwnerTerms(state: RenewalWorkspaceState) {
  return state.ownerResponse?.outcome === "approved_terms"
    ? (state.ownerResponse.terms ?? null)
    : null;
}
const requiredRenewal: ManualActivity[] = [
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
];
export function manualRenewalSummary(state: RenewalWorkspaceState | null) {
  let nextActivity:
    | ManualActivity
    | "owner_response"
    | "tenant_response"
    | "complete"
    | "cycle" = "cycle";
  let waitingParty: "staff" | "owner" | "tenant" = "staff";
  const nonRenewal =
    state?.ownerResponse?.outcome === "declined_non_renewal" ||
    (state?.tenantResponse?.termsRevision === state?.termsRevision &&
      state?.tenantResponse?.outcome === "declined_nonrenewing");
  const satisfied = (key: ManualActivity) => {
    const activity = currentStaffActivity(state!, key);
    return (
      activity?.outcome === "done" ||
      (activity?.outcome === "not_applicable" &&
        MANUAL_ACTIVITIES[key].conditional &&
        !!activity.reason?.trim() &&
        !!activity.applicabilityPolicy?.trim())
    );
  };
  if (state) {
    if (nonRenewal)
      nextActivity = satisfied("non_renewal_handoff")
        ? "complete"
        : "non_renewal_handoff";
    else if (!satisfied("owner_outreach")) nextActivity = "owner_outreach";
    else if (!currentManualOwnerTerms(state)) {
      nextActivity = "owner_response";
      waitingParty =
        state.ownerResponse?.outcome === "revision_requested" ? "staff" : "owner";
    } else if (!satisfied("tenant_offer")) {
      nextActivity = "tenant_offer";
    } else if (
      state.tenantResponse?.termsRevision !== state.termsRevision ||
      state.tenantResponse?.outcome !== "accepted"
    ) {
      const currentResponse =
        state.tenantResponse?.termsRevision === state.termsRevision
          ? state.tenantResponse?.outcome
          : null;
      nextActivity =
        currentResponse === "counter_change_requested"
          ? "owner_response"
          : "tenant_response";
      waitingParty =
        currentResponse === "counter_change_requested" ||
        currentResponse === "needs_verification"
          ? "staff"
          : "tenant";
    } else nextActivity = requiredRenewal.find((key) => !satisfied(key)) ?? "complete";
  }
  const complete = Boolean(
    state?.completion &&
    state.completion.termsRevision === state.termsRevision &&
    nextActivity === "complete",
  );
  const pendingSourceUpdates = Object.values(state?.sourceUpdates ?? {}).filter(
    (entry) => entry.state !== "verified",
  ).length;
  const stageIndex =
    nextActivity === "cycle"
      ? 0
      : ["owner_outreach", "owner_response"].includes(nextActivity)
        ? 1
        : [
              "tenant_offer",
              "tenant_response",
              "information_form",
              "form_returned",
            ].includes(nextActivity)
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
    label: complete
      ? "Completed: recorded by staff"
      : nextActivity === "cycle"
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
  return { field, value, source: action.source };
}
export function planRenewalWorkspaceAction(
  current: RenewalWorkspaceState,
  raw: RenewalWorkspaceAction,
  meta: { actorUid: string; recordedAt: string; eventId: string },
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
  let record: StaffRecord = {
    ...meta,
    source: action.source,
    termsRevision: current.termsRevision,
    ...(action.reason ? { reason: action.reason } : {}),
    ...(action.occurredAt ? { occurredAt: action.occurredAt } : {}),
  };
  if (action.kind === "activity") {
    if (
      action.outcome === "not_applicable" &&
      (!MANUAL_ACTIVITIES[action.activity].conditional ||
        !action.reason ||
        !action.applicabilityPolicy)
    )
      throw new EditableLayerError(
        "Required work cannot be waived. A permitted not-applicable decision needs its source, reason and existing approved policy or predicate reference.",
        400,
      );
    next.activities[action.activity] = {
      ...record,
      outcome: action.outcome,
      ...(action.outcome === "not_applicable"
        ? { applicabilityPolicy: action.applicabilityPolicy }
        : {}),
    };
    next.completion = null;
  } else if (action.kind === "owner_response") {
    if (action.outcome === "approved_terms" && !action.terms)
      throw new EditableLayerError(
        "Record the exact owner-approved rent and effective terms.",
        400,
      );
    if (action.outcome !== "approved_terms" && action.terms)
      throw new EditableLayerError(
        "Only explicit owner approval can carry approved terms.",
        400,
      );
    const changed =
      JSON.stringify(current.ownerResponse?.terms ?? null) !==
        JSON.stringify(action.terms ?? null) ||
      current.ownerResponse?.outcome !== action.outcome;
    if (changed) {
      next.termsRevision++;
      next.completion = null;
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
      outcome: action.outcome,
      ...(action.terms ? { terms: action.terms } : {}),
    };
  } else if (action.kind === "tenant_response") {
    next.tenantResponse = { ...record, outcome: action.outcome };
    next.completion = null;
  } else if (action.kind === "complete") {
    if (manualRenewalSummary(current).nextActivity !== "complete")
      throw new EditableLayerError(
        "Applicable manual obligations remain unfinished.",
        409,
      );
    next.completion = record;
  } else if (action.kind === "reopen") {
    next.completion = null;
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
    // The store resolves provider observations and screenshots. Browser numbers never become provider facts.
    next.preparation = {
      market,
      source: action.source,
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
  if (intent)
    next.sourceUpdates[intent.field] = {
      eventId: meta.eventId,
      intent,
      state: "pending",
    };
  return next;
}
