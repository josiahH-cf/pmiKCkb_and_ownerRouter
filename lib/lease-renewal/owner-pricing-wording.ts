// S261 R-S261-2 / ARCH-S261-2: owner pricing wording stays bound to the base and the recommendation
// it was calculated from. S161 keeps staff-authored wording exactly as written when the composed
// facts change. When that wording still states a different current base rent or rent suggestion in
// the approved sentences, it needs a staff review before the current exact review: the person edits
// that sentence or returns to the standard wording. A reviewed case-specific amount in other wording
// (for example a separate pet charge) is not a base and asks for nothing. Pure and client-safe.

import { SUPPLIED_RENEWAL_COPY } from "@/lib/lease-renewal/renewal-message-content";

const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;

function sentencePattern(template: string, field: string): RegExp {
  const [before, after] = template.split(`{{${field}}}`) as [string, string];
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `${escape(before.trim())}\\s*${MONEY}\\s*${escape(after.trim())}`,
    "g",
  );
}

const BASE_SENTENCE = sentencePattern(
  SUPPLIED_RENEWAL_COPY.owner.currentRent,
  "current_base_rent",
);
const SUGGESTION_SENTENCE = sentencePattern(
  SUPPLIED_RENEWAL_COPY.owner.suggestion,
  "suggested_rent",
);

function statedAmounts(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((match) =>
    Number((match[1] ?? "").replace(/,/g, "")),
  );
}

const money = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

const same = (left: number, right: number) => Math.abs(left - right) < 0.005;

/**
 * The reason saved owner wording needs a staff review before the current exact review, or null
 * when every base and suggestion it states matches the current ones.
 */
export function ownerPricingWordingReview(input: {
  /** The wording as it would be sent (the authored body in effect). */
  readonly text: string;
  /** The verified current base rent; null while it needs verification. */
  readonly currentBase: number | null;
  /** The rent to recommend the current message carries; null when it carries none. */
  readonly recommendation: number | null;
}): string | null {
  const reasons: string[] = [];
  const bases = statedAmounts(input.text, BASE_SENTENCE);
  const differentBase = bases.find(
    (amount) => input.currentBase === null || !same(amount, input.currentBase),
  );
  if (differentBase !== undefined)
    reasons.push(
      input.currentBase === null
        ? `Your saved wording states a current rent of ${money(differentBase)}, and the current base rent needs verification. Verify the base rent, then update that sentence or return to the standard wording before the owner review.`
        : `Your saved wording states a current rent of ${money(differentBase)}, and the current base rent is ${money(input.currentBase)}. Update that sentence or return to the standard wording before the owner review.`,
    );
  const suggestions = statedAmounts(input.text, SUGGESTION_SENTENCE);
  const differentSuggestion = suggestions.find(
    (amount) => input.recommendation === null || !same(amount, input.recommendation),
  );
  if (differentSuggestion !== undefined && input.recommendation !== null)
    reasons.push(
      `Your saved wording suggests ${money(differentSuggestion)}, and Rent to recommend is ${money(input.recommendation)}. Update that sentence or return to the standard wording before the owner review.`,
    );
  return reasons.length ? reasons.join(" ") : null;
}
