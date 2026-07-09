// Client-safe notification family catalog (console overhaul Slice 3b). Pure types plus a small
// catalog with NO firebase-admin / server import, so NotificationMenu (a client component) and the
// pure feed builder can share the family vocabulary without pulling the Admin SDK into the client
// bundle.
//
// The framework is IN-APP ONLY: there is no email channel here, and the two Gmail-dependent families
// (RentVine replies, Owner replies) are stubbed available:false with "Waiting on Gmail access" until
// the client Gmail access model and the domain-wide-delegation scopes land. App-plane only: no send,
// no system-of-record write.

export const NOTIFICATION_FAMILY_KEYS = [
  "approval_queue",
  "maintenance_tickets",
  "rentvine_replies",
  "owner_process_replies",
] as const;

export type NotificationFamilyKey = (typeof NOTIFICATION_FAMILY_KEYS)[number];

// The per-notification source discriminant: the subset of families that actually produce in-app
// notifications today. mark-read dispatches on it to the right per-source reader.
export type NotificationSource = "approval_queue" | "maintenance_ticket";

export interface NotificationFamily {
  key: NotificationFamilyKey;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
}

// One unified notification the feed renders regardless of its origin collection.
export interface UnifiedNotification {
  id: string;
  source: NotificationSource;
  family: NotificationFamilyKey;
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

const WAITING_ON_GMAIL = "Waiting on Gmail access";

export const NOTIFICATION_FAMILIES: readonly NotificationFamily[] = [
  {
    key: "approval_queue",
    label: "Approvals",
    description: "Queue items assigned to you or waiting on your approval.",
    available: true,
  },
  {
    key: "maintenance_tickets",
    label: "Maintenance tickets",
    description: "Updates on maintenance tickets assigned to you.",
    available: true,
  },
  {
    key: "rentvine_replies",
    label: "RentVine replies",
    description: "Replies on RentVine conversations you are working.",
    available: false,
    unavailableReason: WAITING_ON_GMAIL,
  },
  {
    key: "owner_process_replies",
    label: "Owner replies",
    description: "Owner replies to process emails you sent.",
    available: false,
    unavailableReason: WAITING_ON_GMAIL,
  },
];

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
