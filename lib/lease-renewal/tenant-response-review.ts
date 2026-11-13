// S276 R-S276-1 (ARCH-S276-1): the tenant response is committed only by one visible Save, after
// staff see which offer it answers and what happens next. Choosing a response saves nothing;
// Cancel, or leaving the form, keeps the earlier response.
//
// The review names: the chosen response; the offer it answers (the working base rent, the renewal
// dates and the selected charges total from the current offer snapshot, or "No offer has been sent
// from the app yet"); and what follows: reminders for this offer stop, then the step the renewal
// path projects for that response. The optional source note stays optional (S156 R-S156-3); no
// attestation or checkbox is added (S156 R-S156-7).
//
// Pure and client-safe.

import { formatCalendarDate } from "@/lib/date-display";
import type { OfferAnswersView, OfferTerms } from "./offer-answers";
import { isRecordedTenantResponse } from "@/lib/gmail-hub/tenant-response-hold";

/** The words of the tenant response review, as rendered. */
export const TENANT_RESPONSE_REVIEW_WORDS = Object.freeze({
  heading: "Review the tenant's response",
  save: "Save",
  cancel: "Cancel",
  noOffer: "No offer has been sent from the app yet",
  offerUnread: "The offer this answers could not be read. Reload to see it.",
  remindersStop: "Reminders for this offer stop.",
  remindersStayStopped:
    "Reminders that were stopped stay stopped until you resume them in Communications.",
  /** R-S276-3: the pause could not be written at save time; the response stays saved. */
  stillScheduled: "Reminders are still scheduled.",
  stopThem: "Stop them",
  stopped:
    "Reminders for this offer are stopped. To send them again, resume them in Communications.",
});

/** The tenant outcomes and their labels, as the Tenant response select shows them. */
export const TENANT_RESPONSE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  awaiting_response: "Awaiting response",
  accepted: "Accepted",
  counter_change_requested: "Counter / change requested",
  declined_nonrenewing: "Declined / not renewing",
  needs_verification: "Needs verification",
});

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "Rent $1,450.00 per month from 01/01/2027 to 12/31/2027. Selected charges: $35.00 in total." */
export function describeOfferTerms(terms: OfferTerms): string {
  const rent =
    terms.rent === null ? "Rent not entered" : `Rent ${USD.format(terms.rent)} per month`;
  const dates =
    terms.effectiveDate || terms.endDate
      ? ` from ${formatCalendarDate(terms.effectiveDate)} to ${formatCalendarDate(terms.endDate)}`
      : "";
  const charges = terms.chargeCount
    ? `Selected charges: ${USD.format(terms.chargesCents / 100)} in total.`
    : "No other charges selected.";
  return `${rent}${dates}. ${charges}`;
}

/**
 * The offer the response answers, in staff words: the current offer snapshot once an offer was
 * sent from the app (the newest sent offer when no current snapshot is read), otherwise "No offer
 * has been sent from the app yet". An earlier server's read without terms names the offer summary.
 */
export function describeAnsweredOffer(
  view: OfferAnswersView | null,
  failed = false,
): string {
  if (!view)
    return failed
      ? TENANT_RESPONSE_REVIEW_WORDS.offerUnread
      : `${TENANT_RESPONSE_REVIEW_WORDS.noOffer}.`;
  const sent = view.candidates.filter(
    (candidate) => candidate.kind === "linked_communication",
  );
  if (!sent.length) return `${TENANT_RESPONSE_REVIEW_WORDS.noOffer}.`;
  const newest = [...sent].sort((left, right) =>
    (right.at ?? "").localeCompare(left.at ?? ""),
  )[0];
  const offer = view.current ?? newest;
  return offer.terms ? describeOfferTerms(offer.terms) : `${offer.summary}.`;
}

/** The imperative next step as a clause: "send the renewal information form". */
function asClause(step: string): string {
  const trimmed = step.trim().replace(/\.$/, "");
  return trimmed ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1) : trimmed;
}

/** What follows saving this response: the reminders sentence, then the projected next step. */
export function describeWhatFollows(outcome: string, nextStep: string | null): string {
  if (!isRecordedTenantResponse(outcome))
    return TENANT_RESPONSE_REVIEW_WORDS.remindersStayStopped;
  const next = nextStep ? asClause(nextStep) : "";
  return next
    ? `${TENANT_RESPONSE_REVIEW_WORDS.remindersStop} Next: ${next}.`
    : TENANT_RESPONSE_REVIEW_WORDS.remindersStop;
}

/** R-S276-1: the three lines of the review, in order. */
export function tenantResponseReview(input: {
  readonly outcome: string;
  readonly view: OfferAnswersView | null;
  readonly viewFailed?: boolean;
  readonly nextStep: string | null;
}): { readonly response: string; readonly answers: string; readonly follows: string } {
  return {
    response: `Response: ${TENANT_RESPONSE_LABELS[input.outcome] ?? input.outcome}.`,
    answers: `Answers: ${describeAnsweredOffer(input.view, input.viewFailed)}`,
    follows: describeWhatFollows(input.outcome, input.nextStep),
  };
}
