// S97 renewal-writeback proposal contract (`renewal-writeback-proposal/v1`).
//
// One versioned server schema binds actor, role/Space, lease, provider account, operation key,
// exact before/after fields, source evidence, reversal payload, preview hash, confirmation expiry,
// and one opaque attempt identity per effect. Caller-supplied paths, methods, account hosts, and
// fields are structurally unreachable: every effect resolves to exactly one of the three exact
// Action Registry keys and its official operation, and a multi-field proposal expands into ordered
// effects — lease dates, existing charge updates, then new charges — each separately previewed,
// confirmed, claimed, receipted, and read back. No cross-effect atomicity is claimed.

import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";

export const RENEWAL_WRITEBACK_PROPOSAL_VERSION = "renewal-writeback-proposal/v1";

export const RENEWAL_DATES_UPDATE_KEY = "rentvine.lease.renewal_dates.update";
export const RECURRING_CHARGE_CREATE_KEY = "rentvine.lease.recurring_charge.create";
export const RECURRING_CHARGE_UPDATE_KEY = "rentvine.lease.recurring_charge.update";

export const RENEWAL_WRITEBACK_KEYS = [
  RENEWAL_DATES_UPDATE_KEY,
  RECURRING_CHARGE_CREATE_KEY,
  RECURRING_CHARGE_UPDATE_KEY,
] as const;
export type RenewalWritebackActionKey = (typeof RENEWAL_WRITEBACK_KEYS)[number];

/** The retired broad identifier; it can never name an executable S97 effect. */
export const RETIRED_BROAD_WRITEBACK_KEY = "rentvine.lease.renewal_writeback";

export const RENEWAL_WRITEBACK_ACCOUNT = "pmikcmetro";
export const RENEWAL_WRITEBACK_CONFIRMATION_TTL_MS = 10 * 60 * 1_000;
export const RECURRING_CHARGE_CREATE_BASELINE_VERSION =
  "s97-recurring-charge-create-baseline/v1";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE_RE = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
const POSITIVE_DECIMAL_RE = /^(?:0|[1-9]\d*)\.\d{2}$/;
const POSITIVE_INTEGER_ID_RE = /^[1-9]\d*$/;
const DAY_DUE_RE = /^(?:[1-9]|[12]\d|3[01])$/;
const FREQUENCY_RE = /^(?:[1-9]|1\d|2[0-4])$/;

export class RenewalWritebackContractError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RenewalWritebackContractError";
  }
}

function fail(code: string, message: string): never {
  throw new RenewalWritebackContractError(code, message);
}

function assertIsoDate(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    fail("invalid_date", `${label} must be a real YYYY-MM-DD date.`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    fail("invalid_date", `${label} must be a real YYYY-MM-DD date.`);
  }
}

function assertUsDate(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !US_DATE_RE.test(value)) {
    fail("invalid_date", `${label} must use MM/DD/YYYY.`);
  }
  const [month, day, year] = value.split("/").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    fail("invalid_date", `${label} must be a real MM/DD/YYYY date.`);
  }
}

function assertIntegerId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !POSITIVE_INTEGER_ID_RE.test(value)) {
    fail("invalid_id", `${label} must be a positive canonical integer id string.`);
  }
}

/** The strict canonical recurring-charge detail projection required before any charge effect. */
export interface RecurringChargeProjection {
  readonly leaseRecurringChargeID: string;
  readonly leaseID: string;
  readonly accountID: string;
  readonly amount: string;
  readonly description: string;
  readonly dayDue: string;
  readonly frequency: string;
  readonly startDate: string;
  readonly isMoveInCharge: string;
  readonly isFromImport: string;
  readonly endDate: string | null;
  readonly nextChargeDate: string | null;
  readonly rentIncreaseID: string | null;
  readonly importSourceKey: string | null;
  readonly recurringStatusID: 1 | 2 | 3;
}

export interface RecurringChargeCreateBaselineCandidate {
  readonly chargeId: string;
  readonly projectionHash: string;
}

/**
 * Exact proposal-time set of existing charges that already match one requested create. This
 * baseline establishes only the before-state and later drift; because RentVine supplies no
 * provider-owned attempt identity, no newly observed match establishes create causality.
 */
