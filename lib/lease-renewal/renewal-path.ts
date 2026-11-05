// S247 R-S247-1 / R-S247-2: the one ordered renewal path. Every lease page, desk row, assistant
// answer and My Work lease link reads the stage and the next step from `renewal-stage.ts`, which
// walks exactly this definition. Each step names its label, when it applies, what the app shows
// ready, what the person decides, the existing controls the Now card reveals in place, the
// existing handlers those controls already use, its completion evidence, its waiting state and the
// step that follows.
//
// The definition is built over the existing predicates and handlers (the staff lane in
// `workspace-state.ts`, the desk guidance in `desk-guidance.ts`, the Focus action graph in
// `renewal-actions.ts` and the S248 evidence in `outreach-evidence.ts`). It stores no progress and
// gates nothing (ARCH-S247-3): a step's state is presentation, and every control keeps its own
// inputs and authority checks (S156).
//
// Variants are slots: a recorded or source non-renewal replaces the later steps with the existing
// non-renewal handoff, a month-to-month lease shows its review step, a covered standing agreement
// (S250) and housing assistance (S251) each have a typed slot those suites fill without changing
// the shape of this file. Pure and client-safe.

import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";
import type { RenewalWorkStatus } from "@/lib/lease-renewal/work-status";

/** The standard path, in order (R-S247-1). */
export const RENEWAL_PATH_STANDARD_STEPS = [
  "check-numbers",
  "compare-market",
  "ask-owner",
  "offer-tenant",
  "documents",
  "finish-up",
  "complete",
] as const;

/** Steps a variant adds (R-S247-2). The S251 ids are reserved for that suite's slot. */
export const RENEWAL_PATH_VARIANT_STEPS = [
  "month-to-month-review",
  "non-renewal-handoff",
  "assisted-program-contact",
  "assisted-owner-renewal-answer",
  "assisted-rent",
] as const;

export type RenewalPathStepId =
  | (typeof RENEWAL_PATH_STANDARD_STEPS)[number]
  | (typeof RENEWAL_PATH_VARIANT_STEPS)[number];

export const RENEWAL_PATH_STEP_IDS: readonly RenewalPathStepId[] = [
  ...RENEWAL_PATH_STANDARD_STEPS,
  ...RENEWAL_PATH_VARIANT_STEPS,
];

export function isRenewalPathStepId(value: unknown): value is RenewalPathStepId {
  return (
    typeof value === "string" &&
    (RENEWAL_PATH_STEP_IDS as readonly string[]).includes(value)
  );
}

/** The exact labels the path strip reads (L12). */
export const RENEWAL_PATH_LABELS: Record<RenewalPathStepId, string> = {
  "check-numbers": "Check the numbers",
  "compare-market": "Compare market rent",
  "ask-owner": "Ask the owner",
  "offer-tenant": "Offer the tenant",
  documents: "Documents and signatures",
  "finish-up": "Finish up",
  complete: "Complete",
  "month-to-month-review": "Month-to-month review",
  "non-renewal-handoff": "Non-renewal handoff",
  // S251 fills the program name; these are the shapes its labels take.
  "assisted-program-contact": "Contact the housing program about the renewal process",
  "assisted-owner-renewal-answer": "Ask the owner whether to renew this tenant",
  "assisted-rent": "Rent for this renewal",
};

/** A step that does not apply reads this and asks for nothing (R-S247-2). */
export const NOT_PART_OF_PATH_LABEL = "Not part of this lease's path";

/**
 * S249 fills these named places on the Now card. Until then each one is absent and the step
 * shows its existing controls.
 */
export const NOW_CARD_SLOTS = [
  "prepared-numbers-check",
  "stored-comparison",
  "rent-to-recommend",
  "message-preview",
  "review-and-send",
] as const;
export type NowCardSlot = (typeof NOW_CARD_SLOTS)[number];

export interface RenewalPathStepDefinition {
  readonly id: RenewalPathStepId;
  readonly label: string;
  /** What the app shows ready on the Now card. */
  readonly ready: string;
  /** What the person decides on this step. */
  readonly decides: string;
  /**
   * The existing Full view regions the Now card reveals in place, in page order (the S144
   * in-pane mechanism). Every control keeps its own handler, validation and confirmation.
   */
  readonly controls: readonly string[];
  /** The existing routes those controls already call; the path adds none. */
  readonly handlers: readonly string[];
  /** The step's default primary action: its words and the existing control it operates. */
  readonly primary: { readonly label: string; readonly target: string };
  /** The completion evidence, in words: the existing predicate the projection reads. */
  readonly completion: string;
  /** Who a waiting step waits on and what the app watches meanwhile; null when it never waits. */
  readonly waiting: { readonly party: string; readonly watching: string } | null;
  /** The staff work-status vocabulary this step's stage uses (R-S247-3). */
  readonly stage: RenewalWorkStatus;
  /** The stage while the step waits on someone else, when different. */
  readonly waitingStage: RenewalWorkStatus | null;
  readonly next: RenewalPathStepId | null;
  /** The legacy `step` value and the Full view section this step's controls live in. */
  readonly processStepId: RenewalProcessStepId | null;
  readonly sectionId: string;
  readonly slots: readonly NowCardSlot[];
}

