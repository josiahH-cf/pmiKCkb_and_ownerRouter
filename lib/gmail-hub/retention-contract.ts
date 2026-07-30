/**
 * Browser-safe communications-retention catalog. Keep provider, hashing, validation, and Firestore
 * behavior in `retention-policy.ts`; client components may import this constants-only boundary.
 */
export const COMMUNICATIONS_RETENTION_POLICY_VERSION =
  "communications-retention:v1.0" as const;

export const COMMUNICATIONS_RETENTION_CLASSES = [
  "confirmation",
  "push_dedupe",
  "sync_audit",
  "workflow_link",
  "bodyless_audit",
] as const;

export type CommunicationsRetentionClass =
  (typeof COMMUNICATIONS_RETENTION_CLASSES)[number];

const DAY_MS = 24 * 60 * 60 * 1_000;

export const COMMUNICATIONS_RETENTION_MS = Object.freeze({
  confirmation: 30 * DAY_MS,
  push_dedupe: 7 * DAY_MS,
  sync_audit: 90 * DAY_MS,
  workflow_link: 365 * DAY_MS,
  bodyless_audit: 7 * 365 * DAY_MS,
}) satisfies Readonly<Record<CommunicationsRetentionClass, number>>;

export const GMAIL_CONFIRMATION_USABILITY_MS = 10 * 60 * 1_000;

export const COMMUNICATIONS_RETENTION_TARGETS = Object.freeze({
  gmail_send_confirmations: "confirmation",
  gmail_send_audit: "bodyless_audit",
  gmail_push_dedupe: "push_dedupe",
  gmail_sync_audit: "sync_audit",
  gmail_workflow_communications: "workflow_link",
  gmail_workflow_communication_audit: "bodyless_audit",
  gmail_retention_audit: "bodyless_audit",
  gmail_retention_cleanup_runs: "bodyless_audit",
}) satisfies Readonly<Record<string, CommunicationsRetentionClass>>;

export type CommunicationsRetentionCollection =
  keyof typeof COMMUNICATIONS_RETENTION_TARGETS;

export const DEFAULT_COMMUNICATIONS_CLEANUP_LIMIT = 500;
export const MAX_COMMUNICATIONS_CLEANUP_LIMIT = 5_000;
