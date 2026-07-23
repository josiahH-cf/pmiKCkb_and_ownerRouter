// Client-safe notification family catalog (console overhaul Slice 3b; extended by S17). Pure types plus
// a small catalog with NO firebase-admin / server import, so NotificationMenu (a client component), the
// /notifications hub page, and the pure feed builder share the family vocabulary without pulling the
// Admin SDK into the client bundle.
//
// The framework is IN-APP ONLY: there is no email channel here. Gmail events are value-free signals
// from already-linked renewal/maintenance threads; they do not classify or expose unrelated mail.
//
// S17 adds three AVAILABLE families so the hub is a true SUPERSET of the Console's three deck cards
// (approvals ⇒ approval_queue, connections ⇒ connections_setup, coverage ⇒ space_coverage) plus Dan's
// value-free review digest (team_review, Admin-gated at SERVE time by the route, not in this catalog).
// Each family maps to exactly one attention lane (B3), so the hub speaks the deck's + desk's vocabulary.

import type { AttentionLane, AttentionSeverity } from "@/lib/attention/lanes";

export const NOTIFICATION_FAMILY_KEYS = [
  "approval_queue",
  "maintenance_tickets",
  "connections_setup",
  "space_coverage",
  "team_review",
  "renewal_communications",
  "maintenance_communications",
  "support_reports",
] as const;

export type NotificationFamilyKey = (typeof NOTIFICATION_FAMILY_KEYS)[number];

// The per-notification EVENT source discriminant: the subset of families that produce persisted, per-user
// event notifications. mark-read / mark-all-read dispatch on it. connections_setup + space_coverage are
// STANDING conditions (no per-event read_at) and team_review is a computed DIGEST, so none are sources.
export type NotificationSource =
  | "approval_queue"
  | "maintenance_ticket"
  | "gmail_workflow";

export interface NotificationFamily {
  key: NotificationFamilyKey;
  label: string;
  description: string;
  available: boolean;
  /** The attention lane this family's signals carry (B3 shared vocabulary). */
  lane: AttentionLane;
  unavailableReason?: string;
}

// One unified notification the feed renders regardless of its origin collection. S17 stamps the shared
// `lane` + a neutral `severity` so the hub, the bell, and the deck speak one vocabulary (B3).
export interface UnifiedNotification {
  id: string;
  source: NotificationSource;
  family: NotificationFamilyKey;
  lane: AttentionLane;
  severity: AttentionSeverity;
  title: string;
  message: string;
  href: string;
  created_at: string;
  read_at?: string;
}

// A family plus the viewer's current mute state, for the menu's per-family toggles.
export interface NotificationFamilyView extends NotificationFamily {
  muted: boolean;
}

/** Connection-state fallback used by the workflow communication surface. It does not imply that the
 * product may browse an inbox when a connection exists. */
export const WAITING_ON_GMAIL = "Waiting on Gmail access";

export const NOTIFICATION_FAMILIES: readonly NotificationFamily[] = [
  {
    key: "approval_queue",
    label: "Approvals",
    description: "Queue items assigned to you or waiting on your approval.",
    available: true,
    lane: "decision",
  },
  {
    key: "maintenance_tickets",
    label: "Maintenance tickets",
    description: "Updates on maintenance tickets assigned to you.",
    available: true,
    lane: "decision",
  },
  {
    key: "connections_setup",
    label: "Connections to set up",
    description: "Connectors that still need setup before their process can run.",
    available: true,
    lane: "connection",
  },
  {
    key: "space_coverage",
    label: "Space coverage",
    description: "Spaces that still need a process or their connections.",
    available: true,
    lane: "coverage",
  },
  {
    key: "team_review",
    label: "Team review",
    description:
      "A weekly roll-up of high-risk overrides and self-corrections to review.",
    available: true,
    lane: "review",
  },
  {
    key: "renewal_communications",
    label: "Renewal communications",
    description: "Value-free attention for replies on linked renewal communication.",
    available: true,
    lane: "decision",
  },
  {
    key: "maintenance_communications",
    label: "Maintenance communications",
    description: "Value-free attention for replies on linked maintenance communication.",
    available: true,
    lane: "decision",
  },
  {
    key: "support_reports",
    label: "Feedback",
    description:
      "Value-free counts of newly-filed feedback and reports past their follow-up window (Admin only).",
    available: true,
    lane: "support",
  },
];

/** family key → its attention lane, derived from the catalog (single source of truth). */
export const FAMILY_LANE: Record<NotificationFamilyKey, AttentionLane> =
  Object.fromEntries(
    NOTIFICATION_FAMILIES.map((family) => [family.key, family.lane]),
  ) as Record<NotificationFamilyKey, AttentionLane>;

// The subset of family keys that can actually be muted (only the available in-app families). A mute
// request for a stubbed family is ignored.
export const AVAILABLE_NOTIFICATION_FAMILY_KEYS: readonly NotificationFamilyKey[] =
  NOTIFICATION_FAMILIES.filter((family) => family.available).map((family) => family.key);

export function isAvailableNotificationFamily(key: NotificationFamilyKey): boolean {
  return AVAILABLE_NOTIFICATION_FAMILY_KEYS.includes(key);
}

// Build the per-family views the menu renders, folding in the viewer's muted set. Only an available
// family can read as muted; the stubbed families are never muted (they carry no notifications).
export function buildFamilyViews(
  mutedFamilies: readonly NotificationFamilyKey[],
): NotificationFamilyView[] {
  const muted = new Set(mutedFamilies);
  return NOTIFICATION_FAMILIES.map((family) => ({
    ...family,
    muted: family.available && muted.has(family.key),
  }));
}
