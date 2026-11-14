// S285 (ARCH-S285-2, ARCH-S285-3): the owner copy version in use and the owner answer's defaults,
// as pure projections. Client-safe: labels, versions and comparisons only; no address leaves the
// server through this module.
//
// - R-S285-6: the owner copy is a versioned set (v2.0, v2.1) with one publication record per
//   version. The copy in use is the newest version whose publication reads back approved. Only the
//   owner message that recommends a rent moves to v2.1; the renew-or-not variant keeps v2.0.
// - R-S285-3: under a version that states the term, the saved working dates join the owner
//   message's reviewed content basis. Under v2.0 the content basis is exactly what it was, so an
//   owner message authorized before this suite keeps its digest and still dispatches as reviewed.
// - R-S285-4: the coverage the owner answer opens on, from the cycle's latest confirmed owner
//   message and the saved working dates. Nothing is stored until staff save the answer.
// - R-S285-5: the owner selected as the approver, from the reply's own evidence and the roster.

import {
  ownerCopyStatesTerm,
  type OwnerCopyVersion,
} from "@/lib/lease-renewal/renewal-message-content";

// ---- R-S285-6: the version in use ----------------------------------------------------------------

/** The publication record name of each owner copy version, in the existing template store. */
export const OWNER_COPY_PUBLICATION_NAMES: Readonly<Record<OwnerCopyVersion, string>> =
  Object.freeze({
    "v2.0": "Renewal owner — supplied September 10 2026 v2.0",
    "v2.1": "Renewal owner — rent and term ask November 12 2026 v2.1",
  });

/**
 * R-S285-6: the owner copy version an owner message is composed under. The newest version whose
 * publication reads back approved, for the message that recommends a rent; v2.0 for the
 * renew-or-not variant, whose wording no version changes.
 */
export function ownerCopyVersionInUse(input: {
  readonly v21Approved: boolean;
  readonly ownerIntent: "recommend_rent" | "renew_or_not" | undefined;
}): OwnerCopyVersion {
  return input.v21Approved && input.ownerIntent !== "renew_or_not" ? "v2.1" : "v2.0";
}

/** R-S285-6: the one line an approver reads while v2.1 is ready and not yet published. */
export const OWNER_WORDING_READY_LINE =
  "New owner wording that asks about the term is ready to publish.";
export const OWNER_WORDING_REVIEW_LABEL = "Review the new owner wording";
export const OWNER_WORDING_PUBLISH_LABEL = "Publish the new owner wording";
export const OWNER_WORDING_KEEP_LABEL = "Keep the current wording";
export const OWNER_WORDING_PUBLISHED_LINE =
  "The new owner wording is published. Owner messages now state the renewal term.";

/**
 * R-S285-6: what publishing does, stated before it publishes, with the count of unsent owner
 * messages that were reviewed with the current wording and will be held for review.
 */
export function ownerWordingPublishConsequence(heldCount: number): string {
  const lead = "Publishing changes the owner message.";
  if (heldCount <= 0)
    return `${lead} No unsent owner message was reviewed with the current wording, so none will be held for review.`;
  return heldCount === 1
    ? `${lead} 1 unsent owner message was reviewed with the current wording and will be held for review.`
    : `${lead} ${heldCount} unsent owner messages were reviewed with the current wording and will be held for review.`;
}

/** R-S285-6 (S274): the cause a hold names when the owner message wording version changed. */
export const OWNER_WORDING_UPDATED_LINE = "The owner message wording was updated";

/** The reviewed-input key of the approved template (S274 `REVIEWED_INPUT_LABELS.template`). */
const TEMPLATE_INPUT_KEY = "template";
const OWNER_TEMPLATE_PREFIX = "Renewal owner";

/**
 * R-S285-6: a changed reviewed input that is the owner copy's publication: the approved template
 * of an owner message, before and after. Its line reads "The owner message wording was updated".
 */
export function isOwnerWordingChange(change: {
  readonly key: string;
  readonly previous?: string | null;
  readonly current: string | null;
}): boolean {
  return (
    change.key === TEMPLATE_INPUT_KEY &&
    typeof change.current === "string" &&
    change.current.startsWith(OWNER_TEMPLATE_PREFIX) &&
    (change.previous === undefined ||
      change.previous === null ||
      change.previous.startsWith(OWNER_TEMPLATE_PREFIX))
  );
}

/** The reviewed-input keys the owner message adds when its copy states the term. */
export const OWNER_TERM_INPUT_KEYS = ["renewalStart", "renewalEnd"] as const;

// ---- R-S285-3: the dates in the content basis ----------------------------------------------------

/**
 * R-S285-3 (ARCH-S285-2): the members an owner message's content basis adds for its stated term.
 * Empty under a version that states no term, so a v2.0 content basis and its digest are
 * unchanged.
 */