export interface RecurringChargeCreateBaseline {
  readonly version: typeof RECURRING_CHARGE_CREATE_BASELINE_VERSION;
  readonly candidates: readonly RecurringChargeCreateBaselineCandidate[];
}

const CHARGE_REQUIRED_STRING_FIELDS = [
  "leaseRecurringChargeID",
  "leaseID",
  "accountID",
  "amount",
  "description",
  "dayDue",
  "frequency",
  "startDate",
  "isMoveInCharge",
  "isFromImport",
] as const;
const CHARGE_NULLABLE_STRING_FIELDS = [
  "endDate",
  "nextChargeDate",
  "rentIncreaseID",
  "importSourceKey",
] as const;

/**
 * Project one provider recurring-charge detail body into the strict canonical shape. Missing,
 * extra-type, conflicting, or invalid enum data blocks the operation rather than being coerced.
 */
export function projectRecurringCharge(raw: unknown): RecurringChargeProjection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("provider_shape", "Recurring-charge detail must be one object.");
  }
  const record = raw as Record<string, unknown>;
  const projection: Record<string, unknown> = {};
  for (const field of CHARGE_REQUIRED_STRING_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value === "") {
      fail("provider_shape", `Recurring-charge ${field} must be a nonempty string.`);
    }
    projection[field] = value;
  }
  for (const field of CHARGE_NULLABLE_STRING_FIELDS) {
    const value = record[field];
    if (value === null || value === undefined) {
      projection[field] = null;
    } else if (typeof value === "string") {
      projection[field] = value;
    } else {
      fail("provider_shape", `Recurring-charge ${field} must be a string or null.`);
    }
  }
  const status = record["recurringStatusID"];
  if (status !== 1 && status !== 2 && status !== 3) {
    fail(
      "provider_shape",
      "Recurring-charge recurringStatusID must be the integer 1, 2, or 3.",
    );
  }
  projection["recurringStatusID"] = status;
  return projection as unknown as RecurringChargeProjection;
}

export function recurringChargeProjectionHash(
  projection: RecurringChargeProjection,
): string {
  return hashExecutionPreview({ version: "s97-charge-projection/v1", projection });
}

function normalizedRecurringChargeDate(value: string | null): string | null {
  if (value === null) return null;
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return us ? `${us[3]}-${us[1]}-${us[2]}` : value.slice(0, 10);
}

/** Exact submitted-field match shared by proposal baseline capture and execution reconciliation. */
export function recurringChargeMatchesCreate(
  projection: RecurringChargeProjection,
  create: RecurringChargeCreateEffectInput["create"],
): boolean {
  return (
    projection.accountID === create.accountID &&
    projection.amount === create.amount &&
    projection.description === create.description &&
    projection.dayDue === create.dayDue &&
    projection.frequency === create.frequency &&
    normalizedRecurringChargeDate(projection.startDate) ===
      normalizedRecurringChargeDate(create.startDate) &&
    normalizedRecurringChargeDate(projection.endDate) ===
      normalizedRecurringChargeDate(create.endDate ?? null)
  );
}

function compareCanonicalIntegerIds(left: string, right: string): number {
  return left.length - right.length || left.localeCompare(right);
}

/** Build the immutable matching-candidate baseline from canonical detail projections. */
export function buildRecurringChargeCreateBaseline(input: {
  leaseId: string;
  create: RecurringChargeCreateEffectInput["create"];
  projections: readonly RecurringChargeProjection[];
}): RecurringChargeCreateBaseline {
  const candidates = input.projections
    .filter((projection) => {
      if (projection.leaseID !== input.leaseId) {
        fail("identity_mismatch", "A recurring-charge baseline crossed lease identity.");
      }
      return recurringChargeMatchesCreate(projection, input.create);
    })
    .map((projection) => ({
      chargeId: projection.leaseRecurringChargeID,
      projectionHash: recurringChargeProjectionHash(projection),
    }))
    .sort((left, right) => compareCanonicalIntegerIds(left.chargeId, right.chargeId));
  if (
    new Set(candidates.map((candidate) => candidate.chargeId)).size !== candidates.length
  ) {
    fail(
      "provider_shape",
      "A recurring-charge baseline contains duplicate provider ids.",
    );
  }
  return { version: RECURRING_CHARGE_CREATE_BASELINE_VERSION, candidates };
}

