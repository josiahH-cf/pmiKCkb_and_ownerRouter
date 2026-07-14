// Pure notification feed builder (console overhaul Slice 3b; superset-ified by S17). Merges the per-user
// approval-queue and maintenance-ticket EVENT records into one unified, newest-first log, adds the two
// STANDING setup families (connections + coverage) and Dan's Admin-only review DIGEST so the hub is a
// true SUPERSET of the Console's three deck cards, stamps every row with the shared attention lane (B3),
// and applies the low-alarm layer (mute + per-lane threshold / snooze / digest, B4). Pure and
// client-safe: it accepts already-fetched records + already-built value-free signals and imports record
// shapes with `import type` only, so no firebase-admin module reaches a client bundle. It makes ZERO
// external calls (AC-S17-8).

import type { ApprovalQueueNotificationRecord } from "@/lib/firestore/types";
import type { MaintenanceTicketNotificationRecord } from "@/lib/firestore/maintenance-ticket-notifications";
import type { DecisionAttentionBacklog } from "@/lib/attention/decision-backlog";
import {
  ATTENTION_LANE_META,
  type AttentionLane,
  type AttentionSeverity,
  type AttentionSignal,
} from "@/lib/attention/lanes";
import {
  applyLowAlarm,
  isLaneDigested,
  isLaneSnoozed,
  passesLaneThreshold,
  type LowAlarmPreferences,
} from "@/lib/notifications/low-alarm";
import {
  buildFamilyViews,
  FAMILY_LANE,
  type NotificationFamilyKey,
  type NotificationFamilyView,
  type UnifiedNotification,
} from "@/lib/notifications/families";

// Event notifications carry no severity of their own; a persisted approval/maintenance update is
// mid-band by default, so lane thresholds above medium hide them and a "low" threshold keeps them.
const DEFAULT_EVENT_SEVERITY: AttentionSeverity = "medium";

export interface BuildNotificationFeedInput {
  approval: readonly ApprovalQueueNotificationRecord[];
  maintenance: readonly MaintenanceTicketNotificationRecord[];
  /** Bodyless, already-authorized Gmail workflow attention assembled server-side. */
  gmail?: readonly UnifiedNotification[];
  /** B2 standing setup signals (connections_setup, space_coverage) — true-now state, no read_at. */
  standing?: readonly AttentionSignal[];
  /** B5 Admin-only review digest, already gated to an Admin viewer by the caller. */
  review?: AttentionSignal | null;
  /** Canonical needs-decision backlog shared with Console; value-free and read-only. */
  decisions?: DecisionAttentionBacklog;
  mutedFamilies?: readonly NotificationFamilyKey[];
  /** B4 low-alarm preferences (per-lane threshold / snooze / digest). */
  preferences?: LowAlarmPreferences;
  /** ISO instant for snooze-expiry evaluation; required for snooze to apply. */
  now?: string;
  limit?: number;
}

export interface NotificationFeed {
  /** The time-ordered EVENT log (approvals + maintenance), lane-stamped, low-alarm applied. */
  notifications: UnifiedNotification[];
  /** B2 standing setup signals surviving mute / threshold / snooze. */
  standing: AttentionSignal[];
  /** B5 review digest surviving mute / threshold / snooze, or null. */
  review: AttentionSignal | null;
  /** Actionable decisions are a standing backlog, not unread event notifications. */
  decisions: DecisionAttentionBacklog;
  families: NotificationFamilyView[];
}

