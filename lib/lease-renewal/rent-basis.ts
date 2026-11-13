// S277 R-S277-2 / R-S277-6 (ARCH-S277-2): the ONE basis projection of a renewal rent. It turns a
// stored working entry (its origin, source label, recorder, and an owner approval or an offer
// adoption) into the short phrase every surface shows after the amount: "from Example Standing
// Agreement", "suggested from the stored comparison", "entered by staff", "approved by the owner
// on 11/12/2026" or "adopted for the offer by staff". The longer recommendation line also names
// who saved it. No surface composes its own phrase. The settled labels (Rent to recommend, Amount
// approved, Offer amount, Renewal base rent, Working renewal rent, Final working terms and Current
// base rent) stay as they are; the phrase follows them. Pure and client-safe: reading writes
// nothing and infers no value.

import { formatCalendarDate } from "@/lib/date-display";
import { businessDateIso } from "./business-calendar";
import { adoptedStandingRule } from "./standing-agreement";
import type { WorkingFieldEntry } from "./working-record";

export type RentBasisKind =
  | "agreement"
  | "comparison"
  | "policy"
  | "source"
  | "staff"
  | "owner_approval"
  | "offer_adoption";

export interface RentBasis {
  readonly kind: RentBasisKind;
  /** The short phrase every surface shows after the amount. */
  readonly phrase: string;
  /** Who saved the value: the staff label, or the monthly preparation. */
  readonly savedBy: string;
  /** True when the monthly preparation saved the value (S249). */
  readonly savedByPreparation: boolean;
  /** The Central business date the value was saved, as MM/DD/YYYY; null when unreadable. */
  readonly savedOn: string | null;
  /** The comparison's comparable count, when the basis names one. */
  readonly comparables: number | null;
  /** The standing agreement's name, when the value was adopted from one. */
  readonly agreementName: string | null;
}

/** The exact words of the basis phrases. */
export const RENT_BASIS_WORDS = {
  comparison: "suggested from the stored comparison",
  staff: "entered by staff",
  offerAdoption: "adopted for the offer by staff",
  ownerApproval: "approved by the owner",
  preparation: "monthly preparation",
  notSaved: "not saved yet",
  agreementGives: "the agreement gives",
} as const;

/** "$1,751.00": every basis line shows the amount with its cents. */
export function formatRentAmount(amount: number): string {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function savedOnDate(recordedAt: string): string | null {
  try {
    return formatCalendarDate(businessDateIso(recordedAt));
  } catch {
    return null;
  }
}

const STANDING_SOURCE = /^Standing agreement (.+), rule v\d+$/;

/** The agreement name a standing-rule source label carries, or null for any other label. */
export function agreementNameFromSourceLabel(label: string | undefined): string | null {
  const match = label?.match(STANDING_SOURCE);
  return match ? match[1]!.trim() : null;
}

function comparisonSource(entry: Pick<WorkingFieldEntry, "sourceLabel" | "context">) {
  const label = entry.sourceLabel ?? "";
  return (
    /stored (market )?comparison|comparable/i.test(label) ||
    /Suggested from the stored comparison/i.test(entry.context ?? "")
  );
}

/** S249: the monthly preparation stamps the cycle it saved the rent for in the entry's context. */
function savedByPreparation(entry: Pick<WorkingFieldEntry, "origin" | "context">) {
  if (entry.origin !== "adopted_source" || !entry.context) return false;
  try {
    const parsed = JSON.parse(entry.context) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as { cycleDateIso?: unknown }).cycleDateIso === "string" &&
      typeof (parsed as { cycleId?: unknown }).cycleId === "string"
    )
      return true;
  } catch {
    // The standing-rule form names the cycle in its basis text.
  }
  return /\bCycle \d{4}-\d{2}-\d{2} \(/.test(entry.context);
}

function comparableCount(text: string | undefined): number | null {
  const match = text?.match(/Median of (\d+) comparable/i);
  return match ? Number(match[1]) : null;
}

