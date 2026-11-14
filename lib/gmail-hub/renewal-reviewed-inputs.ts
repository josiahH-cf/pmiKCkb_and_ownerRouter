// S274 ARCH-S274-3: the labelled inputs a renewal message review displays, from the same read the
// material source hash binds (`lib/gmail-hub/sequence-dependencies.ts`, renewalTarget). The
// review shows them; a refusal at confirm and a hold at the due time name each one that differs,
// with both values. Values are only the ones the reviewing actor already reads on the lease: the
// recipients, the sender signature, the content values the message states and its holds.
//
// The material identity is unchanged: these inputs are not hashed into the reviewed target hash.
// A value with no plain words (the offer snapshot, the notice identity, the retirement status)
// carries a digest so its change is named without values.

import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  MESSAGE_CHARGES,
  ownerCopyStatesTerm,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import type { SenderSignatureEvidence } from "@/lib/lease-renewal/sender-signature-choice";
import type { RenewalNoticeMaterialIdentity } from "./renewal-material-source";
import {
  NEW_HOLD_KEY_PREFIX,
  NEW_HOLD_LABEL,
  REVIEWED_INPUT_LIMIT,
  formatReviewedDate,
  formatReviewedMoney,
  reviewedInput,
  type ReviewedInput,
} from "./reviewed-inputs";

/** The labels staff read for each reviewed input, in the review's order. */
export const REVIEWED_INPUT_LABELS = {
  to: "To",
  cc: "Cc",
  signature: "Sender signature",
  address: "Property address",
  template: "Approved template",
  ownerIntent: "Owner question",
  currentRent: "Current base rent",
  rentToRecommend: "Rent to recommend",
  range: "Comparable rent range",
  leaseEnd: "Lease end date",
  renewalRent: "Renewal rent",
  renewalStart: "Renewal start date",
  renewalEnd: "Renewal end date",
  insuranceTransition: "Insurance transition",
  offer: "Offer charges and mappings",
  notice: "Notice status",
  retirement: "Retirement status",
} as const;

interface SignatureFields {
  readonly name: string;
  readonly role: string | null;
  readonly phone: string | null;
  readonly hours: string | null;
  readonly website: { readonly url: string } | null;
}

