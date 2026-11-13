"use client";

// S277 R-S277-2 / R-S277-6 (ARCH-S277-2): the basis of the renewal rent wherever it appears, read
// from the one basis projection (lib/lease-renewal/rent-basis.ts). Each surface keeps its settled
// label (Renewal base rent, Offer amount, Working renewal rent, Final working terms, Rent to
// recommend) and adds the phrase the projection gives; none composes its own. Reading saves,
// sends and looks up nothing.
//
// Only `useRenewalWorkingRecord` is read from the working record module, so a test that stands in
// for that module with the hook alone still renders these lines.

import { useRenewalPricingPolicy } from "./RenewalPricingPolicy";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { recommendationFact } from "@/lib/lease-renewal/current-cycle-terms";
import {
  recommendationBasisLine,
  workingBaseWords,
  type UnsavedRentProposal,
  type WorkingBaseWords,
} from "@/lib/lease-renewal/rent-basis";

/** The amount the applied standing agreement's rule gives on this read, or null. */
export function useStandingAgreementAmount(): number | null {
  const authority = useRenewalPricingPolicy()?.view?.authority;
  return authority?.kind === "standing" && typeof authority.amount === "number"
    ? authority.amount
    : null;
}

/**
 * R-S277-2: the working renewal base with its basis, for the current cycle. When `amount` is
 * given, the words are returned only while the stored base equals it, so a surface assembled from
 * an earlier read never borrows another amount's basis.
 */
export function useWorkingBaseWords(amount?: number | null): WorkingBaseWords | null {
  const working = useRenewalWorkingRecord();
  const agreementAmount = useStandingAgreementAmount();
  const entry = working?.record?.fields?.terms_rent ?? null;
  if (!entry || typeof entry.value !== "number") return null;
  if (
    amount !== undefined &&
    (amount === null || Math.abs(amount - entry.value) >= 0.005)
  )
    return null;
  return workingBaseWords({ entry, agreementAmount });
}

/**
 * The basis of the working renewal base as its own short line: "$1,760.00 entered by staff; the
 * agreement gives $1,751.00." Used where the surface already names the amount and its label.
 */
export function WorkingBaseBasisLine({
  amount,
  field = "working-base-basis",
}: Readonly<{ amount?: number | null; field?: string }>) {
  const words = useWorkingBaseWords(amount);
  if (!words) return null;
  return (
    <p className="muted renewal-rent-basis" data-renewal-field={field}>
      {words.sentence}
    </p>
  );
}

/**
 * R-S277-6: the recommendation line for the owner message review and the Ask the owner facts,
 * naming its basis and who saved it. S281 places this line among the Ask the owner facts.
 */
export function RecommendationBasisLine({
  proposal = null,
  agreementName = null,
  field = "recommendation-basis",
}: Readonly<{
  /** The suggestion computed on read, described only while nothing is saved. */
  proposal?: UnsavedRentProposal | null;
  agreementName?: string | null;
  field?: string;
}>) {
  const working = useRenewalWorkingRecord();
  const pricing = useRenewalPricingPolicy();
  const fact = recommendationFact(working?.record ?? null);
  if (fact.kind === "unavailable") return null;
  const line = recommendationBasisLine({
    entry: fact.entry,
    proposal,
    agreementName: agreementName ?? pricing?.view?.authority.label ?? null,
  });
  if (!line) return null;
  return (
    <p className="muted renewal-rent-basis" data-renewal-field={field}>
      {line}.
    </p>
  );
}
