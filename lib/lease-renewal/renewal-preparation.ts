// S249 ARCH-S249-1: the ONE preparation projection per lease and cycle. For each kickoff item (the
// numbers check, the stored comparison, the rent to recommend and what the owner message needs to
// be sent) it states ready, or the named missing input with the existing control that fixes it.
// The desk's batch rows, the lease page's Now card and the stage projection read this one
// function over the same facts, so the desk and the lease cannot name different missing inputs.
//
// Pure and client-safe. It reads stored facts only: nothing here looks a comparison up, saves a
// figure, drafts, sends or schedules. A proposal is a proposal: a figure staff typed always wins,
// and nothing here replaces one (AC-S249-5).

import { formatCalendarDate } from "@/lib/date-display";
import { firstUsableComparables } from "@/lib/lease-renewal/comparable-presentation";
import { computeRentSuggestion } from "@/lib/lease-renewal/rent-suggestion";

export const RENEWAL_PREPARATION_VERSION = "renewal-preparation/v1" as const;

/** The exact words the Now card, the desk and the litmus read. */
export const KICKOFF_WORDS = {
  numbersAgree: "Numbers agree",
  allowanceReached: "Comparison not run: monthly allowance reached",
  readyForReview: "Ready for your review",
  rentToRecommend: "Rent to recommend",
  reasonToInclude: "Reason to include",
  reviewAndSend: "Review and send",
  schedule: "Schedule",
  createGmailDraft: "Create Gmail draft instead",
  copy: "Copy",
  draftOlder: "The Gmail draft is older than this message",
  replaceDraft: "Replace the Gmail draft",
  prepareBatch: "Prepare this batch",
  prepareLease: "Prepare this lease",
  useRevision: "Use this revision",
  ownFigures: "Enter your own comparison figures",
  needsAnInput: "Needs an input",
  waitingOrDone: "Waiting or done",
} as const;

/** The control ids a fix opens: each is an existing control on the lease page. */
export const KICKOFF_FIX_TARGETS = {
  correctFact: "renewal-correct-a-fact",
  rentAndCharges: "renewal-rent-and-charges",
  comparison: "renewal-section-comps",
  ownerMessage: "renewal-card-message-owner",
  rentToRecommend: "renewal-now-rent-to-recommend",
  signature: "renewal-now-signature",
  markedValues: "renewal-message-owner-readiness",
} as const;

export interface RenewalPreparationFix {
  readonly label: string;
  /** An existing control on the lease page. */
  readonly target: string;
}

// ---- Facts ----------------------------------------------------------------------------------

/** R-S249-1: what Check the numbers reads. RentVine is the basis for rent and dates (D-OP-7). */
export interface RenewalNumbersFacts {
  /** The RentVine contractual rent (lease detail), or null when RentVine holds none. */
  readonly contractualRent: number | null;
  /** The current RentVine rent-account charge amounts; null when they were not read. */
  readonly rentCharges: readonly number[] | null;
  /** The RentVine lease end. */
  readonly leaseEndIso: string | null;
  /** The staff working current rent, when one is saved. */
  readonly workingRent: number | null;
  /** The operating Sheet's current rent; null for a blank Sheet value. Information only. */
  readonly sheetRent: number | null;
  /** The operating Sheet's renewal date; null for a blank Sheet value. Information only. */
  readonly sheetEndIso: string | null;
  /** False when the RentVine read behind these numbers is incomplete or expired. */
  readonly sourceReadable: boolean;
}

/** One stored comparison for this lease and cycle, as the provider returned it. */
export interface RenewalStoredComparison {
  readonly observationId: string | null;
  readonly observedAtIso: string;
  readonly source: string;
  readonly rangeLow: number;
  readonly rangeHigh: number;
  readonly compCount: number;
  /** The comparables in provider order. */
  readonly comps: readonly {
    readonly rent: number;
    readonly distanceMiles?: number;
    readonly bedrooms?: number;
  }[];
}