/** Exact lease date state consumed and preserved by the dates effect. */
export interface LeaseDateState {
  readonly startDate: string;
  readonly endDate: string | null;
  readonly increaseEligibilityDate: string | null;
}

export interface RenewalDatesEffectInput {
  readonly kind: "renewal_dates_update";
  readonly before: LeaseDateState;
  /** Only changed editable dates; each YYYY-MM-DD or explicit null. */
  readonly after: {
    readonly endDate?: string | null;
    readonly increaseEligibilityDate?: string | null;
  };
}

export interface RecurringChargeUpdateEffectInput {
  readonly kind: "recurring_charge_update";
  readonly chargeId: string;
  readonly before: RecurringChargeProjection;
  /** Only changed official fields; nonempty; string wire formats. */
  readonly changes: Readonly<
    Partial<
      Pick<
        RecurringChargeProjection,
        | "accountID"
        | "amount"
        | "description"
        | "dayDue"
        | "frequency"
        | "startDate"
        | "endDate"
      >
    >
  >;
}

export interface RecurringChargeCreateEffectInput {
  readonly kind: "recurring_charge_create";
  readonly create: {
    readonly accountID: string;
    readonly amount: string;
    readonly description: string;
    readonly dayDue: string;
    readonly frequency: string;
    readonly startDate: string;
    readonly endDate?: string;
  };
  /** Required for new proposals; omitted only by durable legacy records, which fail closed. */
  readonly baseline?: RecurringChargeCreateBaseline;
}

export type RenewalWritebackEffectInput =
  | RenewalDatesEffectInput
  | RecurringChargeUpdateEffectInput
  | RecurringChargeCreateEffectInput;

export interface ValidatedRenewalWritebackEffect {
  readonly index: number;
  readonly actionKey: RenewalWritebackActionKey;
  readonly effect: RenewalWritebackEffectInput;
  /** Exact reversal input captured at proposal time; absent when no supported exact inverse. */
  readonly reversal:
    | { readonly kind: "restore_dates"; readonly restore: LeaseDateState }
    | {
        readonly kind: "restore_charge_fields";
        readonly chargeId: string;
        readonly restore: RecurringChargeUpdateEffectInput["changes"];
      }
    | { readonly kind: "delete_created_charge" }
    | { readonly kind: "none"; readonly reason: string };
  readonly effectHash: string;
}

export interface RenewalWritebackProposalInput {
  readonly leaseId: string;
  readonly account: string;
  readonly actorUid: string;
  readonly actorEmail: string;
  readonly actorRole: string;
  readonly leaseState: LeaseDateState;
  readonly sourceReadAtIso: string;
  readonly evidenceRef: string;
  readonly effects: readonly RenewalWritebackEffectInput[];
  readonly nowMs: number;
}

export interface RenewalWritebackProposal {
  readonly version: typeof RENEWAL_WRITEBACK_PROPOSAL_VERSION;
  readonly leaseId: string;
  readonly account: string;
  readonly actorUid: string;
  readonly actorEmail: string;
  readonly actorRole: string;
  readonly leaseState: LeaseDateState;
  readonly sourceReadAtIso: string;
  readonly evidenceRef: string;
  readonly effects: readonly ValidatedRenewalWritebackEffect[];
  readonly previewHash: string;
  readonly createdAtIso: string;
  readonly confirmationExpiresAtIso: string;
}

const EFFECT_ORDER: Record<RenewalWritebackEffectInput["kind"], number> = {
  renewal_dates_update: 0,
  recurring_charge_update: 1,
  recurring_charge_create: 2,
};

function validateDatesEffect(
  input: RenewalDatesEffectInput,
  leaseState: LeaseDateState,
): void {
  assertIsoDate(input.before.startDate, "Lease startDate");
  if (input.before.endDate !== null) assertIsoDate(input.before.endDate, "Lease endDate");
  if (input.before.increaseEligibilityDate !== null) {
    assertIsoDate(input.before.increaseEligibilityDate, "Lease increaseEligibilityDate");
  }
  if (canonicalJson(input.before) !== canonicalJson(leaseState)) {
    fail(
      "stale_before_state",
      "The dates effect's before state does not match the fresh lease state.",
    );
  }
  const after = input.after;
  const changedKeys = Object.keys(after) as (keyof typeof after)[];
  if (changedKeys.length === 0) {
    fail("no_change", "At least one editable date must change.");
  }
  for (const key of changedKeys) {
    if (key !== "endDate" && key !== "increaseEligibilityDate") {
      fail("unsupported_field", `Lease date field ${String(key)} is not editable.`);
    }
    const value = after[key];
    if (value !== null) assertIsoDate(value, `Lease ${key}`);
    if (canonicalJson(value ?? null) === canonicalJson(input.before[key])) {
      fail("no_change", `Lease ${key} must actually change or be omitted.`);
    }
  }
}