function signatureText(
  signature: SignatureFields | null | undefined,
  setup: SenderSignatureEvidence | null | undefined,
): string {
  if (!setup && !signature) return "Not set up";
  if (setup?.choice === "blank" || !signature) return "Blank signature";
  const text = [
    signature.name,
    signature.role,
    signature.phone,
    signature.hours,
    signature.website?.url ?? null,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return text || "Blank signature";
}

function chargeValue(charge: RenewalMessageFacts["charges"][number]): string | null {
  const parts = [
    formatReviewedMoney(charge.amount),
    charge.cadence === "monthly"
      ? "per month"
      : charge.cadence === "one_time"
        ? "one time"
        : null,
    charge.effectiveDate ? `effective ${formatReviewedDate(charge.effectiveDate)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * S274 ARCH-S274-3: the inputs one renewal target displays, in display order. A linked reply
 * states no lease content, so it lists the recipients, the signature, the notice and retirement
 * status and its holds only.
 */
export function renewalReviewedInputs(input: {
  readonly channel: "owner" | "tenant";
  readonly reply: boolean;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly signature: SignatureFields | null | undefined;
  readonly signatureSetup: SenderSignatureEvidence | null | undefined;
  readonly facts: RenewalMessageFacts;
  readonly publication: { readonly name: string; readonly contentHash: string } | null;
  readonly offerSnapshotHash: string | null;
  readonly notice: RenewalNoticeMaterialIdentity | null;
  readonly dispositionRevision: number | null;
  readonly blockers: readonly string[];
}): ReviewedInput[] {
  const L = REVIEWED_INPUT_LABELS;
  const f = input.facts;
  const inputs: ReviewedInput[] = [
    reviewedInput("to", L.to, input.to.join(", ") || null),
    reviewedInput("cc", L.cc, input.cc.join(", ") || null),
    reviewedInput(
      "signature",
      L.signature,
      signatureText(input.signature, input.signatureSetup),
      input.signatureSetup ? hashExecutionPreview({ ...input.signatureSetup }) : "none",
    ),
  ];
  if (!input.reply) {
    inputs.push(
      reviewedInput("address", L.address, f.address),
      reviewedInput(
        "template",
        L.template,
        input.publication?.name ?? null,
        input.publication?.contentHash ?? "none",
      ),
    );
    if (input.channel === "owner") {
      inputs.push(
        reviewedInput(
          "ownerIntent",
          L.ownerIntent,
          f.ownerIntent === "renew_or_not" ? "Renew or not" : "Recommend a rent",
        ),
      );
      if (f.ownerIntent !== "renew_or_not")
        inputs.push(
          reviewedInput(
            "currentRent",
            L.currentRent,
            formatReviewedMoney(f.currentBaseRent?.value),
          ),
          reviewedInput(
            "rentToRecommend",
            L.rentToRecommend,
            formatReviewedMoney(f.suggestedRent?.value),
          ),
          reviewedInput(
            "range",
            L.range,
            f.range
              ? `${formatReviewedMoney(f.range.low)} to ${formatReviewedMoney(f.range.high)}`
              : null,
          ),
        );
      // S285 R-S285-3: under owner copy that states the term, the renewal dates the message states
      // are reviewed values too, so a later date change is named. Under v2.0 nothing is added.
      if (f.ownerIntent !== "renew_or_not" && ownerCopyStatesTerm(f.ownerCopyVersion))
        inputs.push(
          reviewedInput(
            "renewalStart",
            L.renewalStart,
            formatReviewedDate(f.ownerTerms?.effectiveDate),
          ),
          reviewedInput(
            "renewalEnd",
            L.renewalEnd,
            formatReviewedDate(f.ownerTerms?.endDate),
          ),
        );
    } else {
      inputs.push(
        reviewedInput("leaseEnd", L.leaseEnd, formatReviewedDate(f.leaseEndDate)),
        reviewedInput(
          "renewalRent",
          L.renewalRent,
          formatReviewedMoney(f.ownerTerms?.rent),
        ),
        reviewedInput(
          "renewalStart",
          L.renewalStart,
          formatReviewedDate(f.ownerTerms?.effectiveDate),
        ),
        reviewedInput(
          "renewalEnd",
          L.renewalEnd,
          formatReviewedDate(f.ownerTerms?.endDate),
        ),
      );
      for (const charge of f.charges)
        if (charge.applicable === true)
          inputs.push(
            reviewedInput(
              `charge:${charge.id}`,
              MESSAGE_CHARGES[charge.id],
              chargeValue(charge),
            ),
          );
      inputs.push(
        reviewedInput(
          "insuranceTransition",
          L.insuranceTransition,
          f.insuranceTransition === null
            ? null
            : f.insuranceTransition.applicable
              ? "Applies"
              : "Does not apply",
        ),
      );
      if (input.offerSnapshotHash)
        inputs.push(reviewedInput("offer", L.offer, null, input.offerSnapshotHash));
    }
  }
  inputs.push(
    reviewedInput(
      "notice",
      L.notice,
      null,
      input.notice ? hashExecutionPreview({ ...input.notice }) : "none",
    ),
    reviewedInput(
      "retirement",
      L.retirement,
      null,
      input.dispositionRevision === null
        ? "unavailable"
        : `revision-${input.dispositionRevision}`,
    ),
  );
  // Each hold by its text, so a hold the review did not show is named as new.
  for (const blocker of input.blockers)
    inputs.push(
      reviewedInput(
        `${NEW_HOLD_KEY_PREFIX}${hashExecutionPreview({ blocker })}`,
        NEW_HOLD_LABEL,
        blocker.slice(0, 2_000),
      ),
    );
  return inputs.slice(0, REVIEWED_INPUT_LIMIT);
}