/** R-S249-2: the comparison for this lease and cycle. */
export type RenewalComparisonFacts =
  | { readonly state: "stored"; readonly comparison: RenewalStoredComparison }
  /** None stored. `attempted`: this cycle's one claimed lookup already ran (or is running). */
  | { readonly state: "none"; readonly attempted?: boolean }
  /** No lookup ran because this month's allowance is reached (R-S249-3). */
  | { readonly state: "allowance_reached" }
  /** A lookup ran for this cycle and returned nothing usable (S121 stays separate). */
  | { readonly state: "no_usable"; readonly reason: string }
  /** S251: held back until a rent change is proposed. */
  | { readonly state: "held_back"; readonly reason: string }
  | { readonly state: "unreadable" };

export interface RenewalKickoffFacts {
  readonly numbers: RenewalNumbersFacts;
  readonly comparison: RenewalComparisonFacts;
  /** The rent staff typed (the working renewal rent), or null. A typed figure always wins. */
  readonly typedRent: number | null;
  /** S250 slot: the covering standing agreement's rent and its basis in words. Null today. */
  readonly agreementRent: { readonly value: number; readonly basis: string } | null;
  /** The current rent a comparison proposal is held near. */
  readonly currentRent: number | null;
  /** A verified owner recipient on RentVine, or the reasons there is none; null when unread. */
  readonly ownerRecipient:
    | { readonly state: "ready" }
    | { readonly state: "missing"; readonly reasons: readonly string[] }
    | null;
  /** The signed-in sender has a signature (a business profile, a retained or saved one). */
  readonly signature: boolean | null;
  /** The owner message template is approved for use. */
  readonly templateApproved: boolean | null;
  /** The property address the message names. */
  readonly address: string | null;
}

// ---- Projection -----------------------------------------------------------------------------

export type RenewalNumbersCheck =
  | {
      readonly state: "agree";
      readonly line: typeof KICKOFF_WORDS.numbersAgree;
      readonly sheetNotes: readonly string[];
      readonly facts: readonly string[];
    }
  | {
      readonly state: "difference";
      /** The one difference to settle, in words. */
      readonly line: string;
      readonly fix: RenewalPreparationFix;
      readonly sheetNotes: readonly string[];
      readonly facts: readonly string[];
    }
  | {
      readonly state: "unavailable";
      readonly line: string;
      readonly sheetNotes: readonly string[];
      readonly facts: readonly string[];
    };

export interface RenewalComparisonView {
  readonly state: RenewalComparisonFacts["state"];
  /** One line about the comparison: its range and age, or why it is not there. */
  readonly line: string;
  readonly stored: RenewalStoredComparison | null;
  /** The first usable comparables, in provider order (S195). */
  readonly firstComps: RenewalStoredComparison["comps"];
  /** "Compared 11/05/2026", or null. */
  readonly ageLine: string | null;
  /** The existing own-figures entry when no comparison is stored. */
  readonly fix: RenewalPreparationFix | null;
  /** True when this cycle's one claimed lookup already ran; nothing starts it again by itself. */
  readonly attempted?: boolean;
}

export type RenewalRentOrigin = "typed" | "agreement" | "comparison";

export interface RenewalRentView {
  readonly value: number | null;
  readonly origin: RenewalRentOrigin | null;
  /** The basis in words, always shown beside the figure. */
  readonly basis: string;
}

export type RenewalKickoffItemKey =
  | "numbers"
  | "comparison"
  | "rent"
  | "recipient"
  | "signature"
  | "template"
  | "marked_values";

export interface RenewalKickoffItem {
  readonly key: RenewalKickoffItemKey;
  readonly label: string;
  readonly ready: boolean;
  /** The missing input in words; null when ready or not known yet. */
  readonly missing: string | null;
  readonly fix: RenewalPreparationFix | null;
  /** True when the fact was not read, so the item says so instead of claiming a state. */
  readonly unknown?: boolean;
}

