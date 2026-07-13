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

export interface GmailDraftSafetyInput {
  category: unknown;
  subject?: unknown;
  facts?: readonly unknown[];
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

  const categoryExcluded = EXCLUDED_IDS.has(categoryId);
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
