// S249: admit deliberate, exact-lease comparison preparation. The existing lookup owns
// action authority, quota and provider evidence. Its durable per-cycle claim is never retried
// after an ambiguous result.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import type {
  KickoffPreparationRecord,
  KickoffTrigger,
} from "@/lib/firestore/renewal-kickoff-preparations";
import {
  HOUSING_ASSISTANCE_HOLD_REASON,
  heldBackForHousingAssistance,
} from "@/lib/lease-renewal/kickoff-facts";
import { KICKOFF_WORDS } from "@/lib/lease-renewal/renewal-preparation";

export type KickoffPreparationStatus =
  | "prepared"
  | "reused"
  | "no_usable"
  | "allowance_reached"
  | "already_claimed"
  | "held_back"
  /** S250: a standing agreement covers the owner step, so nothing was looked up by itself. */
  | "covered"
  | "refused"
  | "failed";

export type KickoffRefusalCode =
  | "verification_identity"
  | "automatic_start_off"
  | "outside_working_batch"
  | "coverage_unconfirmed"
  | "no_cycle"
  | "source_unavailable";

export interface KickoffPreparationResult {
  readonly status: KickoffPreparationStatus;
  readonly leaseId: string;
  readonly cycleDateIso: string | null;
  readonly message: string;
  readonly code?: KickoffRefusalCode;
  /** True only when this request made a lookup the provider billed. */
  readonly billed: boolean;
  readonly observationId?: string;
}

export interface KickoffLeaseRead {
  /** The renewal cycle's date: the batch claim's key. */
  readonly cycleDateIso: string | null;
  /** True when the lease is a renewal target in the default working month. */
  readonly inWorkingBatch: boolean;
  readonly dispositionHold?: string | null;
  /**
   * S282 R-S282-2: why the month's run leaves this lease out: its off-cycle end date is not
   * included for its exact value (needs review or on hold). Null or absent otherwise.
   */
  readonly offCycleHold?: string | null;
  readonly rentField?: { readonly revision: number; readonly empty: boolean };
  readonly draftEligible?: boolean;
  readonly dispositionRevision?: number;
  /** The work record's cycle the lookup is stored under; null before one exists. */
  readonly workRecordCycleId: string | null;
  /** S251: the lease's Housing assistance Yes fact; null when not set or No. */
  readonly housingAssistance: { readonly program: string } | null;
  /** S251 R-S251-7: "Propose a change" is recorded for this cycle, which releases the hold. */
  readonly rentChangeProposed?: boolean;
  /**
   * S250: "covered" when a standing agreement covers the owner step on this read, "unconfirmed"
   * when coverage could not be read or confirmed; null or absent when nothing covers the lease
   * (including a lease that left its rule).
   */
  readonly ownerStepCoverage?: "covered" | "unconfirmed" | null;
  /** The covering agreement's name, for the words of a covered answer. */
  readonly coveredBy?: string | null;
}

export interface KickoffLookupAnswer {
  readonly ok: boolean;
  readonly reason?: string;
  readonly confidence?: string;
  readonly observationId?: string;
  readonly cached?: boolean;
  /** True when the provider billed this lookup (one 2xx response with a body). */
  readonly billed?: boolean;
  readonly error?: string;
  /** False when the lookup was refused before the provider could be called (nothing billed). */
  readonly providerCalled?: false;
}

/**
 * S249: answered outcomes that prove nothing was billed and that are refusals, not results: the
 * provider answered with a non-2xx status (RentCast bills only a 2xx response with a body). A
 * timeout or a lost connection is not one of these: it may have been billed.
 */
const UNBILLED_REFUSAL_REASONS: ReadonlySet<string> = new Set(["http_error"]);

export interface KickoffPreparationDeps {
  readonly readLease: (
    leaseId: string,
    month?: string,
  ) => Promise<KickoffLeaseRead | null>;
  readonly prepareWorkingResult?: (
    leaseId: string,
    lease: KickoffLeaseRead,
    status: KickoffPreparationStatus,
    month?: string,
  ) => Promise<string>;
  readonly storedComparison: (
    leaseId: string,
    workRecordCycleId: string | null,
  ) => Promise<boolean>;
  readonly allowanceReached: () => Promise<boolean>;
  readonly claim: (input: {
    leaseId: string;
    cycleKey: string;
    trigger: KickoffTrigger;
    actorUid: string;
    operationId: string;
    dispositionRevision?: number;
  }) => Promise<
    | { claimed: true; record: KickoffPreparationRecord }
    | { claimed: false; record: KickoffPreparationRecord; sameOperation: boolean }
  >;
  readonly settle: (input: {
    leaseId: string;
    cycleKey: string;
    operationId: string;
    state: "prepared" | "reused" | "no_usable" | "failed";
    observationId?: string | null;
    billed: boolean | null;
    reason?: string | null;
  }) => Promise<void>;
  readonly release: (input: {
    leaseId: string;
    cycleKey: string;
    operationId: string;
  }) => Promise<void>;
  /** The existing comparison lookup, run in this request's own staff session. */
  readonly lookup: (
    leaseId: string,
    workRecordCycleId: string | null,
  ) => Promise<KickoffLookupAnswer>;
}

