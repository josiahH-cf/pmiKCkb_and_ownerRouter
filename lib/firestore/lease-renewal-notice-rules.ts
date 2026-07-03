// V1 storage for the renewal-notice rule engine (S13 Wave 3 F1): a seedable app-plane config record
// in KB-owned Firestore. This is NOT a system of record — it holds the app's own timing rules, the
// same way process_definitions holds the app's own process metadata. One document carries the whole
// rule set (global defaults + property/lease overrides). Overrides enter via the seed/config record
// until the named follow-on Admin edit surface lands.
//
// GOVERNANCE: client-read-only (server-written through the Admin SDK boundary; see firestore.rules).
// Nothing here executes a send or a system-of-record write. Reads never throw — a missing or invalid
// document falls back to the built-in DEFAULT_NOTICE_RULE_SET (whose values are all UNVERIFIED).

import { z } from "zod";
import type { Firestore } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  DEFAULT_NOTICE_RULE_SET,
  type NoticeRuleSet,
} from "@/lib/lease-renewal/notice-rules";
import type {
  SeedFirestore,
  SeedResult,
} from "@/lib/lease-renewal/process-definition-seed";

export const NOTICE_RULE_CONFIG_COLLECTION = "lease_renewal_notice_rules";
export const NOTICE_RULE_CONFIG_DOC_ID = "active";

const ScopedNoticeRuleSchema = z.object({
  scope: z.enum(["global", "property", "lease"]),
  key: z.string().min(1).optional(),
  values: z
    .object({
      noticeDeadlineDayOfMonth: z.number().int().min(1).max(31),
      noticeDeadlineMonthOffset: z.number().int().min(-12).max(12),
      operatorWarningLeadDays: z.number().int().min(0).max(120),
      followUpIntervalDays: z.number().int().min(0).max(365),
      enabled: z.boolean(),
    })
    .partial(),
  verified: z.boolean(),
});

export const NoticeRuleSetRecordSchema = z.object({
  id: z.string().min(1),
  rules: z.array(ScopedNoticeRuleSchema).min(1),
  created_at: z.string(),
  updated_at: z.string(),
  seeded_by_uid: z.string().min(1),
});

export type NoticeRuleSetRecord = z.infer<typeof NoticeRuleSetRecordSchema>;

/** A record minus the timestamps the writer stamps. */
export type SeedableNoticeRuleConfig = Omit<
  NoticeRuleSetRecord,
  "created_at" | "updated_at"
>;

/** Pure builder: the default rule set (unverified global defaults, no overrides) as a seedable record
 *  at the fixed doc id. Callers may pass a rule set carrying Dan-confirmed overrides. */
export function buildNoticeRuleConfigRecord(options: {
  seededByUid: string;
  ruleSet?: NoticeRuleSet;
}): SeedableNoticeRuleConfig {
  const ruleSet = options.ruleSet ?? DEFAULT_NOTICE_RULE_SET;
  return {
    id: NOTICE_RULE_CONFIG_DOC_ID,
    rules: ruleSet.rules.map((rule) => ({ ...rule, values: { ...rule.values } })),
    seeded_by_uid: options.seededByUid,
  };
}

/** Idempotent writer for the notice-rule config record. Existing + !force -> skip; force -> update
 *  preserving created_at; else create. ISO timestamps come from `now` (injectable for tests). */
export async function seedNoticeRuleConfig(options: {
  db: SeedFirestore;
  record: SeedableNoticeRuleConfig;
  force?: boolean;
  now: string;
}): Promise<SeedResult> {
  // Validate the payload (defaults are still allowed to be unverified; the schema only bounds shape).
  NoticeRuleSetRecordSchema.parse({
    ...options.record,
    created_at: options.now,
    updated_at: options.now,
  });

  const ref = options.db.collection(NOTICE_RULE_CONFIG_COLLECTION).doc(options.record.id);
  const snapshot = await ref.get();
  if (snapshot.exists && !options.force) {
    return { id: options.record.id, action: "skipped" };
  }

  const existing = snapshot.data();
  const createdAt =
    snapshot.exists && typeof existing?.created_at === "string"
      ? (existing.created_at as string)
      : options.now;
  await ref.set({
    ...options.record,
    created_at: createdAt,
    updated_at: options.now,
  });
  return { id: options.record.id, action: snapshot.exists ? "updated" : "created" };
}

/** Read the effective rule set. Never throws: a missing or malformed record returns the built-in
 *  DEFAULT_NOTICE_RULE_SET (all values unverified), so a fresh environment is safe and honest. */
export async function readNoticeRuleSet(
  db: Firestore = getAdminFirestore(),
): Promise<NoticeRuleSet> {
  try {
    const snapshot = await db
      .collection(NOTICE_RULE_CONFIG_COLLECTION)
      .doc(NOTICE_RULE_CONFIG_DOC_ID)
      .get();
    if (!snapshot.exists) return DEFAULT_NOTICE_RULE_SET;
    const parsed = NoticeRuleSetRecordSchema.safeParse({
      ...snapshot.data(),
      id: snapshot.id,
    });
    if (!parsed.success) return DEFAULT_NOTICE_RULE_SET;
    return { rules: parsed.data.rules };
  } catch {
    return DEFAULT_NOTICE_RULE_SET;
  }
}
