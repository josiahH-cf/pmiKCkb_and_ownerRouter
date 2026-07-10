// S17 — the ONE server-side assembly path for the unified notification hub, shared by GET
// /api/notifications (the bell + the hub page's client refresh) and the /notifications server page, so
// the hub and the bell never diverge. It gathers the event log (approvals + maintenance), the B2 standing
// setup signals, and the B5 Admin-only review digest, then runs the pure `buildNotificationFeed` (lane
// stamp + low-alarm) and filters the served families by scope + Admin.
//
// Non-fatal by construction: each read degrades independently (the underlying readers/resolvers try/catch
// to empty), so a Firestore hiccup yields a thinner feed, never a thrown error. Makes ZERO external calls
// (no RentVine / Sheet / Gmail client) — only the app's own Firestore + process.env.

import type { AttentionSignal } from "@/lib/attention/lanes";
import { buildTeamReviewDigest } from "@/lib/attention/review-lane";
import { buildStandingSignals } from "@/lib/attention/standing-signals";
import {
  resolveConnectionsState,
  resolveCoverageState,
} from "@/lib/ask/app-state-context";
import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { listApprovalQueueNotifications } from "@/lib/firestore/approval-queue-notifications";
import { listMaintenanceTicketNotifications } from "@/lib/firestore/maintenance-ticket-notifications";
import {
  getNotificationPreferences,
  toLowAlarmPreferences,
} from "@/lib/firestore/notification-preferences";
import { listAllLeaseRenewalResolutions } from "@/lib/firestore/lease-renewal-resolutions";
import { listAllWritebackApprovals } from "@/lib/firestore/lease-renewal-writeback-approvals";
import { buildDecisionMetrics } from "@/lib/lease-renewal/decision-metrics";
import { buildNotificationFeed, type NotificationFeed } from "@/lib/notifications/feed";

export interface LoadNotificationHubOptions {
  /** Hub view: also gather the standing setup signals + the Admin review digest. The bell omits it. */
  full?: boolean;
  unreadOnly?: boolean;
  limit?: number;
  /** ISO instant for snooze evaluation. Defaults to now. */
  now?: string;
}

export async function loadNotificationHub(
  user: AuthenticatedUser,
  options: LoadNotificationHubOptions = {},
): Promise<NotificationFeed> {
  const full = options.full ?? false;
  const unreadOnly = options.unreadOnly ?? false;
  const now = options.now ?? new Date().toISOString();

  const canReadRenewals = hasSpaceAccess(user, "renewals");
  const canReadMaintenance = hasSpaceAccess(user, "maintenance");
  const isAdmin = can(user.role, "manageAdmin");

  const [preferences, approval, maintenance, coverage] = await Promise.all([
    getNotificationPreferences(user),
    canReadRenewals
      ? listApprovalQueueNotifications(user, { recipientOnly: true, unreadOnly })
      : Promise.resolve([]),
    canReadMaintenance
      ? listMaintenanceTicketNotifications(user, { unreadOnly })
      : Promise.resolve([]),
    full ? resolveCoverageState(user) : Promise.resolve(null),
  ]);

  const standing: AttentionSignal[] =
    full && coverage
      ? buildStandingSignals(
          resolveConnectionsState(process.env, user).items,
          coverage.items,
        )
      : [];

  const review =
    full && isAdmin && canReadRenewals ? await buildReviewDigest(user) : null;

  const feed = buildNotificationFeed({
    approval,
    maintenance,
    standing,
    review,
    mutedFamilies: preferences.muted_families,
    preferences: toLowAlarmPreferences(preferences),
    now,
    limit: options.limit,
  });

  return {
    ...feed,
    families: feed.families.filter(
      (family) =>
        (family.key !== "approval_queue" || canReadRenewals) &&
        (family.key !== "maintenance_tickets" || canReadMaintenance) &&
        (family.key !== "team_review" || isAdmin),
    ),
  };
}

async function buildReviewDigest(
  user: AuthenticatedUser,
): Promise<AttentionSignal | null> {
  try {
    const [resolutions, approvals] = await Promise.all([
      listAllLeaseRenewalResolutions(user),
      listAllWritebackApprovals(user),
    ]);
    return buildTeamReviewDigest(buildDecisionMetrics({ resolutions, approvals }));
  } catch {
    return null;
  }
}