export function ownerTermContentBasis(
  version: OwnerCopyVersion | null | undefined,
  terms: {
    readonly effectiveDate: string | null;
    readonly endDate: string | null;
  } | null,
): { term?: { start: string | null; end: string | null } } {
  if (!ownerCopyStatesTerm(version)) return {};
  return { term: { start: terms?.effectiveDate ?? null, end: terms?.endDate ?? null } };
}

// ---- R-S285-4: the coverage the answer opens on -----------------------------------------------

/** The term a confirmed owner message stated, as ISO dates. */
export interface StatedOwnerTerm {
  readonly start: string;
  readonly end: string;
}

function isoFromReviewedDate(value: string | null | undefined): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

/**
 * R-S285-4: the term an authorized owner message stated, from the labelled values kept with its
 * authorization (S272 R-S272-1): its renewal start and end, present only when it was composed
 * under a version that states the term. Null for a message that stated no term.
 */
export function statedTermFromReviewedValues(
  values:
    | ReadonlyArray<{ readonly key: string; readonly value: string | null }>
    | null
    | undefined,
): StatedOwnerTerm | null {
  if (!values) return null;
  const start = isoFromReviewedDate(
    values.find((input) => input.key === "renewalStart")?.value,
  );
  const end = isoFromReviewedDate(
    values.find((input) => input.key === "renewalEnd")?.value,
  );
  return start && end && end > start ? { start, end } : null;
}

export const OWNER_ANSWER_MESSAGE_ASKED_LINE =
  "The message asked about the rent and these dates.";
export const OWNER_ANSWER_DATES_CHANGED_LINE =
  "The renewal dates changed after the owner message was sent.";

export type OwnerAnswerCoverageDefault =
  | { readonly scope: "exact_terms"; readonly reason: "message_asked" }
  | {
      readonly scope: "amount_only";
      readonly reason: "no_term_stated" | "dates_changed" | "dates_not_saved";
    };

/**
 * R-S285-4 (ARCH-S285-3): the coverage the answer opens on. "Base rent and the renewal dates"
 * when the cycle's latest confirmed owner message stated the term and the saved working dates
 * still equal the stated dates; otherwise "Base rent only", with the reason when the dates changed
 * after that message. A projection: staff choose either, and only their save stores it.
 */
export function ownerAnswerCoverageDefault(input: {
  readonly statedTerm: StatedOwnerTerm | null | undefined;
  readonly workingDates: { readonly start: string; readonly end: string } | null;
}): OwnerAnswerCoverageDefault {
  if (!input.statedTerm) return { scope: "amount_only", reason: "no_term_stated" };
  if (!input.workingDates) return { scope: "amount_only", reason: "dates_not_saved" };
  return input.workingDates.start === input.statedTerm.start &&
    input.workingDates.end === input.statedTerm.end
    ? { scope: "exact_terms", reason: "message_asked" }
    : { scope: "amount_only", reason: "dates_changed" };
}

// ---- R-S285-5: the owner who replied --------------------------------------------------------------

export const OWNER_APPROVER_SELECTED_LINE =
  "Selected because this reply came from the address the owner message was sent to.";

/** One owner of record with the address the current source read gives it (server only). */
export interface RosterOwnerAddress {
  readonly label: string;
  readonly sourceRef: string;
  readonly email: string | null;
}

/**
 * R-S285-5 (ARCH-S285-3): the roster owner selected for a reply, or null. Selected only when the
 * reply is a person's reply (not an automatic reply or a bounce), it came from the address the
 * owner message was sent to, and exactly one owner on the current roster has that address.
 * Nothing is selected when two roster owners share it, the sender matches no roster owner, or the
 * roster is unreadable. Only the matching roster entry is returned, never an address.
 */
export function matchReplyApprover(input: {
  readonly kind: string;
  /** The reply came from an address the owner message was sent to; null when not known. */
  readonly fromSentTo: boolean | null;
  /** The address(es) the owner message was sent to (its To). */
  readonly sentTo: readonly string[];
  readonly roster: readonly RosterOwnerAddress[] | null;
}): { readonly label: string; readonly sourceRef: string } | null {
  if (input.kind !== "human" || input.fromSentTo !== true || !input.roster) return null;
  const sentTo = [
    ...new Set(input.sentTo.map((value) => value.trim().toLowerCase())),
  ].filter(Boolean);
  if (sentTo.length !== 1) return null;
  const matches = input.roster.filter(
    (owner) => owner.email && owner.email.trim().toLowerCase() === sentTo[0],
  );
  if (matches.length !== 1) return null;
  return { label: matches[0].label, sourceRef: matches[0].sourceRef };
}