const WORKSPACE_ROUTE = "/api/lease-renewal/workspace";
const MESSAGE_ROUTES = [
  "/api/lease-renewal/message-preparation",
  "/api/gmail-hub/sequences",
  "/api/lease-renewal/renewal-notice-draft",
];

/** R-S247-1: the one ordered definition. */
export const RENEWAL_PATH_DEFINITION: Readonly<
  Record<RenewalPathStepId, RenewalPathStepDefinition>
> = {
  "month-to-month-review": {
    id: "month-to-month-review",
    label: RENEWAL_PATH_LABELS["month-to-month-review"],
    ready: "The lease term, its month-to-month start and the next review date.",
    decides: "Whether the recorded term matches the current lease facts.",
    controls: ["renewal-card-lease-term"],
    handlers: ["/api/lease-renewal/term-review"],
    primary: { label: "Review the lease term", target: "renewal-card-lease-term" },
    completion: "A term review recorded for the current lease facts.",
    waiting: null,
    stage: "verifying_lease_and_rent",
    waitingStage: null,
    next: "check-numbers",
    processStepId: "verify-renewal",
    sectionId: "lease-details",
    slots: [],
  },
  "check-numbers": {
    id: "check-numbers",
    label: RENEWAL_PATH_LABELS["check-numbers"],
    ready: "RentVine rent and dates beside the operating Sheet, with any difference to settle.",
    decides: "Whether the numbers agree, or which source is right for a difference.",
    controls: [
      "renewal-card-lease-term",
      "renewal-rent-and-charges",
      "renewal-card-data-check",
    ],
    handlers: [
      "/api/lease-renewal/correction-review",
      "/api/lease-renewal/resolve",
      "/api/lease-renewal/rentvine-writeback",
    ],
    primary: { label: "Correct a lease fact", target: "renewal-correct-a-fact" },
    completion: "RentVine and the operating Sheet agree on the current rent, or staff resolved it.",
    waiting: null,
    stage: "verifying_lease_and_rent",
    waitingStage: null,
    next: "compare-market",
    processStepId: "verify-renewal",
    sectionId: "lease-details",
    slots: ["prepared-numbers-check"],
  },
  "compare-market": {
    id: "compare-market",
    label: RENEWAL_PATH_LABELS["compare-market"],
    ready: "The comparison subject, any earlier lookup and the reviewed market numbers.",
    decides: "The market range and the rent to recommend to the owner.",
    controls: ["renewal-section-comps"],
    handlers: [WORKSPACE_ROUTE, "/api/lease-renewal/market-comps"],
    primary: { label: "Compare market rent", target: "renewal-section-comps" },
    completion: "A saved market rent comparison for this cycle.",
    waiting: null,
    stage: "preparing_market_comparison",
    waitingStage: null,
    next: "ask-owner",
    processStepId: null,
    sectionId: "comps",
    slots: ["stored-comparison", "rent-to-recommend"],
  },
  "ask-owner": {
    id: "ask-owner",
    label: RENEWAL_PATH_LABELS["ask-owner"],
    ready: "The owner message prepared from the saved numbers and the working terms.",
    decides: "When to send the owner message, and the owner's decision once it comes.",
    controls: [
      "renewal-card-message-owner",
      "renewal-manual-owner_outreach",
      "renewal-manual-owner_response",
      "renewal-card-follow-up",
    ],
    handlers: [...MESSAGE_ROUTES, WORKSPACE_ROUTE],
    primary: { label: "Send the owner message", target: "renewal-card-message-owner" },
    completion:
      "The owner's recorded answer: an approval of exact terms, or a decline. A confirmed send records the outreach.",
    waiting: {
      party: "the owner",
      watching: "Replies and delivery reports on the owner message's Gmail thread.",
    },
    stage: "preparing_owner_outreach",
    waitingStage: "waiting_on_owner_response",
    next: "offer-tenant",
    processStepId: "owner-decision",
    sectionId: "owner",
    slots: ["message-preview", "review-and-send"],
  },
  "offer-tenant": {
    id: "offer-tenant",
    label: RENEWAL_PATH_LABELS["offer-tenant"],
    ready: "The tenant offer prepared from the working terms.",
    decides: "When to send the offer, and the tenant's answer once it comes.",
    controls: [
      "renewal-card-message-tenant",
      "renewal-manual-tenant_offer",
      "renewal-manual-tenant_response",
      "renewal-manual-information_form",
      "renewal-manual-form_returned",
      "renewal-card-follow-up",
    ],
    handlers: [...MESSAGE_ROUTES, WORKSPACE_ROUTE],
    primary: { label: "Send the tenant offer", target: "renewal-card-message-tenant" },
    completion: "The tenant's recorded answer to the current terms.",
    waiting: {
      party: "the tenant",
      watching: "Replies and delivery reports on the tenant offer's Gmail thread.",
    },
    stage: "preparing_tenant_offer",
    waitingStage: "waiting_on_tenant_response",
    next: "documents",
    processStepId: "tenant-decision",
    sectionId: "tenant",
    slots: ["message-preview", "review-and-send"],
  },
  documents: {
    id: "documents",
    label: RENEWAL_PATH_LABELS.documents,
    ready: "The document facts from the working terms and the saved resource locations.",
    decides: "Which documents to prepare, deliver and collect signatures on.",
    controls: [
      "renewal-step-document-packet",
      "renewal-manual-documents",
      "renewal-manual-document_delivery",
      "renewal-manual-signatures",
    ],
    handlers: ["/api/lease-renewal/document-handoff", WORKSPACE_ROUTE],
    primary: {
      label: "Prepare the required documents",
      target: "renewal-manual-documents",
    },
    completion: "Required documents prepared, delivered and signed, recorded by staff.",
    waiting: {
      party: "the signers",
      watching: "Returned documents recorded for this lease.",
    },
    stage: "preparing_lease_documents",
    waitingStage: "waiting_on_signatures",
    next: "finish-up",
    processStepId: "document-packet",
    sectionId: "documents",
    slots: [],
  },
  "finish-up": {
    id: "finish-up",
    label: RENEWAL_PATH_LABELS["finish-up"],
    ready: "RentVine and operating Sheet updates and the remaining follow-ups.",
    decides: "Each update to apply with its own confirmation, and each follow-up that applies.",
    controls: [
      "renewal-rent-and-charges",
      "renewal-manual-insurance",
      "renewal-manual-rhino",
      "renewal-manual-pet",
      "renewal-manual-charges",
      "renewal-manual-inspection",
      "renewal-manual-filter",
      "renewal-manual-utilities",
      "renewal-manual-assisted_housing",
      "renewal-manual-source-updates",
    ],
    handlers: [
      "/api/lease-renewal/rentvine-writeback",
      "/api/lease-renewal/operating-sheet",
      WORKSPACE_ROUTE,
    ],
    primary: {
      label: "Work the next follow-up",
      target: "renewal-manual-insurance",
    },
    completion:
      "Each applicable follow-up Done or Not applicable; each source update read back after its confirmation.",
    waiting: null,
    stage: "completing_follow_up",
    waitingStage: null,
    next: "complete",
    processStepId: "signatures-follow-up",
    sectionId: "documents",
    slots: [],
  },
  "non-renewal-handoff": {
    id: "non-renewal-handoff",
    label: RENEWAL_PATH_LABELS["non-renewal-handoff"],
    ready: "The recorded decline or the RentVine move-out notice.",
    decides: "When the documented non-renewal handoff is done.",
    controls: ["renewal-manual-non_renewal_handoff"],
    handlers: [WORKSPACE_ROUTE],
    primary: {
      label: "Record the non-renewal handoff",
      target: "renewal-manual-non_renewal_handoff",
    },
    completion: "Non-renewal handoff recorded by staff.",
    waiting: null,
    stage: "non_renewal_handoff",
    waitingStage: null,
    next: "complete",
    processStepId: "compliance-close",
    sectionId: "documents",
    slots: [],
  },
  complete: {
    id: "complete",
    label: RENEWAL_PATH_LABELS.complete,
    ready: "The recorded work for this cycle and any RentVine lease end that moved.",
    decides: "When the renewal work is actually complete.",
    controls: ["renewal-manual-complete"],
    handlers: [WORKSPACE_ROUTE],
    primary: { label: "Record staff completion", target: "renewal-manual-complete" },
    completion: "A staff completion record. Nothing completes a lease by itself.",
    waiting: null,
    stage: "complete_staff_status",
    waitingStage: null,
    next: null,
    processStepId: "compliance-close",
    sectionId: "documents",
    slots: [],
  },
  // S251 slots: the steps exist so that suite fills predicates and the program name only.
  "assisted-program-contact": {
    id: "assisted-program-contact",
    label: RENEWAL_PATH_LABELS["assisted-program-contact"],
    ready: "The housing program named on the lease.",
    decides: "When the program has been contacted about the renewal process.",
    controls: ["renewal-manual-assisted_housing"],
    handlers: [WORKSPACE_ROUTE],
    primary: {
      label: "Record the program contact",
      target: "renewal-manual-assisted_housing",
    },
    completion: "The program contact recorded by staff.",
    waiting: null,
    stage: "preparing_owner_outreach",
    waitingStage: null,
    next: "assisted-owner-renewal-answer",
    processStepId: "owner-decision",
    sectionId: "owner",
    slots: [],
  },
  "assisted-owner-renewal-answer": {
    id: "assisted-owner-renewal-answer",
    label: RENEWAL_PATH_LABELS["assisted-owner-renewal-answer"],
    ready: "The owner message asking whether to renew this tenant.",
    decides: "Renew, Do not renew or No answer yet, as the owner answers.",
    controls: ["renewal-card-message-owner", "renewal-manual-owner_response"],
    handlers: [...MESSAGE_ROUTES, WORKSPACE_ROUTE],
    primary: {
      label: "Record the owner's answer",
      target: "renewal-manual-owner_response",
    },
    completion: "The owner's answer recorded by staff.",
    waiting: {
      party: "the owner",
      watching: "Replies and delivery reports on the owner message's Gmail thread.",
    },
    stage: "preparing_owner_outreach",
    waitingStage: "waiting_on_owner_response",
    next: "assisted-rent",
    processStepId: "owner-decision",
    sectionId: "owner",
    slots: [],
  },
  "assisted-rent": {
    id: "assisted-rent",
    label: RENEWAL_PATH_LABELS["assisted-rent"],
    ready: "The current rent and, when a change is proposed, the prepared comparison.",
    decides: "Keep the current rent or propose a change.",
    controls: ["renewal-section-comps", "renewal-working-terms"],
    handlers: [WORKSPACE_ROUTE],
    primary: { label: "Choose the rent", target: "renewal-working-terms" },
    completion: "The rent choice recorded for this renewal.",
    waiting: null,
    stage: "preparing_market_comparison",
    waitingStage: null,
    next: "offer-tenant",
    processStepId: "owner-decision",
    sectionId: "comps",
    slots: ["stored-comparison", "rent-to-recommend"],
  },
};