function validateChargeUpdateEffect(
  input: RecurringChargeUpdateEffectInput,
  leaseId: string,
): void {
  assertIntegerId(input.chargeId, "Recurring-charge id");
  const before = projectRecurringCharge(input.before);
  if (before.leaseRecurringChargeID !== input.chargeId) {
    fail(
      "identity_mismatch",
      "The charge before-state does not belong to the targeted charge id.",
    );
  }
  if (before.leaseID !== leaseId) {
    fail(
      "identity_mismatch",
      "The charge before-state does not belong to the proposal lease.",
    );
  }
  const changes = input.changes;
  const keys = Object.keys(changes) as (keyof typeof changes)[];
  if (keys.length === 0) {
    fail("no_change", "A recurring-charge update must change at least one field.");
  }
  for (const key of keys) {
    const value = changes[key];
    if (value === null) {
      fail("unsupported_transition", `Recurring-charge ${key} cannot be set to null.`);
    }
    switch (key) {
      case "accountID":
        assertIntegerId(value, "Recurring-charge accountID");
        break;
      case "amount":
        if (typeof value !== "string" || !POSITIVE_DECIMAL_RE.test(value)) {
          fail(
            "invalid_value",
            "Recurring-charge amount must be a two-digit decimal string.",
          );
        }
        break;
      case "description":
        if (typeof value !== "string" || value.trim() === "") {
          fail("invalid_value", "Recurring-charge description must be nonblank.");
        }
        break;
      case "dayDue":
        if (typeof value !== "string" || !DAY_DUE_RE.test(value)) {
          fail("invalid_value", 'Recurring-charge dayDue must be "1" through "31".');
        }
        break;
      case "frequency":
        if (typeof value !== "string" || !FREQUENCY_RE.test(value)) {
          fail("invalid_value", 'Recurring-charge frequency must be "1" through "24".');
        }
        break;
      case "startDate":
        assertUsDate(value, "Recurring-charge startDate");
        break;
      case "endDate":
        // V1 rejects both dated-to-open-ended and open-ended-to-dated transitions: the provider
        // documents no clear value, so neither direction has a supported exact inverse.
        if (before.endDate === null) {
          fail(
            "unsupported_transition",
            "An open-ended recurring charge cannot gain an endDate in V1.",
          );
        }
        assertUsDate(value, "Recurring-charge endDate");
        break;
      default:
        fail(
          "unsupported_field",
          `Recurring-charge field ${String(key)} is not editable.`,
        );
    }
    if (key !== "endDate" && value === before[key]) {
      fail("no_change", `Recurring-charge ${key} must actually change or be omitted.`);
    }
    if (key === "endDate" && value === before.endDate) {
      fail("no_change", "Recurring-charge endDate must actually change or be omitted.");
    }
  }
}