export interface RenewalPreparation {
  readonly version: typeof RENEWAL_PREPARATION_VERSION;
  readonly numbers: RenewalNumbersCheck;
  readonly comparison: RenewalComparisonView;
  readonly rent: RenewalRentView;
  /** Every kickoff item, in the order the Now card lists them. */
  readonly items: readonly RenewalKickoffItem[];
  /** True when every kickoff item is ready: the owner message can be reviewed and sent. */
  readonly sendable: boolean;
  /** The missing inputs, named, in item order. */
  readonly missing: readonly string[];
}

const money = (amount: number) =>
  `$${(Number.isInteger(amount) ? String(amount) : amount.toFixed(2)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  )}`;

const sameMoney = (left: number, right: number) => Math.abs(left - right) < 0.005;

const usable = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** R-S249-1 / D-OP-7: "Numbers agree" or the ONE difference to settle, RentVine as the basis. */
export function renewalNumbersCheck(facts: RenewalNumbersFacts): RenewalNumbersCheck {
  const sheetNotes: string[] = [];
  const rentvine = usable(facts.contractualRent) ? facts.contractualRent : null;
  // A Sheet value shows only when it differs from RentVine; a blank Sheet value is no difference.
  if (
    usable(facts.sheetRent) &&
    rentvine !== null &&
    !sameMoney(facts.sheetRent, rentvine)
  )
    sheetNotes.push(
      `The operating Sheet shows ${money(facts.sheetRent)} for the current rent. This is information; RentVine is the basis.`,
    );
  if (facts.sheetEndIso && facts.leaseEndIso && facts.sheetEndIso !== facts.leaseEndIso)
    sheetNotes.push(
      `The operating Sheet shows ${formatCalendarDate(facts.sheetEndIso)} for the lease end. This is information; RentVine is the basis.`,
    );
  const shown: string[] = [];
  if (rentvine !== null) shown.push(`RentVine rent ${money(rentvine)}`);
  const charges = (facts.rentCharges ?? []).filter(usable);
  if (charges.length === 1) shown.push(`rent charge ${money(charges[0]!)}`);
  if (facts.leaseEndIso) shown.push(`lease end ${formatCalendarDate(facts.leaseEndIso)}`);
  if (usable(facts.workingRent)) shown.push(`working rent ${money(facts.workingRent)}`);
  if (!facts.sourceReadable)
    return {
      state: "unavailable",
      line: "The RentVine read is not current, so the numbers are checked once it is refreshed",
      sheetNotes,
      facts: shown,
    };
  const difference = (line: string, fix: RenewalPreparationFix): RenewalNumbersCheck => ({
    state: "difference",
    line,
    fix,
    sheetNotes,
    facts: shown,
  });
  if (rentvine === null)
    return difference("RentVine has no current rent for this lease", {
      label: "Correct a lease fact",
      target: KICKOFF_FIX_TARGETS.correctFact,
    });
  if (facts.rentCharges !== null) {
    if (charges.length > 1)
      return difference(
        `RentVine lists ${charges.length} current rent charges; one is expected`,
        { label: "Review rent and charges", target: KICKOFF_FIX_TARGETS.rentAndCharges },
      );
    if (charges.length === 1 && !sameMoney(charges[0]!, rentvine))
      return difference(
        `The RentVine rent charge is ${money(charges[0]!)} and the lease rent is ${money(rentvine)}`,
        { label: "Review rent and charges", target: KICKOFF_FIX_TARGETS.rentAndCharges },
      );
  }
  if (usable(facts.workingRent) && !sameMoney(facts.workingRent, rentvine))
    return difference(
      `Your working current rent is ${money(facts.workingRent)} and RentVine reports ${money(rentvine)}`,
      { label: "Review rent and charges", target: KICKOFF_FIX_TARGETS.rentAndCharges },
    );
  if (!facts.leaseEndIso)
    return difference("RentVine has no lease end date for this lease", {
      label: "Correct a lease fact",
      target: KICKOFF_FIX_TARGETS.correctFact,
    });
  return { state: "agree", line: KICKOFF_WORDS.numbersAgree, sheetNotes, facts: shown };
}