/**
 * R-S247-2: the variant slots. Absent inputs mean the standard path; S250 and S251 supply theirs
 * without changing the definition above.
 */
export interface RenewalPathVariants {
  /** A recorded decline, or a RentVine move-out notice: the later steps become the handoff. */
  readonly nonRenewal: { readonly source: "recorded" | "rentvine" } | null;
  readonly monthToMonth: boolean;
  /** S250 slot. Today the existing standing owner authority (S194) fills it. */
  readonly standingAgreement: {
    readonly label: string | null;
    readonly reason: string;
  } | null;
  /** S251 slot. Null until that suite records the lease fact. */
  readonly housingAssistance: { readonly program: string } | null;
}

/** The path for one lease, in order, with the steps that are not part of it marked. */
export function renewalPathSteps(variants: RenewalPathVariants): {
  readonly id: RenewalPathStepId;
  readonly applies: boolean;
}[] {
  const steps: { id: RenewalPathStepId; applies: boolean }[] = [];
  if (variants.monthToMonth) steps.push({ id: "month-to-month-review", applies: true });
  steps.push({ id: "check-numbers", applies: true });
  if (variants.housingAssistance) {
    // S251: the program contact and the owner's renew-or-not answer come ahead of rent.
    steps.push({ id: "assisted-program-contact", applies: true });
    steps.push({ id: "assisted-owner-renewal-answer", applies: true });
    steps.push({ id: "assisted-rent", applies: true });
    steps.push({ id: "compare-market", applies: false });
    steps.push({ id: "ask-owner", applies: false });
  } else {
    steps.push({ id: "compare-market", applies: true });
    steps.push({ id: "ask-owner", applies: true });
  }
  if (variants.nonRenewal) {
    steps.push({ id: "offer-tenant", applies: variants.nonRenewal.source !== "rentvine" });
    steps.push({ id: "non-renewal-handoff", applies: true });
    steps.push({ id: "documents", applies: false });
    steps.push({ id: "finish-up", applies: false });
  } else {
    steps.push({ id: "offer-tenant", applies: true });
    steps.push({ id: "documents", applies: true });
    steps.push({ id: "finish-up", applies: true });
  }
  steps.push({ id: "complete", applies: true });
  return steps;
}

/**
 * R-S247-11: an older `step` value names the path step that now holds its controls. Unknown
 * values open the lease at its current step.
 */
export function pathStepForLinkStep(
  value: string | null | undefined,
): RenewalPathStepId | null {
  if (!value) return null;
  if (isRenewalPathStepId(value)) return value;
  switch (value) {
    case "verify-renewal":
      return "check-numbers";
    case "owner-decision":
      return "ask-owner";
    case "tenant-decision":
      return "offer-tenant";
    case "document-packet":
    case "signatures-follow-up":
      return "documents";
    case "compliance-close":
      return "finish-up";
    default:
      return null;
  }
}
