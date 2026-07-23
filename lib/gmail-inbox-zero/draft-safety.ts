import {
  GMAIL_DRAFT_CATEGORY_IDS,
  GMAIL_HARD_EXCLUSION_CATEGORY_IDS,
  type GmailDraftCategoryId,
} from "@/lib/gmail-inbox-zero/constants";

const CATEGORY_ALIASES: Record<GmailDraftCategoryId, readonly string[]> = {
  vendor: ["vendor", "vendors", "vendor invoice", "vendor invoices"],
  scheduling: ["scheduling", "schedule", "appointment", "appointments"],
  general_question: ["general question", "general questions", "routine question"],
  owner_money: [
    "owner money",
    "owner monies",
    "owners money",
    "owner funds",
    "owner payment",
    "owner payments",
    "owner payout",
    "owner payouts",
  ],
  legal_notices: [
    "legal notice",
    "legal notices",
    "legal rights",
    "tenant right",
    "tenant rights",
    "resident right",
    "resident rights",
    "statutory notice",
    "statutory notices",
    "eviction notice",
    "eviction notices",
  ],
  tenant_disputes: [
    "tenant dispute",
    "tenant disputes",
    "resident dispute",
    "resident disputes",
    "tenant conflict",
    "tenant conflicts",
    "resident conflict",
    "resident conflicts",
  ],
};

const ALIAS_TO_ID = new Map<string, GmailDraftCategoryId>();
for (const id of GMAIL_DRAFT_CATEGORY_IDS) {
  for (const alias of [id, ...CATEGORY_ALIASES[id]]) {
    ALIAS_TO_ID.set(normalizeSafetyText(alias), id);
  }
}

const EXCLUDED_IDS = new Set<GmailDraftCategoryId>(GMAIL_HARD_EXCLUSION_CATEGORY_IDS);

/**
 * S29 (D-RENT-SUGGEST): server-set provenance that an Admin explicitly approved this exact renewal rent
 * number, resolved server-side from the rent-suggestion control plane. It is NEVER client-trusted. Its ONLY
 * effect is to lift the CATEGORY-level `owner_money` exclusion for an owner-renewal draft whose owner-money
 * signal is that one approved number. It never loosens the `detectExcludedIntent` regex, so owner
 * payout/funds/monies/proceeds CONTENT, legal/notices, and tenant disputes all stay refused exactly as before.
 */
export interface ApprovedRentSuggestionProvenance {
  approved: true;
  value: number;
}

export interface GmailDraftSafetyInput {
  category: unknown;
  subject?: unknown;
  facts?: readonly unknown[];
  /** Server-set only (never from a client body); see ApprovedRentSuggestionProvenance. */
  approvedRentSuggestion?: ApprovedRentSuggestionProvenance;
}

/** A valid server-set approved-rent-suggestion provenance: approved with a finite, positive number. */
function hasValidApprovedRentSuggestion(input: GmailDraftSafetyInput): boolean {
  const provenance = input.approvedRentSuggestion;
  return (
    !!provenance &&
    provenance.approved === true &&
    typeof provenance.value === "number" &&
    Number.isFinite(provenance.value) &&
    provenance.value > 0
  );
}

export interface GmailDraftSafetyResult {
  allowed: boolean;
  categoryId?: GmailDraftCategoryId;
  errors: string[];
}

export function normalizeGmailDraftCategory(value: unknown): GmailDraftCategoryId | null {
  if (typeof value !== "string") return null;
  return ALIAS_TO_ID.get(normalizeSafetyText(value)) ?? null;
}

/** Deterministic fail-closed gate. It is deliberately conservative and never delegates to a model. */
export function inspectGmailDraftSafety(
  input: GmailDraftSafetyInput,
): GmailDraftSafetyResult {
  const categoryId = normalizeGmailDraftCategory(input.category);
  if (!categoryId) {
    return {
      allowed: false,
      errors: ["Unknown or blank draft category: choose a supported category."],
    };
  }

  // S29 narrow carve-out: the CATEGORY-level owner_money exclusion is lifted ONLY for an owner-renewal
  // draft carrying a valid SERVER-SET approved rent number. Every other excluded category (legal_notices,
  // tenant_disputes, and owner_money without provenance) is unchanged, and the content regex below is left
  // BYTE-FOR-BYTE untouched, so owner payout/funds/monies/proceeds CONTENT stays refused regardless.
  const ownerMoneyRentCarveOut =
    categoryId === "owner_money" && hasValidApprovedRentSuggestion(input);
  const categoryExcluded = EXCLUDED_IDS.has(categoryId) && !ownerMoneyRentCarveOut;
  const detectedIntent = detectExcludedIntent([
    typeof input.subject === "string" ? input.subject : "",
    ...(input.facts ?? []).filter((fact): fact is string => typeof fact === "string"),
  ]);
  if (categoryExcluded || detectedIntent) {
    const excludedId = categoryExcluded ? categoryId : detectedIntent;
    return {
      allowed: false,
      categoryId,
      errors: [
        `Category "${excludedId}" is a hard exclusion: label only, never auto-draft.`,
      ],
    };
  }

  return { allowed: true, categoryId, errors: [] };
}

export function normalizeSafetyText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectExcludedIntent(values: readonly string[]): GmailDraftCategoryId | null {
  const text = normalizeSafetyText(values.join(" "));
  if (!text) return null;

  if (
    /\b(?:legal|statutory|eviction)\b/.test(text) ||
    /\b(?:tenant|resident) rights?\b/.test(text) ||
    /\bnotice to (?:quit|vacate)\b/.test(text)
  ) {
    return "legal_notices";
  }
  if (/\bowner(?:s)? (?:money|monies|funds?|payments?|payouts?|proceeds)\b/.test(text)) {
    return "owner_money";
  }
  if (
    /\b(?:tenant|resident) (?:disputes?|conflicts?|claims?|rights complaints?)\b/.test(
      text,
    )
  ) {
    return "tenant_disputes";
  }
  return null;
}
