// S279 R-S279-1 to R-S279-3 (ARCH-S279-1, ARCH-S279-2): the one waiting projection. Who a lease
// waits on, since when, the last contact and the status check all come from the lease's own
// outreach evidence for its current cycle (S248: the linked renewal messages, their accepted sends,
// replies and delivery reports) read against the staff record. The step's waiting line, the
// "Waiting and follow-up" card, the desk row and the lease status lines read this projection, so
// they cannot disagree.
//
// It takes the lease, the cycle and the stored message evidence as inputs and no viewer identity:
// nothing here reads a person's own mailbox links, so every staff member with the lease's workflow
// access reads the same status (R-S279-2). A person's link attention still drives only that
// person's notifications, in the follow-up projection.
//
// The check compares like with like (R-S279-3): the staff record against the current message's own
// thread for that audience and cycle, including the app's own confirmed send. A confirmed send with
// no reply is never a check. A real disagreement keeps both facts and names the fix.
//
// Pure and client-safe. Nothing here records, sends, claims, schedules or looks anything up, and no
// reply body is read: only the times the evidence carries.

import {
  NO_WORK_RECORD_CYCLE,
  outreachDate,
  outreachFill,
  outreachScopeFor,
  projectOutreachEvidence,
  type AudienceOutreachEvidence,
  type LeaseOutreachEvidenceInput,
  type OutreachAudience,
  type OutreachCheck,
  type OutreachEvidence,
  type OutreachFill,
} from "@/lib/lease-renewal/outreach-evidence";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

export const LEASE_WAITING_VERSION = "lease-waiting/v1" as const;

/** Whose move it is: the owner or the tenant after a send, the PMI KC team otherwise. */
export type LeaseWaitingParty = OutreachAudience | "team";

/** One audience's contact facts from its counted messages in the cycle. */
export interface LeaseWaitingContact {
  /** The first accepted send of the cycle's outreach to this audience. */
  readonly sinceIso: string | null;
  /** The latest accepted send or reply on this audience's counted messages. */
  readonly lastContactIso: string | null;
  /** The latest reply after a send, when there is one. */
  readonly replyAtIso: string | null;
}

/** R-S279-3: a real disagreement, in both facts and the fix. */
export interface LeaseWaitingCheck {
  readonly audience: OutreachAudience;
  /** What disagrees: the outreach record, or the recorded answer after an observed reply. */
  readonly subject: OutreachCheck["subject"];
  /** The staff record's fact as a sentence ("The staff record says waiting on the tenant."). */
  readonly staffRecord: string;
  /** The message evidence as a sentence ("The tenant replied on 11/12/2026."). */
  readonly evidence: string;
  /** The fix and the editor it opens. */
  readonly fix: { readonly label: string; readonly target: string };
  /** Both facts and the fix in one line, as every surface shows it. */
  readonly sentence: string;
}

export interface LeaseWaiting {
  readonly version: typeof LEASE_WAITING_VERSION;
  /** False when the lease's message evidence could not be read; nothing is derived then. */
  readonly readable: boolean;
  readonly cycleId: string | null;
  /** The audience of the current step's message; null when the current step has none. */
  readonly audience: OutreachAudience | null;
  /** Who has the move; null once complete or when nothing is known. */
  readonly party: LeaseWaitingParty | null;
  /** Since when the owner or tenant has had the move; null for the team. */
  readonly sinceIso: string | null;
  /** The last contact on the current step's messages (both audiences when the step has none). */
  readonly lastContactIso: string | null;
  readonly check: LeaseWaitingCheck | null;
}

const msIso = (ms: number | null | undefined): string | null =>
  typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

const latestMs = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? Math.max(...known) : null;
};

/**
 * ARCH-S279-1: the one rule for since and last contact. Only counted messages contact anyone: a
 * scheduled, unconfirmed or bounced message, an unsent draft and a corrected record never do.
 */
export function audienceContact(evidence: AudienceOutreachEvidence): LeaseWaitingContact {
  return {
    sinceIso: msIso(evidence.derived?.sentAtMs ?? null),
    lastContactIso: msIso(latestMs([evidence.lastSentAtMs, evidence.replyAtMs])),
    replyAtIso: msIso(evidence.replyAtMs),
  };
}

const UNKNOWN_CONTACT: LeaseWaitingContact = {
  sinceIso: null,
  lastContactIso: null,
  replyAtIso: null,
};

type Lane = Pick<
  ReturnType<typeof manualRenewalSummary>,
  "complete" | "waitingParty" | "nextActivity"
>;

/** The audience whose message the lane's current activity concerns, or null. */
export function laneAudience(lane: Lane | null | undefined): OutreachAudience | null {
  if (!lane || lane.complete) return null;
  switch (lane.nextActivity) {
    case "owner_outreach":
    case "owner_response":
      return "owner";
    case "tenant_offer":
    case "tenant_response":
    case "information_form":
    case "form_returned":
      return "tenant";
    default:
      return null;
  }
}

const WHO: Record<OutreachAudience, string> = {
  owner: "the owner",
  tenant: "the tenant",
};