function validateChargeCreateEffect(input: RecurringChargeCreateEffectInput): void {
  const create = input.create;
  assertIntegerId(create.accountID, "Recurring-charge accountID");
  if (!POSITIVE_DECIMAL_RE.test(create.amount)) {
    fail("invalid_value", "Recurring-charge amount must be a two-digit decimal string.");
  }
  if (typeof create.description !== "string" || create.description.trim() === "") {
    fail("invalid_value", "Recurring-charge description must be nonblank.");
  }
  if (!DAY_DUE_RE.test(create.dayDue)) {
    fail("invalid_value", 'Recurring-charge dayDue must be "1" through "31".');
  }
  if (!FREQUENCY_RE.test(create.frequency)) {
    fail("invalid_value", 'Recurring-charge frequency must be "1" through "24".');
  }
  assertUsDate(create.startDate, "Recurring-charge startDate");
  if (create.endDate !== undefined)
    assertUsDate(create.endDate, "Recurring-charge endDate");
  const baseline = input.baseline;
  if (!baseline || baseline.version !== RECURRING_CHARGE_CREATE_BASELINE_VERSION) {
    fail(
      "baseline_required",
      "A recurring-charge create requires an exact matching-candidate baseline.",
    );
  }
  let priorId: string | null = null;
  for (const candidate of baseline.candidates) {
    assertIntegerId(candidate.chargeId, "Baseline recurring-charge id");
    if (!/^[a-f0-9]{64}$/.test(candidate.projectionHash)) {
      fail("baseline_invalid", "A recurring-charge baseline hash is invalid.");
    }
    if (
      priorId !== null &&
      compareCanonicalIntegerIds(priorId, candidate.chargeId) >= 0
    ) {
      fail(
        "baseline_invalid",
        "Recurring-charge baseline candidates must be unique and canonically ordered.",
      );
    }
    priorId = candidate.chargeId;
  }
}

function actionKeyFor(effect: RenewalWritebackEffectInput): RenewalWritebackActionKey {
  switch (effect.kind) {
    case "renewal_dates_update":
      return RENEWAL_DATES_UPDATE_KEY;
    case "recurring_charge_update":
      return RECURRING_CHARGE_UPDATE_KEY;
    case "recurring_charge_create":
      return RECURRING_CHARGE_CREATE_KEY;
  }
}

function reversalFor(
  effect: RenewalWritebackEffectInput,
): ValidatedRenewalWritebackEffect["reversal"] {
  switch (effect.kind) {
    case "renewal_dates_update":
      return { kind: "restore_dates", restore: effect.before };
    case "recurring_charge_update": {
      const restore: Record<string, string> = {};
      for (const key of Object.keys(effect.changes)) {
        const prior = effect.before[key as keyof RecurringChargeProjection];
        if (typeof prior !== "string") {
          return {
            kind: "none",
            reason: `Field ${key} has no supported exact inverse value.`,
          };
        }
        restore[key] = prior;
      }
      return {
        kind: "restore_charge_fields",
        chargeId: effect.chargeId,
        restore: restore as RecurringChargeUpdateEffectInput["changes"],
      };
    }
    case "recurring_charge_create":
      return { kind: "delete_created_charge" };
  }
}

/**
 * Validate and freeze one proposal. Effects are re-ordered deterministically (dates, updates,
 * creates) with stable input order inside each group; the preview hash binds every field.
 */
