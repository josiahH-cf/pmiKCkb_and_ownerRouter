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
import {
  EMPTY_DECISION_ATTENTION,
  gatherDecisionAttention,
} from "@/lib/attention/decision-backlog";
import { buildTeamReviewDigest } from "@/lib/attention/review-lane";
import { buildStandingSignals } from "@/lib/attention/standing-signals";
import { gatherSupportAttention } from "@/lib/attention/support-lane";
import {
  resolveConnectionsState,
  resolveCoverageState,
} from "@/lib/ask/app-state-context";
import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { listApprovalQueueNotifications } from "@/lib/firestore/approval-queue-notifications";
import { listMaintenanceTicketNotifications } from "@/lib/firestore/maintenance-ticket-notifications";
import { listGmailWorkflowNotifications } from "@/lib/gmail-hub/notifications";
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

// LR-01: the badge / tab-title unread TOTAL must be the true count, so the count-bearing source reads must
// not be truncated by each reader's small default preview cap (25). The readers already `.get()` the whole
// collection and filter in memory — the cap only trims the RETURNED array, and each set is bounded to the
// caller's OWN notifications — so requesting them uncapped is correct and adds no extra reads. The preview
// list is trimmed once, downstream, by `buildNotificationFeed`'s own `limit`.
const NOTIFICATION_SOURCE_SCAN_LIMIT = Number.MAX_SAFE_INTEGER;

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

  const [preferences, approval, maintenance, gmail, coverage, decision] =
    await Promise.all([
      getNotificationPreferences(user),
      // F-NOTIF-3: approval-queue notifications are personal, so a recipient always sees their OWN ones
      // regardless of space scope — an assignee/approver who lacks renewals scope must never be
      // dead-ended out of their own action items. Recipient-only is the reader default (LR-02); this
      // path deliberately does NOT opt into the Admin cross-recipient view. Uncapped (LR-01) so the
      // unread TOTAL is exact.
      listApprovalQueueNotifications(user, {
        unreadOnly,
        limit: NOTIFICATION_SOURCE_SCAN_LIMIT,
      }),
      canReadMaintenance
        ? listMaintenanceTicketNotifications(user, {
            unreadOnly,
            limit: NOTIFICATION_SOURCE_SCAN_LIMIT,
          })
        : Promise.resolve([]),
      canReadRenewals || canReadMaintenance
        ? listGmailWorkflowNotifications(user, {
            unreadOnly,
            limit: NOTIFICATION_SOURCE_SCAN_LIMIT,
          })
        : Promise.resolve([]),
      full ? resolveCoverageState(user) : Promise.resolve(null),
      full && canReadRenewals
        ? gatherDecisionAttention(user)
        : Promise.resolve({ attention: EMPTY_DECISION_ATTENTION }),
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

  // S39: the support (feedback) lane is Admin-scoped, gathered ONLY for an Admin hub view (mirroring the
  // review digest). The SAME gather feeds the /admin panel badge, so their counts cannot diverge.
  const support =
    full && isAdmin ? (await gatherSupportAttention(user, { now })).signals : [];

  const feed = buildNotificationFeed({
    approval,
    maintenance,
    gmail,
    standing,
    review,
    support,
    decisions: decision.attention,
    mutedFamilies: preferences.muted_families,
    preferences: toLowAlarmPreferences(preferences),
    now,
    limit: options.limit,
  });

  return {
    ...feed,
    families: feed.families.filter(
      (family) =>
        // approval_queue is intentionally NOT scope-gated (F-NOTIF-3): it is the recipient's own
        // personal action items, so it is always served to whoever those items are addressed to.
        (family.key !== "maintenance_tickets" || canReadMaintenance) &&
        (family.key !== "renewal_communications" || canReadRenewals) &&
        (family.key !== "maintenance_communications" || canReadMaintenance) &&
        (family.key !== "team_review" || isAdmin) &&
        // support_reports is Admin-only at serve time, exactly like team_review.
        (family.key !== "support_reports" || isAdmin),
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