function comparisonView(facts: RenewalComparisonFacts): RenewalComparisonView {
  const ownFigures: RenewalPreparationFix = {
    label: KICKOFF_WORDS.ownFigures,
    target: KICKOFF_FIX_TARGETS.comparison,
  };
  switch (facts.state) {
    case "stored": {
      const stored = facts.comparison;
      const firstComps = firstUsableComparables(stored.comps).entries.map(
        (entry) => entry.value,
      );
      const day = stored.observedAtIso.slice(0, 10);
      return {
        state: "stored",
        line: `${stored.source} range ${money(stored.rangeLow)} to ${money(stored.rangeHigh)} from ${stored.compCount} comparable ${stored.compCount === 1 ? "listing" : "listings"}`,
        stored,
        firstComps,
        ageLine: /^\d{4}-\d{2}-\d{2}$/.test(day)
          ? `Compared ${formatCalendarDate(day)}`
          : null,
        fix: null,
      };
    }
    case "allowance_reached":
      return {
        state: "allowance_reached",
        line: KICKOFF_WORDS.allowanceReached,
        stored: null,
        firstComps: [],
        ageLine: null,
        fix: ownFigures,
      };
    case "no_usable":
      return {
        state: "no_usable",
        line: `The comparison found nothing usable: ${facts.reason}`,
        stored: null,
        firstComps: [],
        ageLine: null,
        fix: ownFigures,
      };
    case "held_back":
      return {
        state: "held_back",
        line: facts.reason,
        stored: null,
        firstComps: [],
        ageLine: null,
        fix: null,
      };
    case "unreadable":
      return {
        state: "unreadable",
        line: "The stored comparison could not be read just now",
        stored: null,
        firstComps: [],
        ageLine: null,
        fix: ownFigures,
      };
    default:
      return {
        state: "none",
        line:
          facts.state === "none" && facts.attempted
            ? "This cycle's comparison already ran once and stored no result"
            : "No comparison is stored for this cycle yet",
        stored: null,
        firstComps: [],
        ageLine: null,
        fix: ownFigures,
        ...(facts.state === "none" && facts.attempted ? { attempted: true } : {}),
      };
  }
}

/**
 * R-S249-5: the one "Rent to recommend". A typed figure always wins; else the covering standing
 * agreement (S250); else the comparison-based suggestion. Each has its basis in words.
 */
export function renewalRentToRecommend(
  facts: Pick<
    RenewalKickoffFacts,
    "typedRent" | "agreementRent" | "comparison" | "currentRent"
  >,
): RenewalRentView {
  if (usable(facts.typedRent))
    return {
      value: facts.typedRent,
      origin: "typed",
      basis: "Entered by staff. A later proposal never replaces it.",
    };
  if (facts.agreementRent && usable(facts.agreementRent.value))
    return {
      value: facts.agreementRent.value,
      origin: "agreement",
      basis: facts.agreementRent.basis,
    };
  if (facts.comparison.state === "stored") {
    const stored = facts.comparison.comparison;
    const suggestion = computeRentSuggestion({
      comps: stored.comps.map((comp, index) => ({
        rent: comp.rent,
        source: `${stored.source} comparable ${index + 1}`,
      })),
      ...(usable(facts.currentRent) ? { currentRent: facts.currentRent } : {}),
    });
    if (suggestion.suggestedRent !== null)
      return {
        value: suggestion.suggestedRent,
        origin: "comparison",
        basis: `Suggested from the stored comparison: ${suggestion.rationale}`,
      };
  }
  return {
    value: null,
    origin: null,
    basis: "No rent is suggested yet. Enter the rent to recommend to the owner.",
  };
}

/**
 * The marked values the owner message needs that the stored facts can answer: the property
 * address, the current rent, and the comparable range with its listings. The message's own
 * callout (S161) still lists every marker it carries.
 */
