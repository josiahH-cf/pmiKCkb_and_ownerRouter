// Owner-policy renewal pricing rules (S62). A standing pricing agreement with an owner stops living
// in one person's head: an Admin records it here, keyed on the RentVine `portfolioID` (a stable
// identifier present on every lease view — never a free-text owner name, never parsed prose), and
// the desk proposes the number the rule implies through the SAME S29 Admin-approval control plane
// that governs comp-derived numbers. One policy kind exists (`flat_percent_increase`, the only one
// the client has described); the shape admits a second kind later without a migration.
//
// GOVERNANCE, intact by construction: a rule NEVER sets the operator-entered offer amount, never
// auto-records an owner decision, never suppresses an owner draft, and its number reaches a draft only
// through the per-number Admin approval (guarded by the offered-rent and outreach-skip sentinels).
// Admin-only management with a required plain-English reason and an append-only activity record.
// Client SDK access to both collections is denied by the firestore.rules default-deny catch-all;
// all access is server-side through the Admin SDK here.

import { type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const OWNER_POLICY_RULE_COLLECTIONS = {
  rules: "owner_policy_rules",
  activity: "owner_policy_rule_activity",
} as const;

export type OwnerPolicyRuleKind = "flat_percent_increase";

export interface OwnerPolicyRule {
  portfolioId: string;
  kind: OwnerPolicyRuleKind;
  /** The flat percentage applied to the authoritative current rent at every renewal. */
  percent: number;
  /** ISO date (YYYY-MM-DD). The rule applies only once this date has passed. */
  effectiveFrom: string;
  /** Plain-English description, e.g. "MKD standing agreement: 3.5% every renewal until told otherwise." */
  note: string;
  updatedByUid: string;
  updatedAt?: string;
}

export interface UpsertOwnerPolicyRuleInput {
  portfolioId: string;
  percent: number;
  effectiveFrom: string;
  note: string;
  /** Required plain-English reason for the change; appended to the audit record. */
  reason: string;
}

/**
 * AC-S62-11: a rule can only be created for a portfolio id that resolves against a live lease view.
 * The verifier is injected (routes supply one backed by the shared live read) so the store stays
 * I/O-free about RentVine and tests stay hermetic.
 */
export type PortfolioIdVerifier = (portfolioId: string) => Promise<boolean>;

function assertAdmin(actor: AuthenticatedUser): void {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(
      "Only an Admin may manage owner-policy pricing rules.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "You do not have permission to read pricing rules.",
      403,
    );
  }
}

const PORTFOLIO_ID_RE = /^\d{1,10}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeInput(input: UpsertOwnerPolicyRuleInput): UpsertOwnerPolicyRuleInput {
  const portfolioId = String(input.portfolioId ?? "").trim();
  if (!PORTFOLIO_ID_RE.test(portfolioId)) {
    throw new EditableLayerError(
      "A rule keys on the numeric RentVine portfolio id. A free-text owner name is refused.",
      400,
    );
  }
  if (
    typeof input.percent !== "number" ||
    !Number.isFinite(input.percent) ||
    input.percent <= 0 ||
    input.percent > 100
  ) {
    throw new EditableLayerError(
      "The rule percentage must be a number greater than 0 and at most 100.",
      400,
    );
  }
  const effectiveFrom = String(input.effectiveFrom ?? "").trim();
  if (!ISO_DATE_RE.test(effectiveFrom)) {
    throw new EditableLayerError(
      "The effective-from date must be an ISO date (YYYY-MM-DD).",
      400,
    );
  }
  const note = String(input.note ?? "").trim();
  if (note === "") {
    throw new EditableLayerError("A plain-English rule note is required.", 400);
  }
  const reason = String(input.reason ?? "").trim();
  if (reason === "") {
    throw new EditableLayerError("A plain-English reason is required.", 400);
  }
  return { portfolioId, percent: input.percent, effectiveFrom, note, reason };
}