const OUTREACH_FIX: Record<OutreachAudience, { label: string; target: string }> = {
  owner: { label: "Record the owner outreach", target: "renewal-manual-owner_outreach" },
  tenant: { label: "Record the tenant offer", target: "renewal-manual-tenant_offer" },
};

/** The fix wording R-S279-3 names for an answer recorded against an observed reply. */
export const LEASE_WAITING_RESPONSE_FIX_LABEL = "Record the response";

/** R-S279-3: both facts and the fix, in the words every surface shows. */
export function leaseWaitingCheck(check: OutreachCheck): LeaseWaitingCheck {
  const who = WHO[check.audience];
  const day = outreachDate(check.evidenceAtMs);
  const response = check.subject === "response";
  const staffRecord = `The staff record says ${check.staffFact}.`;
  const evidence = response
    ? `${who.charAt(0).toUpperCase()}${who.slice(1)} replied on ${day}.`
    : `The app's records show the ${check.audience} message accepted by Gmail on ${day}.`;
  const fix = response
    ? {
        label: LEASE_WAITING_RESPONSE_FIX_LABEL,
        target: `renewal-manual-${check.audience}_response`,
      }
    : OUTREACH_FIX[check.audience];
  return {
    audience: check.audience,
    subject: check.subject,
    staffRecord,
    evidence,
    fix,
    sentence: `${staffRecord} ${evidence} ${fix.label}.`,
  };
}

/**
 * The one disagreement the lease shows: the current step's audience first, else the first one the
 * evidence fill found. Null when the staff record and the evidence agree.
 */
export function currentOutreachCheck(
  fill: OutreachFill | null | undefined,
  lane: Lane | null | undefined,
): OutreachCheck | null {
  const checks = fill?.checks ?? [];
  const audience = laneAudience(lane);
  return (
    (audience ? checks.find((entry) => entry.audience === audience) : undefined) ??
    checks[0] ??
    null
  );
}

/**
 * ARCH-S279-1 / ARCH-S279-2: the waiting projection from the cycle's evidence, the staff lane read
 * against it and the evidence fill's checks. The same inputs give the same output for any viewer.
 */
export function projectLeaseWaiting(input: {
  readonly evidence: OutreachEvidence;
  readonly fill: OutreachFill | null;
  readonly lane: Lane | null;
}): LeaseWaiting {
  const { evidence, fill, lane } = input;
  if (!evidence.readable)
    return {
      version: LEASE_WAITING_VERSION,
      readable: false,
      cycleId: evidence.cycleId,
      audience: null,
      party: null,
      sinceIso: null,
      lastContactIso: null,
      check: null,
    };
  const contact = (audience: OutreachAudience) =>
    evidence[audience] ? audienceContact(evidence[audience]) : UNKNOWN_CONTACT;
  const audience = laneAudience(lane);
  const party: LeaseWaitingParty | null =
    !lane || lane.complete
      ? null
      : lane.waitingParty === "staff"
        ? "team"
        : lane.waitingParty;
  const lastContactIso = audience
    ? contact(audience).lastContactIso
    : msIso(
        latestMs(
          (["owner", "tenant"] as const).map((entry) => {
            const iso = contact(entry).lastContactIso;
            return iso ? Date.parse(iso) : null;
          }),
        ),
      );
  const chosen = currentOutreachCheck(fill, lane);
  return {
    version: LEASE_WAITING_VERSION,
    readable: true,
    cycleId: evidence.cycleId,
    audience,
    party,
    sinceIso: party === "owner" || party === "tenant" ? contact(party).sinceIso : null,
    lastContactIso,
    check: chosen ? leaseWaitingCheck(chosen) : null,
  };
}

/**
 * The projection for one lease from its staff record and its evidence read, computed exactly as
 * the stage projection computes it: a lease with no work record yet reads as an empty record on no
 * cycle once the app holds a message for it. Nothing is saved by reading it.
 */
export function leaseWaitingFor(
  recordedState: RenewalWorkspaceState | null,
  outreach: LeaseOutreachEvidenceInput | null | undefined,
  options: {
    readonly leaseId: string;
    /** The lease's current cycle date, which places a message that named no cycle. */
    readonly cycleDateIso?: string | null;
    readonly standingOwnerAuthority?: boolean;
    readonly housingAssistance?: { readonly program: string } | null;
  },
): LeaseWaiting {
  const evidence = projectOutreachEvidence(
    outreach ?? null,
    outreachScopeFor(recordedState, options.cycleDateIso ?? null),
  );
  const state =
    recordedState ??
    (evidence.owner.state !== "none" || evidence.tenant.state !== "none"
      ? emptyRenewalWorkspace(options.leaseId, NO_WORK_RECORD_CYCLE, {
          kind: "lease_bound",
          source: "No work record yet",
        })
      : null);
  const fill = outreachFill(state, evidence);
  const lane = manualRenewalSummary(state, {
    standingOwnerAuthority: options.standingOwnerAuthority === true,
    evidence: fill,
    housingAssistance: options.housingAssistance ?? null,
  });
  return projectLeaseWaiting({ evidence, fill, lane });
}

/** The waiting party in the words the card and the lease status read. */
export function leaseWaitingPartyWords(party: LeaseWaitingParty): string {
  return party === "team" ? "the PMI KC team" : WHO[party];
}
