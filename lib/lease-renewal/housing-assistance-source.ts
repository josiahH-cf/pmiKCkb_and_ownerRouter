// S266 (R-S266-1 to R-S266-3): the Housing assistance fact's place in the renewal Work, the program
// contact that leads the assisted outcome, and the fail-closed readiness contract for a future
// RentVine program or vendor source.
//
// The saved fact stays the one S251 owner on the lease-bound working record: Not set, an explicit
// No, or Yes with the program. Nothing here sets, infers or replaces that fact. A future program
// source can only ever suggest a verified contact for staff review, by an exact provider id, after
// a separately approved read and a separately authorized use. No provider read exists or is added
// here: the shipped capability is absent, so every lookup stays Source pending and the manual path
// stays available. Pure and client-safe.

import type { HousingAssistanceValue } from "@/lib/lease-renewal/working-record";

export type HousingAssistanceState = "not_set" | "no" | "yes";

/** Where the Housing assistance field sits in the Check the numbers Work. */
export interface HousingAssistanceWork {
  readonly state: HousingAssistanceState;
  /** True when the field belongs in the active Work; otherwise it is optional. */
  readonly active: boolean;
  /** Why it is active: a staff task naming it, or a material program indication. */
  readonly reason: "explicit_task" | "program_indication" | null;
  /** The saved answer only. Nothing is ever preselected for staff. */
  readonly answer: "no" | "yes" | null;
}

/**
 * R-S266-1: ordinary Not set creates no required task and stays optional. An explicit task, or a
 * material program indication on an unrecorded lease (RentVine wording that mentions assistance, or
 * program work staff already recorded), brings the same field into Work with no answer chosen.
 */
export function housingAssistanceWork(input: {
  readonly fact: HousingAssistanceValue | null;
  /** RentVine text mentions housing assistance: a suggestion only. */
  readonly mention?: boolean;
  /** A program contact or assisted-housing record staff made while the fact is not set. */
  readonly recordedProgramWork?: boolean;
  /** A staff task or an exact link names this field. */
  readonly explicitTask?: boolean;
}): HousingAssistanceWork {
  const state: HousingAssistanceState = input.fact?.status ?? "not_set";
  const answer = state === "not_set" ? null : state;
  if (input.explicitTask) return { state, active: true, reason: "explicit_task", answer };
  if (state === "not_set" && (input.mention || input.recordedProgramWork))
    return { state, active: true, reason: "program_indication", answer };
  return { state, active: false, reason: null, answer };
}

/** R-S266-2: what the program contact step leads with on an assisted lease. */
export interface ProgramContactLead {
  readonly program: string;
  /** The contact staff saved on the fact; null when none is saved. */
  readonly contact: string | null;
  /** Contact the program now, or first enter the missing contact. */
  readonly action: "contact_program" | "enter_contact";
}

export function programContactLead(
  fact: HousingAssistanceValue | null,
): ProgramContactLead | null {
  if (fact?.status !== "yes") return null;
  const contact = fact.contact?.trim() || null;
  return {
    program: fact.program,
    contact,
    action: contact ? "contact_program" : "enter_contact",
  };
}

// ---- R-S266-3: the future program source readiness contract ------------------------------------

/** The exact state label a pending source reads. */
export const PROGRAM_SOURCE_PENDING_LABEL = "Source pending";

/** Whether a RentVine program read exists, and whether its suggestions may be used. */
export interface ProgramSourceCapability {
  /** An approved, permitted RentVine program or vendor read. */
  readonly read: "absent" | "approved";
  /** A separate authorization to suggest a verified contact to staff. */
  readonly suggestions: "not_authorized" | "authorized";
}

/** No provider read exists or is added: the shipped capability is absent. */
export const PROGRAM_SOURCE_CAPABILITY: ProgramSourceCapability = Object.freeze({
  read: "absent",
  suggestions: "not_authorized",
});

/** The data steward's verified mapping from the staff program to one provider record. */
export interface ProgramSourceMapping {
  /** The program exactly as staff recorded it on the lease. */
  readonly program: string;
  /** The stable RentVine vendor or program id. */
  readonly providerId: string;
  /** Who verified the mapping, by role. */
  readonly verifiedBy: string;
  readonly verifiedAt: string;
}

/** One provider record a future approved read returns. Its name is display only. */
export interface ProgramSourceCandidate {
  /** The stable provider id; null when the record has none. */
  readonly providerId: string | null;
  readonly kind: "vendor" | "program";
  /** Display only: a name never selects or matches a record. */
  readonly name: string;
  /** Whether the business maintains this record as its program inventory. */
  readonly maintainedBy: "business" | "unknown";
  readonly active: boolean;
  /** When the record was read. */
  readonly observedAt: string;
  /** The fields the record carries. Only approved fields may ever be suggested. */
  readonly fields: Readonly<Record<string, string>>;
  readonly provenance: {
    readonly system: string;
    readonly reference: string;
    readonly retrievedAt: string;
  } | null;
}

/** The approved field and freshness policy for a program source. */
export interface ProgramSourcePolicy {
  readonly approvedFields: readonly ("contact" | "notes")[];
  readonly maxAgeDays: number;
}

export type ProgramSourcePendingReason =
  | "no_read_capability"
  | "not_assisted"
  | "no_mapping"
  | "conflicting_mapping"
  | "name_only"
  | "missing_id"
  | "missing_record"
  | "duplicate_record"
  | "not_business_maintained"
  | "inactive"
  | "stale"
  | "missing_provenance"
  | "unapproved_fields"
  | "conflicting_notes"
  | "suggestions_not_authorized";

