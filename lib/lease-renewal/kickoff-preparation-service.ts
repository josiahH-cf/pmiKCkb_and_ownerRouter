// S249 ARCH-S249-3 / ARCH-S249-4: batch preparation for one lease, in the signed-in staff
// member's own request. It runs the EXISTING comparison lookup (the market-comps route, with its
// action gate, runtime suspension check, cache, allowance stop and metering unchanged) at most once
// per lease and renewal cycle, behind a claim taken before the lookup starts. It creates no Gmail
// draft, send, schedule, reminder or provider write: its only effects are the claim record and the
// lookup's own stored observation.
//
// Every refusal happens before any billed call, in this order:
//   1. a verification identity (lib/auth/canary-policy.ts) never starts a lookup;
//   2. the automatic start is refused while the reviewed setting is off;
//   3. the automatic start is refused for a lease outside the working batch;
//   4. a lease held back for housing assistance (S251) is refused;
//   5. a stored comparison for the cycle is reused, with no lookup;
//   6. at the allowance nothing is looked up;
//   7. a lease and cycle that already hold a claim are not looked up again.

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
  | "refused"
  | "failed";

export type KickoffRefusalCode =
  | "verification_identity"
  | "automatic_start_off"
  | "outside_working_batch"
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
  /** The work record's cycle the lookup is stored under; null before one exists. */
  readonly workRecordCycleId: string | null;
  /** S251 slot: the lease fact; null until that suite records it. */
  readonly housingAssistance: { readonly program: string } | null;
}

export interface KickoffLookupAnswer {
  readonly ok: boolean;
  readonly reason?: string;
  readonly confidence?: string;
  readonly observationId?: string;
  readonly cached?: boolean;
  readonly error?: string;
}

export interface KickoffPreparationDeps {
  readonly automaticStartEnabled: () => Promise<boolean>;
  readonly readLease: (leaseId: string) => Promise<KickoffLeaseRead | null>;
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
  if (input.trigger === "automatic" && !(await deps.automaticStartEnabled()))
    return refuse(
      "automatic_start_off",
      `Automatic preparation is turned off. Choose ${KICKOFF_WORDS.prepareBatch} to run it.`,
    );
  const lease = await deps.readLease(input.leaseId);
  if (!lease)
    return refuse(
      "source_unavailable",
      "The lease could not be read just now, so no comparison was started.",
    );
  if (input.trigger === "automatic" && !lease.inWorkingBatch)
    return refuse(
      "outside_working_batch",
      "This lease is not in the working batch, so it was not prepared automatically.",
      lease.cycleDateIso,
    );
  if (!lease.cycleDateIso)
    return refuse(
      "no_cycle",
      "This lease has no renewal cycle date, so it cannot be prepared.",
    );
  const cycleKey = lease.cycleDateIso;
  if (heldBackForHousingAssistance({ housingAssistance: lease.housingAssistance }))
    return {
      ...base,
      status: "held_back",
      cycleDateIso: cycleKey,
      message: HOUSING_ASSISTANCE_HOLD_REASON,
    };
  if (await deps.storedComparison(input.leaseId, lease.workRecordCycleId))
    return {
      ...base,
      status: "reused",
      cycleDateIso: cycleKey,
      message: "A comparison is already stored for this cycle; it is reused.",
    };
  if (await deps.allowanceReached())
    return {
      ...base,
      status: "allowance_reached",
      cycleDateIso: cycleKey,
      message: KICKOFF_WORDS.allowanceReached,
    };
  const claim = await deps.claim({
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
  if (!answer.ok) {
    await deps.settle({
      leaseId: input.leaseId,
      cycleKey,
      operationId: input.operationId,
      state: "failed",
      billed: false,
      reason: answer.error ?? "The comparison was refused.",
    });
    return {
      ...base,
      status: "failed",
      cycleDateIso: cycleKey,
      message: answer.error ?? "The comparison was refused.",
    };
  }
  const billed = answer.cached !== true;
  if (answer.confidence === "Likely" && answer.observationId) {
    await deps.settle({
      leaseId: input.leaseId,
      cycleKey,
      operationId: input.operationId,
      state: "prepared",
      observationId: answer.observationId,
      billed,
    });
    return {
      ...base,
      billed,
      status: "prepared",
      cycleDateIso: cycleKey,
      message: "The comparison is stored for this cycle.",
      observationId: answer.observationId,
    };
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
  return {
    ...base,
    billed,
    status: "no_usable",
    cycleDateIso: cycleKey,
    message: `The comparison found nothing usable: ${reason}. Enter your own comparison figures on the lease.`,
  };
}
