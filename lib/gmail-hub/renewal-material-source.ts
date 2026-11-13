// S248 L39: the notice part of a renewal message's material source hash.
//
// A scheduled or approved renewal message is bound to the material facts it was reviewed on. The
// worker compares that hash again before it sends and pauses the message when a material fact
// changed (`lib/gmail-hub/sequence-service.ts`, "changed_source").
//
// The notice safety marker's `version` is an admission generation: every provider source read
// anywhere in the portfolio raises it on every lease's marker before the read starts
// (`withRenewalNoticeAdmission`), and the settled observation keeps the raised number. It says a
// read happened, never that this lease's notice evidence changed, so it is not a material value.
// The notice's material identity is its scope (lease, tenancy and work record cycle) and its
// semantic hash: the provider disposition, the verified tenancy and the staff review history
// revision. That identity still changes, and still pauses the message, when a notice is observed,
// when a recorded notice is withdrawn or reviewed and when settled source generations conflict.
// Dispatch also refuses separately on any notice block, which is part of the hash through the
// target's blockers.
//
// S274 R-S274-4 replaces the earlier pause for an admitted read in flight. An observation made on a
// generation that a newer admitted read already superseded (the marker is pending that read) is
// not settled, so it is never compared: confirm joins the read and reads again within its bound,
// and the worker neither claims, sends nor pauses, records that it waited and checks again on its
// next run. Only a settled read that differs pauses the message.
//
// The marker, its admission and its version semantics are unchanged; approval invalidation that
// reads the full basis keeps reading it. Pure.

import type { NoticeSafetyBasis } from "@/lib/lease-renewal/notice-safety";

export interface RenewalNoticeMaterialIdentity {
  readonly scopeHash: string;
  readonly semanticHash: string;
}

/** The notice facts a renewal message's material source hash binds; never the admission version. */
export function renewalNoticeMaterialIdentity(
  basis: NoticeSafetyBasis | null | undefined,
): RenewalNoticeMaterialIdentity | null {
  return basis ? { scopeHash: basis.scopeHash, semanticHash: basis.semanticHash } : null;
}