const PENDING_MESSAGES: Readonly<Record<ProgramSourcePendingReason, string>> = {
  no_read_capability: "No approved RentVine program read is available.",
  not_assisted:
    "Housing assistance is not Yes for this lease, so there is no program to look up.",
  no_mapping: "No verified mapping links this program to a RentVine record.",
  conflicting_mapping: "More than one verified mapping names this program.",
  name_only: "A RentVine record matches by name only, and a name is never enough.",
  missing_id: "The RentVine record has no stable id.",
  missing_record: "The mapped RentVine record was not found.",
  duplicate_record: "More than one RentVine record has the mapped id.",
  not_business_maintained: "The RentVine record is not one the business maintains.",
  inactive: "The RentVine record is inactive.",
  stale: "The RentVine record was not read recently enough to rely on.",
  missing_provenance: "The RentVine record has no provenance for this read.",
  unapproved_fields:
    "The RentVine record carries fields that are not approved for staff use.",
  conflicting_notes:
    "The RentVine notes differ from the notes staff saved. The staff notes stay.",
  suggestions_not_authorized:
    "The RentVine record is verified, but using it for suggestions is not authorized yet.",
};

export type ProgramSourceReadiness =
  | {
      readonly state: "source_pending";
      readonly reason: ProgramSourcePendingReason;
      readonly message: string;
      /** The manual path (the staff contact on the lease) always stays available. */
      readonly manualPath: true;
      readonly suggestion: null;
    }
  | {
      readonly state: "verified";
      readonly providerId: string;
      readonly message: string;
      readonly manualPath: true;
      /** A suggestion for staff review; it never replaces the saved fact. */
      readonly suggestion: {
        readonly providerId: string;
        readonly contact: string | null;
      };
    };

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pending(reason: ProgramSourcePendingReason): ProgramSourceReadiness {
  return {
    state: "source_pending",
    reason,
    message: PENDING_MESSAGES[reason],
    manualPath: true,
    suggestion: null,
  };
}

/**
 * R-S266-3: whether a program source record is ready to suggest a contact for this lease. Fails
 * closed at the first unmet gate: an approved read, a Yes fact, one exact verified mapping, one
 * business-maintained active record with a stable id, a fresh read with its own provenance, only
 * approved fields, no conflict with the staff notes, and a separately authorized use. A name never
 * matches; the staff fact is never set, cleared or replaced.
 */
export function evaluateProgramSourceReadiness(input: {
  readonly capability: ProgramSourceCapability;
  readonly fact: HousingAssistanceValue | null;
  readonly mappings: readonly ProgramSourceMapping[];
  readonly candidates: readonly ProgramSourceCandidate[];
  readonly policy: ProgramSourcePolicy;
  readonly nowIso: string;
}): ProgramSourceReadiness {
  if (input.capability.read !== "approved") return pending("no_read_capability");
  const fact = input.fact;
  if (fact?.status !== "yes") return pending("not_assisted");
  const mappings = input.mappings.filter((mapping) => mapping.program === fact.program);
  if (mappings.length === 0)
    return pending(input.candidates.length ? "name_only" : "no_mapping");
  if (new Set(mappings.map((mapping) => mapping.providerId)).size > 1)
    return pending("conflicting_mapping");
  const providerId = mappings[0].providerId;
  if (!STABLE_ID.test(providerId)) return pending("missing_id");
  const matches = input.candidates.filter(
    (candidate) => candidate.providerId === providerId,
  );
  if (matches.length === 0) return pending("missing_record");
  if (matches.length > 1) return pending("duplicate_record");
  const record = matches[0];
  if (record.maintainedBy !== "business") return pending("not_business_maintained");
  if (!record.active) return pending("inactive");
  const now = Date.parse(input.nowIso);
  const observed = Date.parse(record.observedAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(observed) ||
    observed > now ||
    now - observed > input.policy.maxAgeDays * DAY_MS
  )
    return pending("stale");
  if (
    !record.provenance ||
    record.provenance.system !== "rentvine" ||
    !record.provenance.reference.endsWith(`:${providerId}`) ||
    record.provenance.retrievedAt !== record.observedAt
  )
    return pending("missing_provenance");
  const approved = new Set<string>(input.policy.approvedFields);
  if (Object.keys(record.fields).some((field) => !approved.has(field)))
    return pending("unapproved_fields");
  const sourceNotes = record.fields.notes?.trim();
  const staffNotes = fact.notes?.trim();
  if (sourceNotes && staffNotes && sourceNotes !== staffNotes)
    return pending("conflicting_notes");
  if (input.capability.suggestions !== "authorized")
    return pending("suggestions_not_authorized");
  return {
    state: "verified",
    providerId,
    message: "A verified RentVine record can suggest a contact for staff review.",
    manualPath: true,
    suggestion: { providerId, contact: record.fields.contact?.trim() || null },
  };
}

/**
 * The readiness the application has today. No RentVine program read exists, so nothing is looked up
 * and the program source is pending for every lease; the staff contact stays the one to use.
 */
export function shippedProgramSourceReadiness(
  fact: HousingAssistanceValue | null,
): ProgramSourceReadiness {
  return evaluateProgramSourceReadiness({
    capability: PROGRAM_SOURCE_CAPABILITY,
    fact,
    mappings: [],
    candidates: [],
    policy: { approvedFields: [], maxAgeDays: 0 },
    nowIso: new Date(0).toISOString(),
  });
}

/** The one source hint line, shown apart from the saved fact. */
export function programSourceHint(readiness: ProgramSourceReadiness): string {
  return readiness.state === "verified"
    ? `RentVine program source: verified record ${readiness.providerId}. Review any suggestion before you save it; the contact you save here is the one staff use.`
    : `RentVine program source: ${PROGRAM_SOURCE_PENDING_LABEL}. ${readiness.message} Enter the known contact here.`;
}