function lowerFirst(text: string): string {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

/**
 * ARCH-S277-2: the basis of one stored working rent entry, or null when the entry holds no amount.
 * The owner's answer and the offer adoption come first (they are what set the base); then the
 * standing agreement, the stored comparison, a pricing policy or another adopted source; anything
 * else was typed by staff.
 */
export function rentBasisOf(
  entry: WorkingFieldEntry | null | undefined,
): RentBasis | null {
  if (!entry || typeof entry.value !== "number") return null;
  const preparation = savedByPreparation(entry);
  const common = {
    savedBy: preparation ? RENT_BASIS_WORDS.preparation : entry.recordedByLabel,
    savedByPreparation: preparation,
    savedOn: savedOnDate(entry.recordedAt),
    comparables: null as number | null,
    agreementName: null as string | null,
  };
  if (entry.basis?.kind === "owner_approval")
    return {
      ...common,
      kind: "owner_approval",
      phrase: common.savedOn
        ? `${RENT_BASIS_WORDS.ownerApproval} on ${common.savedOn}`
        : RENT_BASIS_WORDS.ownerApproval,
    };
  if (entry.basis?.kind === "recommendation")
    return { ...common, kind: "offer_adoption", phrase: RENT_BASIS_WORDS.offerAdoption };
  if (entry.origin === "adopted_source") {
    if (adoptedStandingRule(entry)) {
      const name =
        agreementNameFromSourceLabel(entry.sourceLabel) ?? "the standing agreement";
      return {
        ...common,
        kind: "agreement",
        phrase: `from ${name}`,
        agreementName: name === "the standing agreement" ? null : name,
      };
    }
    if (comparisonSource(entry))
      return {
        ...common,
        kind: "comparison",
        phrase: RENT_BASIS_WORDS.comparison,
        comparables: comparableCount(entry.context),
      };
    if (entry.sourceLabel?.startsWith("Pricing policy"))
      return {
        ...common,
        kind: "policy",
        phrase: `from ${lowerFirst(entry.sourceLabel)}`,
      };
    return {
      ...common,
      kind: "source",
      phrase: `from ${entry.sourceLabel ? entry.sourceLabel : "the adopted source"}`,
    };
  }
  return { ...common, kind: "staff", phrase: RENT_BASIS_WORDS.staff };
}

/** The short phrase alone, or null when the entry holds no amount. */
export function rentBasisPhrase(
  entry: WorkingFieldEntry | null | undefined,
): string | null {
  return rentBasisOf(entry)?.phrase ?? null;
}

/** The phrase as a sentence of its own: "Approved by the owner on 11/12/2026." */
export function rentBasisSentence(phrase: string): string {
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`;
}

export interface WorkingBaseWords {
  /** "$1,760.00" */
  readonly amount: string;
  /** "entered by staff" */
  readonly phrase: string;
  /** "the agreement gives $1,751.00" when a standing agreement's rule gives another amount. */
  readonly agreement: string | null;
  /** "entered by staff; the agreement gives $1,751.00" */
  readonly basis: string;
  /** "$1,760.00 entered by staff; the agreement gives $1,751.00." */
  readonly sentence: string;
}

/**
 * R-S277-2 / BEH-S277-2: the working renewal base with its basis. A typed or other amount on a
 * lease whose standing agreement gives a different amount names that amount too.
 */
export function workingBaseWords(input: {
  readonly entry: WorkingFieldEntry | null | undefined;
  /** The amount the applied standing agreement's rule gives, when one applies to the lease. */
  readonly agreementAmount?: number | null;
}): WorkingBaseWords | null {
  const basis = rentBasisOf(input.entry);
  if (!basis || typeof input.entry?.value !== "number") return null;
  const value = input.entry.value;
  const agreementAmount = input.agreementAmount ?? null;
  const agreement =
    basis.kind !== "agreement" &&
    agreementAmount !== null &&
    Math.abs(agreementAmount - value) >= 0.005
      ? `${RENT_BASIS_WORDS.agreementGives} ${formatRentAmount(agreementAmount)}`
      : null;
  const text = agreement ? `${basis.phrase}; ${agreement}` : basis.phrase;
  const amount = formatRentAmount(value);
  return {
    amount,
    phrase: basis.phrase,
    agreement,
    basis: text,
    sentence: `${amount} ${text}.`,
  };
}

/** A suggestion that was computed on read and not saved, as the preparation projection holds it. */
export interface UnsavedRentProposal {
  readonly value: number | null;
  readonly origin: "agreement" | "comparison" | "typed" | null;
  readonly basis: string;
}

/**
 * R-S277-6: the recommendation line the owner message review and the Ask the owner facts show:
 * "Rent to recommend $1,500.00: suggested from the stored comparison (median of 5), saved by
 * monthly preparation on 11/12/2026", or "entered by {staff name} on {date}". A suggestion nobody
 * saved says so. Null when there is no amount to describe.
 */
export function recommendationBasisLine(input: {
  /** The current recommendation's stored entry (shared or its own fact), or null. */
  readonly entry: WorkingFieldEntry | null | undefined;
  /** The suggestion computed on read, used only when nothing is saved. */
  readonly proposal?: UnsavedRentProposal | null;
  /** The covering agreement's name, for an unsaved agreement amount. */
  readonly agreementName?: string | null;
}): string | null {
  const label = "Rent to recommend";
  const basis = rentBasisOf(input.entry);
  if (basis && typeof input.entry?.value === "number") {
    const amount = formatRentAmount(input.entry.value);
    const on = basis.savedOn ? ` on ${basis.savedOn}` : "";
    if (basis.kind === "staff")
      return `${label} ${amount}: entered by ${basis.savedBy}${on}`;
    const comparables =
      basis.comparables !== null ? ` (median of ${basis.comparables})` : "";
    return `${label} ${amount}: ${basis.phrase}${comparables}, saved by ${basis.savedBy}${on}`;
  }
  const proposal = input.proposal;
  if (!proposal || proposal.value === null || proposal.origin === "typed") return null;
  const amount = formatRentAmount(proposal.value);
  if (proposal.origin === "agreement")
    return `${label} ${amount}: from ${input.agreementName ?? "the standing agreement"}, ${RENT_BASIS_WORDS.notSaved}`;
  if (proposal.origin === "comparison") {
    const count = comparableCount(proposal.basis);
    return `${label} ${amount}: ${RENT_BASIS_WORDS.comparison}${count !== null ? ` (median of ${count})` : ""}, ${RENT_BASIS_WORDS.notSaved}`;
  }
  return null;
}

/**
 * R-S277-2 on the desk: the short phrase for the desk's Rent to recommend, read from the
 * preparation projection's rent view (the desk holds no working entry). A saved adoption names
 * its recorded source; a typed amount reads as entered by staff.
 */
export function rentViewBasisPhrase(
  view: { readonly origin: string | null; readonly basis: string } | null | undefined,
  agreementName?: string | null,
): string | null {
  if (!view?.origin) return null;
  if (view.origin === "agreement")
    return `from ${agreementName ?? "the standing agreement"}`;
  if (view.origin === "comparison") return RENT_BASIS_WORDS.comparison;
  if (view.origin !== "typed") return null;
  const saved = view.basis.match(/^Saved working rent from (.+?)\. Later proposals/);
  if (!saved) return RENT_BASIS_WORDS.staff;
  const label = saved[1]!;
  const name = agreementNameFromSourceLabel(label);
  if (name) return `from ${name}`;
  if (/stored (market )?comparison|comparable/i.test(label))
    return RENT_BASIS_WORDS.comparison;
  if (label.startsWith("Pricing policy")) return `from ${lowerFirst(label)}`;
  return `from ${label}`;
}
