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
import {
  isNotificationFamilyServed,
  type NotificationFamilyKey,
} from "@/lib/notifications/families";

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
  // S280 R-S280-5: staff see staff work. Setup and coverage notices are Admin work, and the retired
  // maintenance families are neither read nor emitted (their stored records are untouched).
  const scope = { isAdmin, canReadRenewals, canReadMaintenance };
  const servesMaintenanceTickets = isNotificationFamilyServed(
    "maintenance_tickets",
    scope,
  );
  const servesStanding =
    isNotificationFamilyServed("connections_setup", scope) ||
    isNotificationFamilyServed("space_coverage", scope);

  // These reads are independent. Starting review/support only after the event sources finish
  // adds two Firestore round trips to the full hub's critical path.
  const [preferences, approval, maintenance, gmail, coverage, decision, review, support] =
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
      canReadMaintenance && servesMaintenanceTickets
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
      full && servesStanding ? resolveCoverageState(user) : Promise.resolve(null),
      full && canReadRenewals
        ? gatherDecisionAttention(user)
        : Promise.resolve({ attention: EMPTY_DECISION_ATTENTION }),
      full && isAdmin && canReadRenewals
        ? buildReviewDigest(user)
        : Promise.resolve(null),
      // The same Admin-scoped gather also supplies the /admin panel badge.
      full && isAdmin
        ? gatherSupportAttention(user, { now }).then((attention) => attention.signals)
        : Promise.resolve([]),
    ]);

  const standing: AttentionSignal[] =
    full && coverage && servesStanding
      ? buildStandingSignals(
          resolveConnectionsState(process.env).items,
          coverage.items,
        ).filter((signal) =>
          isNotificationFamilyServed(
            STANDING_FAMILY_BY_LANE[signal.lane] ?? "approval_queue",
            scope,
          ),
        )
      : [];

  const feed = buildNotificationFeed({
    approval,
    maintenance,
    // S280 R-S280-5: no maintenance communication item is emitted while maintenance is retired.
    gmail: gmail.filter((notification) =>
      isNotificationFamilyServed(notification.family, scope),
    ),
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
    // approval_queue is intentionally NOT scope-gated (F-NOTIF-3): it is the recipient's own
    // personal action items, so it is always served to whoever those items are addressed to.
    // S280 R-S280-5: setup, coverage, review and feedback are Admin-only; maintenance is retired.
    families: feed.families.filter((family) =>
      isNotificationFamilyServed(family.key, scope),
    ),
  };
}

/** The standing families a standing signal's lane carries (B2: one family per lane). */
const STANDING_FAMILY_BY_LANE: Partial<
  Record<AttentionSignal["lane"], NotificationFamilyKey>
> = {
  connection: "connections_setup",
  coverage: "space_coverage",
};

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