export function buildNotificationFeed(
  input: BuildNotificationFeedInput,
): NotificationFeed {
  const muted = new Set(input.mutedFamilies ?? []);
  const mutedLanes = new Set<AttentionLane>(
    [...muted].map((family) => FAMILY_LANE[family]),
  );
  const prefs: LowAlarmPreferences = input.preferences ?? {};
  const now = input.now ?? "";
  const limit = input.limit ?? 25;

  // 1. Event log: map, drop muted families, sort newest-first, apply per-lane threshold + snooze, then
  //    collapse any digested lane to one row, then cap.
  const events = [
    ...input.approval.map(toUnifiedFromApproval),
    ...input.maintenance.map(toUnifiedFromMaintenance),
    ...(input.gmail ?? []),
  ]
    .filter((notification) => !muted.has(notification.family))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const filteredEvents = applyLowAlarm(events, prefs, now);
  const notifications = collapseDigestedLanes(filteredEvents, prefs).slice(0, limit);

  // 2. Standing signals: drop muted lanes, then threshold + snooze (a standing family maps 1:1 to a
  //    lane, so a family mute is a lane mute here). Standing conditions are never digested.
  const standing = (input.standing ?? []).filter(
    (signal) =>
      !mutedLanes.has(signal.lane) &&
      !isLaneSnoozed(signal.lane, prefs, now) &&
      passesLaneThreshold(signal, prefs),
  );

  // 3. Review digest: kept only if present, its lane not muted, not snoozed, and above threshold.
  const review =
    input.review &&
    !mutedLanes.has(input.review.lane) &&
    !isLaneSnoozed(input.review.lane, prefs, now) &&
    passesLaneThreshold(input.review, prefs)
      ? input.review
      : null;

  return {
    notifications,
    standing,
    review,
    decisions: input.decisions ?? { count: 0, signals: [] },
    families: buildFamilyViews([...muted]),
  };
}

// Collapse each digested lane's rows into ONE digest row (B4), preserving non-digested rows and re-
// sorting newest-first. A lane with N events becomes a single "N <lane label>" row (AC-S17-5).
function collapseDigestedLanes(
  events: readonly UnifiedNotification[],
  prefs: LowAlarmPreferences,
): UnifiedNotification[] {
  const digestLanes = new Set<AttentionLane>(
    (prefs.digest_lanes ?? []).filter((lane) => isLaneDigested(lane, prefs)),
  );
  if (digestLanes.size === 0) return [...events];

  const passthrough: UnifiedNotification[] = [];
  const byLane = new Map<AttentionLane, UnifiedNotification[]>();
  for (const event of events) {
    if (!digestLanes.has(event.lane)) {
      passthrough.push(event);
      continue;
    }
    const laneEvents = byLane.get(event.lane) ?? [];
    laneEvents.push(event);
    byLane.set(event.lane, laneEvents);
  }

  for (const [lane, laneEvents] of byLane) {
    const newest = laneEvents.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
    const meta = ATTENTION_LANE_META[lane];
    passthrough.push({
      ...newest,
      id: `digest:${lane}`,
      title: `${laneEvents.length} ${meta.label}`,
      message: `${laneEvents.length} update${laneEvents.length === 1 ? "" : "s"} rolled up`,
    });
  }

  return passthrough.sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
}

function toUnifiedFromApproval(
  record: ApprovalQueueNotificationRecord,
): UnifiedNotification {
  return {
    id: record.id,
    source: "approval_queue",
    family: "approval_queue",
    lane: FAMILY_LANE.approval_queue,
    severity: DEFAULT_EVENT_SEVERITY,
    title: record.title,
    message: record.message,
    href: `/approval-queue?item_id=${encodeURIComponent(record.item_id)}`,
    created_at: record.created_at,
    ...(record.read_at ? { read_at: record.read_at } : {}),
  };
}

function toUnifiedFromMaintenance(
  record: MaintenanceTicketNotificationRecord,
): UnifiedNotification {
  return {
    id: record.id,
    source: "maintenance_ticket",
    family: "maintenance_tickets",
    lane: FAMILY_LANE.maintenance_tickets,
    severity: DEFAULT_EVENT_SEVERITY,
    title: record.title,
    message: record.message,
    href: record.href,
    created_at: record.created_at,
    ...(record.read_at ? { read_at: record.read_at } : {}),
  };
}