export function kickoffMarkedValues(
  facts: Pick<RenewalKickoffFacts, "address" | "currentRent" | "comparison">,
): string[] {
  const missing: string[] = [];
  if (!facts.address?.trim()) missing.push("the property address");
  if (!usable(facts.currentRent)) missing.push("the current rent");
  if (facts.comparison.state !== "stored")
    missing.push("the comparable range and listings");
  return missing;
}

export function projectRenewalPreparation(
  facts: RenewalKickoffFacts,
): RenewalPreparation {
  const numbers = renewalNumbersCheck(facts.numbers);
  const comparison = comparisonView(facts.comparison);
  const rent = renewalRentToRecommend(facts);
  const marked = kickoffMarkedValues(facts);
  const items: RenewalKickoffItem[] = [
    {
      key: "numbers",
      label: "Numbers checked",
      ready: numbers.state === "agree",
      missing: numbers.state === "agree" ? null : numbers.line,
      fix: numbers.state === "difference" ? numbers.fix : null,
    },
    {
      key: "comparison",
      label: "Stored comparison",
      ready: comparison.state === "stored",
      missing: comparison.state === "stored" ? null : comparison.line,
      fix: comparison.fix,
    },
    {
      key: "rent",
      label: KICKOFF_WORDS.rentToRecommend,
      ready: rent.value !== null,
      missing: rent.value !== null ? null : "the rent to recommend",
      fix:
        rent.value !== null
          ? null
          : {
              label: "Enter the rent to recommend",
              target: KICKOFF_FIX_TARGETS.rentToRecommend,
            },
    },
    {
      key: "recipient",
      label: "Verified owner recipient",
      ready: facts.ownerRecipient?.state === "ready",
      missing:
        facts.ownerRecipient === null
          ? null
          : facts.ownerRecipient.state === "ready"
            ? null
            : "a verified owner recipient",
      fix:
        facts.ownerRecipient?.state === "missing"
          ? {
              label: "Add the owner's email on the owner record in RentVine",
              target: KICKOFF_FIX_TARGETS.ownerMessage,
            }
          : null,
      ...(facts.ownerRecipient === null ? { unknown: true } : {}),
    },
    {
      key: "signature",
      label: "Your signature",
      ready: facts.signature === true,
      missing: facts.signature === false ? "your signature" : null,
      fix:
        facts.signature === false
          ? { label: "Set up your signature", target: KICKOFF_FIX_TARGETS.signature }
          : null,
      ...(facts.signature === null ? { unknown: true } : {}),
    },
    {
      key: "template",
      label: "Approved template",
      ready: facts.templateApproved === true,
      missing: facts.templateApproved === false ? "an approved owner template" : null,
      fix:
        facts.templateApproved === false
          ? {
              label: "Ask an Approver to publish the owner template",
              target: KICKOFF_FIX_TARGETS.ownerMessage,
            }
          : null,
      ...(facts.templateApproved === null ? { unknown: true } : {}),
    },
    {
      key: "marked_values",
      label: "Complete marked values",
      ready: marked.length === 0,
      missing: marked.length === 0 ? null : marked.join(", "),
      fix:
        marked.length === 0
          ? null
          : {
              label: "Review the marked values",
              target: KICKOFF_FIX_TARGETS.markedValues,
            },
    },
  ];
  const missing = items.flatMap((item) =>
    item.ready || !item.missing ? [] : [item.missing],
  );
  return {
    version: RENEWAL_PREPARATION_VERSION,
    numbers,
    comparison,
    rent,
    items,
    sendable: items.every((item) => item.ready),
    missing,
  };
}

/** The items "Review and send" needs (R-S249-10, R-S249-11), in the order the Now card lists them. */
export const SEND_READINESS_KEYS: readonly RenewalKickoffItemKey[] = [
  "rent",
  "recipient",
  "signature",
  "template",
  "marked_values",
];

/**
 * The same projection with what the lease page knows live since it was made: the staff member's
 * own signature once they set it up, a rent they typed, the recipients and template the message
 * read. Pure; the item words and fixes are the projection's own.
 */