/** Create or update the one rule for a portfolio. Admin-only; audited; portfolio id verified live. */
export async function upsertOwnerPolicyRule(
  actor: AuthenticatedUser,
  input: UpsertOwnerPolicyRuleInput,
  verifyPortfolioId: PortfolioIdVerifier,
  db: Firestore = getAdminFirestore(),
): Promise<OwnerPolicyRule> {
  assertAdmin(actor);
  const normalized = normalizeInput(input);
  const resolves = await verifyPortfolioId(normalized.portfolioId);
  if (!resolves) {
    throw new EditableLayerError(
      `Portfolio ${normalized.portfolioId} does not resolve against a live lease view, so a rule for it cannot be created.`,
      400,
    );
  }

  const ref = db
    .collection(OWNER_POLICY_RULE_COLLECTIONS.rules)
    .doc(normalized.portfolioId);
  const nowIso = new Date().toISOString();
  const prior = await ref.get();
  await ref.set({
    id: normalized.portfolioId,
    portfolio_id: normalized.portfolioId,
    kind: "flat_percent_increase",
    percent: normalized.percent,
    effective_from: normalized.effectiveFrom,
    note: normalized.note,
    updated_by_uid: actor.uid,
    ...(prior.exists ? {} : { created_at: nowIso, created_by_uid: actor.uid }),
    updated_at: nowIso,
  });

  const activityId = uuidv7();
  await db
    .collection(OWNER_POLICY_RULE_COLLECTIONS.activity)
    .doc(activityId)
    .set({
      id: activityId,
      portfolio_id: normalized.portfolioId,
      actor_uid: actor.uid,
      action: prior.exists ? "update" : "create",
      kind: "flat_percent_increase",
      percent: normalized.percent,
      effective_from: normalized.effectiveFrom,
      reason: normalized.reason,
      created_at: nowIso,
    });

  return {
    portfolioId: normalized.portfolioId,
    kind: "flat_percent_increase",
    percent: normalized.percent,
    effectiveFrom: normalized.effectiveFrom,
    note: normalized.note,
    updatedByUid: actor.uid,
    updatedAt: nowIso,
  };
}

/**
 * The ACTIVE rule for a portfolio: its effective-from date has passed as of `todayIso`. A
 * future-dated rule is returned only via listOwnerPolicyRules (Admin visibility), never applied.
 */
export async function getActiveOwnerPolicyRule(
  actor: AuthenticatedUser,
  portfolioId: string,
  todayIso: string,
  db: Firestore = getAdminFirestore(),
): Promise<OwnerPolicyRule | null> {
  assertReader(actor);
  const trimmed = String(portfolioId ?? "").trim();
  if (!PORTFOLIO_ID_RE.test(trimmed)) return null;
  const snapshot = await db
    .collection(OWNER_POLICY_RULE_COLLECTIONS.rules)
    .doc(trimmed)
    .get();
  if (!snapshot.exists) return null;
  const raw = snapshot.data() as Record<string, unknown>;
  const rule = ruleFromRecord(raw);
  if (!rule) return null;
  if (rule.effectiveFrom > todayIso.slice(0, 10)) return null;
  return rule;
}

/** Every rule, active or future-dated, for the Admin management surface. */
export async function listOwnerPolicyRules(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<OwnerPolicyRule[]> {
  assertAdmin(actor);
  const snapshot = await db.collection(OWNER_POLICY_RULE_COLLECTIONS.rules).get();
  const rules: OwnerPolicyRule[] = [];
  for (const doc of snapshot.docs) {
    const rule = ruleFromRecord((doc.data() ?? {}) as Record<string, unknown>);
    if (rule) rules.push(rule);
  }
  return rules.sort((left, right) => left.portfolioId.localeCompare(right.portfolioId));
}

function ruleFromRecord(raw: Record<string, unknown>): OwnerPolicyRule | null {
  const portfolioId = typeof raw.portfolio_id === "string" ? raw.portfolio_id : null;
  const percent = typeof raw.percent === "number" ? raw.percent : null;
  const effectiveFrom =
    typeof raw.effective_from === "string" ? raw.effective_from : null;
  const note = typeof raw.note === "string" ? raw.note : "";
  if (
    !portfolioId ||
    percent === null ||
    !Number.isFinite(percent) ||
    percent <= 0 ||
    !effectiveFrom ||
    raw.kind !== "flat_percent_increase"
  ) {
    return null;
  }
  return {
    portfolioId,
    kind: "flat_percent_increase",
    percent,
    effectiveFrom,
    note,
    updatedByUid: typeof raw.updated_by_uid === "string" ? raw.updated_by_uid : "",
    ...(typeof raw.updated_at === "string" ? { updatedAt: raw.updated_at } : {}),
  };
}