const NO_USABLE_WORDS: Record<string, string> = {
  insufficient_comparables: "too few comparable listings match this search",
  too_few_comps: "fewer than three comparable listings came back",
  missing_address: "this lease has no address on file",
  provider_not_live: "live comparison lookups are not turned on here",
};

export async function runKickoffPreparation(
  actor: AuthenticatedUser,
  input: {
    readonly leaseId: string;
    readonly trigger: KickoffTrigger;
    readonly operationId: string;
    readonly month?: string;
    readonly cycleDateIso?: string;
  },
  deps: KickoffPreparationDeps,
): Promise<KickoffPreparationResult> {
  const base = { leaseId: input.leaseId, billed: false } as const;
  const refuse = (
    code: KickoffRefusalCode,
    message: string,
    cycleDateIso: string | null = null,
  ): KickoffPreparationResult => ({
    ...base,
    status: "refused",
    code,
    message,
    cycleDateIso,
  });
  // Fence: a verification session never starts a lookup, by any trigger.
  if (isVerificationAccount(actor))
    return refuse(
      "verification_identity",
      "Verification sessions read only, so no comparison was started.",
    );
  if (input.trigger === "automatic")
    return refuse(
      "automatic_start_off",
      "Choose the preparation button for the selected month to start.",
    );
  const lease = await deps.readLease(input.leaseId, input.month);
  if (!lease)
    return refuse(
      "source_unavailable",
      "The lease could not be read just now, so no comparison was started.",
    );
  if (lease.dispositionHold)
    return refuse("outside_working_batch", lease.dispositionHold, lease.cycleDateIso);
  // S282 R-S282-2: the month's deliberate run prepares an off-cycle lease only once staff
  // included its exact end date. Nothing is claimed or looked up for it.
  if (input.month && lease.offCycleHold)
    return refuse("outside_working_batch", lease.offCycleHold, lease.cycleDateIso);
  if (input.month && (!lease.inWorkingBatch || lease.cycleDateIso !== input.cycleDateIso))
    return refuse(
      "outside_working_batch",
      "The selected month or lease cycle changed. Refresh the desk and review its current month.",
      lease.cycleDateIso,
    );
  if (input.month && lease.ownerStepCoverage === "unconfirmed")
    return refuse(
      "coverage_unconfirmed",
      "Review the lease's pricing basis. Its standing coverage could not be confirmed.",
      lease.cycleDateIso,
    );
  const complete = async (
    result: KickoffPreparationResult,
  ): Promise<KickoffPreparationResult> => {
    if (!deps.prepareWorkingResult) return result;
    const working = await deps
      .prepareWorkingResult(input.leaseId, lease, result.status, input.month)
      .catch(
        () =>
          "The app-owned work could not be read back. Continue preparation to check the saved comparison and draft.",
      );
    return { ...result, message: [result.message, working].filter(Boolean).join(" ") };
  };
  if (input.month && lease.ownerStepCoverage === "covered")
    return complete({
      ...base,
      status: "covered",
      cycleDateIso: lease.cycleDateIso,
      message: `${lease.coveredBy ?? "A verified standing agreement"} supplies the rent basis.`,
    });
  if (!lease.cycleDateIso)
    return refuse(
      "no_cycle",
      "This lease has no renewal cycle date, so it cannot be prepared.",
    );
  const cycleKey = lease.cycleDateIso;
  if (
    heldBackForHousingAssistance({
      housingAssistance: lease.housingAssistance,
      rentChangeProposed: lease.rentChangeProposed === true,
    })
  )
    return complete({
      ...base,
      status: "held_back",
      cycleDateIso: cycleKey,
      message: HOUSING_ASSISTANCE_HOLD_REASON,
    });
  if (await deps.storedComparison(input.leaseId, lease.workRecordCycleId))
    return complete({
      ...base,
      status: "reused",
      cycleDateIso: cycleKey,
      message: "A comparison is already stored for this cycle; it is reused.",
    });
  if (await deps.allowanceReached())
    return {
      ...base,
      status: "allowance_reached",
      cycleDateIso: cycleKey,
      message: KICKOFF_WORDS.allowanceReached,
    };
  const claim = await deps.claim({
    ...(lease.dispositionRevision !== undefined
      ? { dispositionRevision: lease.dispositionRevision }
      : {}),
    leaseId: input.leaseId,
    cycleKey,
    trigger: input.trigger,
    actorUid: actor.uid,
    operationId: input.operationId,
  });
  if (!claim.claimed)
    return {
      ...base,
      status: "already_claimed",
      cycleDateIso: cycleKey,
      message:
        claim.record.state === "claimed"
          ? "A comparison for this cycle was already started; it is not started again."
          : "This cycle's comparison already ran once; use the lease's own comparison control to ask again.",
    };
  let answer: KickoffLookupAnswer;
  try {
    answer = await deps.lookup(input.leaseId, lease.workRecordCycleId);
  } catch {
    // The lookup may or may not have reached the provider: the claim stays, so nothing repeats.
    await deps
      .settle({
        leaseId: input.leaseId,
        cycleKey,
        operationId: input.operationId,
        state: "failed",
        billed: null,
        reason: "The comparison did not answer.",
      })
      .catch(() => undefined);
    return {
      ...base,
      status: "failed",
      cycleDateIso: cycleKey,
      message:
        "The comparison did not answer. It is not started again by itself; the lease's own comparison control can ask again.",
    };
  }
  if (answer.reason === "out_of_allowance") {
    // No billed call was made: the claim is released so the lease can be prepared later.
    await deps.release({
      leaseId: input.leaseId,
      cycleKey,
      operationId: input.operationId,
    });
    return {
      ...base,
      status: "allowance_reached",
      cycleDateIso: cycleKey,
      message: KICKOFF_WORDS.allowanceReached,
    };
  }
  // S249: a refusal where nothing was billed releases the claim, so the cycle can still be
  // prepared later: the lookup was refused before the provider could be called, or the provider
  // answered with a status it never bills. A billed or ambiguous outcome keeps the claim.
  const provablyUnbilled =
    answer.billed !== true &&
    (answer.providerCalled === false ||
      (answer.ok && UNBILLED_REFUSAL_REASONS.has(answer.reason ?? "")));
  if (provablyUnbilled) {
    await deps.release({
      leaseId: input.leaseId,
      cycleKey,
      operationId: input.operationId,
    });
    const why = answer.error ?? "The comparison provider refused the request.";
    return {
      ...base,
      status: "failed",
      cycleDateIso: cycleKey,
      message: `${why.replace(/[.\s]+$/, "")}. Nothing was billed, so this lease can be prepared again.`,
    };
  }
  if (!answer.ok) {
    // It may have reached the provider: the claim stays, so nothing repeats by itself.
    await deps.settle({
      leaseId: input.leaseId,
      cycleKey,
      operationId: input.operationId,
      state: "failed",
      billed: null,
      reason: answer.error ?? "The comparison was refused.",
    });
    return {
      ...base,
      status: "failed",
      cycleDateIso: cycleKey,
      message: answer.error ?? "The comparison was refused.",
    };
  }
  // A cached result costs nothing; otherwise the provider's own word, else billed (the safe read).
  const billed = answer.cached !== true && answer.billed !== false;
  if (answer.confidence === "Likely" && answer.observationId) {
    await deps.settle({
      leaseId: input.leaseId,
      cycleKey,
      operationId: input.operationId,
      state: "prepared",
      observationId: answer.observationId,
      billed,
    });
    return complete({
      ...base,
      billed,
      status: "prepared",
      cycleDateIso: cycleKey,
      message: "The comparison is stored for this cycle.",
      observationId: answer.observationId,
    });
  }
  const reason =
    NO_USABLE_WORDS[answer.reason ?? ""] ?? "the comparison returned no usable estimate";
  await deps.settle({
    leaseId: input.leaseId,
    cycleKey,
    operationId: input.operationId,
    state: "no_usable",
    billed,
    reason,
  });
  return complete({
    ...base,
    billed,
    status: "no_usable",
    cycleDateIso: cycleKey,
    message: `The comparison found nothing usable: ${reason}. Enter your own comparison figures on the lease.`,
  });
}