export function buildRenewalWritebackProposal(
  input: RenewalWritebackProposalInput,
): RenewalWritebackProposal {
  assertIntegerId(input.leaseId, "Lease id");
  if (input.account !== RENEWAL_WRITEBACK_ACCOUNT) {
    fail("account_mismatch", "The proposal must target the exact configured account.");
  }
  if (!input.actorUid || !input.actorEmail.endsWith("@pmikcmetro.com")) {
    fail("actor_invalid", "The proposal actor must be a managed pmikcmetro.com user.");
  }
  if (input.effects.length === 0) {
    fail("no_change", "A proposal requires at least one effect.");
  }
  assertIsoDate(input.leaseState.startDate, "Lease startDate");

  let datesEffects = 0;
  for (const effect of input.effects) {
    switch (effect.kind) {
      case "renewal_dates_update":
        datesEffects += 1;
        if (datesEffects > 1) {
          fail("duplicate_effect", "A proposal carries at most one dates effect.");
        }
        validateDatesEffect(effect, input.leaseState);
        break;
      case "recurring_charge_update":
        validateChargeUpdateEffect(effect, input.leaseId);
        break;
      case "recurring_charge_create":
        validateChargeCreateEffect(effect);
        break;
      default:
        fail("unsupported_effect", "Unknown renewal-writeback effect kind.");
    }
  }
  const chargeIds = input.effects
    .filter(
      (effect): effect is RecurringChargeUpdateEffectInput =>
        effect.kind === "recurring_charge_update",
    )
    .map((effect) => effect.chargeId);
  if (new Set(chargeIds).size !== chargeIds.length) {
    fail("duplicate_effect", "Each existing charge may be updated at most once.");
  }
  const createKeys = input.effects
    .filter(
      (effect): effect is RecurringChargeCreateEffectInput =>
        effect.kind === "recurring_charge_create",
    )
    .map((effect) => canonicalJson(effect.create));
  if (new Set(createKeys).size !== createKeys.length) {
    fail(
      "duplicate_effect",
      "An exact recurring charge may be created at most once per proposal.",
    );
  }

  const ordered = [...input.effects].sort(
    (a, b) => EFFECT_ORDER[a.kind] - EFFECT_ORDER[b.kind],
  );
  const createdAtIso = new Date(input.nowMs).toISOString();
  const effects: ValidatedRenewalWritebackEffect[] = ordered.map((effect, index) => ({
    index,
    actionKey: actionKeyFor(effect),
    effect,
    reversal: reversalFor(effect),
    effectHash: hashExecutionPreview({
      version: RENEWAL_WRITEBACK_PROPOSAL_VERSION,
      leaseId: input.leaseId,
      account: input.account,
      actionKey: actionKeyFor(effect),
      effect,
    }),
  }));

  const previewHash = hashExecutionPreview({
    version: RENEWAL_WRITEBACK_PROPOSAL_VERSION,
    leaseId: input.leaseId,
    account: input.account,
    actorUid: input.actorUid,
    leaseState: input.leaseState,
    sourceReadAtIso: input.sourceReadAtIso,
    evidenceRef: input.evidenceRef,
    effects: effects.map((entry) => ({
      actionKey: entry.actionKey,
      effect: entry.effect,
      effectHash: entry.effectHash,
    })),
  });

  return {
    version: RENEWAL_WRITEBACK_PROPOSAL_VERSION,
    leaseId: input.leaseId,
    account: input.account,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    leaseState: input.leaseState,
    sourceReadAtIso: input.sourceReadAtIso,
    evidenceRef: input.evidenceRef,
    effects,
    previewHash,
    createdAtIso,
    confirmationExpiresAtIso: new Date(
      input.nowMs + RENEWAL_WRITEBACK_CONFIRMATION_TTL_MS,
    ).toISOString(),
  };
}

export interface RenewalWritebackConfirmation {
  readonly previewHash: string;
  readonly effectHash: string;
  readonly confirmedAtIso: string;
}

/** Assert one unexpired exact confirmation for one exact effect of one exact proposal. */
export function assertRenewalWritebackConfirmation(input: {
  readonly proposal: RenewalWritebackProposal;
  readonly effect: ValidatedRenewalWritebackEffect;
  readonly confirmation: RenewalWritebackConfirmation;
  readonly nowMs: number;
}): void {
  const { proposal, effect, confirmation, nowMs } = input;
  if (confirmation.previewHash !== proposal.previewHash) {
    fail("confirmation_mismatch", "The confirmation does not match this exact proposal.");
  }
  if (confirmation.effectHash !== effect.effectHash) {
    fail("confirmation_mismatch", "The confirmation does not match this exact effect.");
  }
  const confirmedAtMs = Date.parse(confirmation.confirmedAtIso);
  if (!Number.isFinite(confirmedAtMs) || confirmedAtMs > nowMs) {
    fail("confirmation_invalid", "The confirmation timestamp is invalid.");
  }
  if (nowMs > Date.parse(proposal.confirmationExpiresAtIso)) {
    fail("confirmation_expired", "The proposal confirmation window has expired.");
  }
}

/** One opaque durable attempt identity per exact effect (duplicate confirmation maps back to it). */
export function renewalWritebackExecutionId(
  proposal: RenewalWritebackProposal,
  effect: ValidatedRenewalWritebackEffect,
): string {
  return `s97:${proposal.leaseId}:${proposal.previewHash}:${effect.effectHash}`;
}

/** Durable pre-generation identity retained only for contextHash-checked compatibility reads. */
export function legacyRenewalWritebackExecutionId(
  proposal: RenewalWritebackProposal,
  effect: ValidatedRenewalWritebackEffect,
): string {
  return `s97:${proposal.leaseId}:${effect.effectHash}`;
}

/** The reversal attempt identity is separate from its forward identity. */
export function renewalWritebackReversalExecutionId(
  forwardExecutionId: string,
  forwardReceiptHash: string,
): string {
  return `${forwardExecutionId}:reversal:${forwardReceiptHash.slice(0, 16)}`;
}