export function withLiveKickoff(
  preparation: RenewalPreparation,
  live: {
    readonly signature?: boolean | null;
    readonly typedRent?: number | null;
    readonly recipientReady?: boolean | null;
    readonly templateApproved?: boolean | null;
    /** The values the live message still marks, by name; empty when it carries none. */
    readonly marked?: readonly string[] | null;
  },
): RenewalPreparation {
  const rent: RenewalRentView =
    typeof live.typedRent === "number" && live.typedRent > 0
      ? {
          value: live.typedRent,
          origin: "typed",
          basis: "Entered by staff. A later proposal never replaces it.",
        }
      : preparation.rent;
  const items = preparation.items.map((item): RenewalKickoffItem => {
    const set = (
      ready: boolean | null | undefined,
      missing: string,
      fix: RenewalPreparationFix,
    ): RenewalKickoffItem =>
      ready === undefined || ready === null
        ? item
        : {
            key: item.key,
            label: item.label,
            ready,
            missing: ready ? null : missing,
            fix: ready ? null : fix,
          };
    switch (item.key) {
      case "rent":
        return rent.value !== null
          ? { ...item, ready: true, missing: null, fix: null }
          : item;
      case "signature":
        return set(live.signature, "your signature", {
          label: "Set up your signature",
          target: KICKOFF_FIX_TARGETS.signature,
        });
      case "recipient":
        return set(live.recipientReady, "a verified owner recipient", {
          label: "Add the owner's email on the owner record in RentVine",
          target: KICKOFF_FIX_TARGETS.ownerMessage,
        });
      case "template":
        return set(live.templateApproved, "an approved owner template", {
          label: "Ask an Approver to publish the owner template",
          target: KICKOFF_FIX_TARGETS.ownerMessage,
        });
      case "marked_values":
        return live.marked
          ? set(live.marked.length === 0, live.marked.join(", "), {
              label: "Review the marked values",
              target: KICKOFF_FIX_TARGETS.markedValues,
            })
          : item;
      default:
        return item;
    }
  });
  return {
    ...preparation,
    rent,
    items,
    sendable: items.every((item) => item.ready),
    missing: items.flatMap((item) => (item.ready || !item.missing ? [] : [item.missing])),
  };
}

/** True when every item "Review and send" needs is ready. */
export function sendReady(preparation: RenewalPreparation): boolean {
  return preparation.items
    .filter((item) => SEND_READINESS_KEYS.includes(item.key))
    .every((item) => item.ready);
}

/** The desk row's one line about the kickoff, from the same projection the Now card reads. */
export function kickoffRowLine(preparation: RenewalPreparation): string {
  if (preparation.sendable)
    return `${KICKOFF_WORDS.readyForReview}: owner message prepared`;
  if (preparation.comparison.state === "allowance_reached")
    return KICKOFF_WORDS.allowanceReached;
  return `Missing: ${preparation.missing.join("; ")}`;
}

/** R-S249-13: where a batch lease sorts inside "This batch". */
export type KickoffOrderGroup = "ready" | "missing" | "other";

/**
 * Only a lease whose owner step is still ahead orders by its kickoff: ready first, then missing an
 * input. A lease waiting on someone, past the owner step or finished follows those.
 */
export function kickoffOrderGroup(input: {
  readonly preparation: RenewalPreparation | null | undefined;
  /** The stage's current step. */
  readonly currentStepId: string | null | undefined;
  /** True when the lease waits on someone else or its owner step is underway. */
  readonly ownerStepStarted: boolean;
}): KickoffOrderGroup {
  const kickoffSteps = new Set(["check-numbers", "compare-market", "ask-owner"]);
  if (
    !input.preparation ||
    input.ownerStepStarted ||
    !kickoffSteps.has(input.currentStepId ?? "")
  )
    return "other";
  return input.preparation.sendable ? "ready" : "missing";
}
