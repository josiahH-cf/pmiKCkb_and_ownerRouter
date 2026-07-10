// S17 B4 — the low-alarm resolver. Pure, client-safe primitives that shape what the IN-APP feed shows
// (they deliver nothing — email stays hard-off). Three additive per-user controls layer on top of the
// existing per-family mute:
//   - lane_thresholds: a per-lane MINIMUM severity; a signal below it is hidden.
//   - snoozed_lanes:   a per-lane snooze-until ISO; the lane is silent until it expires.
//   - digest_lanes:    a lane whose many rows collapse to ONE digest row (see collapse in the feed).
//
// Pure and deterministic: `now` is always passed in (never Date.now()), so the resolver is testable and
// resume-safe. A missing/empty preference is a no-op, so the default behavior is unchanged (AC-S17-5).

import {
  meetsSeverityThreshold,
  type AttentionLane,
  type AttentionSeverity,
} from "@/lib/attention/lanes";

export interface LowAlarmPreferences {
  /** Per-lane minimum severity; a signal below it is hidden. Absent lane ⇒ no threshold. */
  lane_thresholds?: Partial<Record<AttentionLane, AttentionSeverity>>;
  /** Per-lane snooze-until as an ISO timestamp; the lane is silent until `now` passes it. */
  snoozed_lanes?: Partial<Record<AttentionLane, string>>;
  /** Lanes that collapse to a single digest row instead of listing every row. */
  digest_lanes?: readonly AttentionLane[];
}

/** The minimal shape the resolver reads from any signal or event. */
export interface LaneScored {
  lane: AttentionLane;
  severity: AttentionSeverity;
}

/** A lane is snoozed when its snooze-until is strictly after `now`. Both are parsed as instants, so a
 *  differing ISO offset never mis-compares. An unparseable timestamp is treated as NOT snoozed (fail
 *  loud toward showing the signal, never silently hiding work). */
export function isLaneSnoozed(
  lane: AttentionLane,
  prefs: LowAlarmPreferences,
  now: string,
): boolean {
  const until = prefs.snoozed_lanes?.[lane];
  if (!until) return false;
  const untilMs = new Date(until).getTime();
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(untilMs) || Number.isNaN(nowMs)) return false;
  return untilMs > nowMs;
}

/** A signal passes its lane's severity threshold (or there is no threshold for that lane). */
export function passesLaneThreshold(
  item: LaneScored,
  prefs: LowAlarmPreferences,
): boolean {
  const threshold = prefs.lane_thresholds?.[item.lane];
  return threshold === undefined || meetsSeverityThreshold(item.severity, threshold);
}

/** Whether a lane is configured to collapse into a single digest row. */
export function isLaneDigested(lane: AttentionLane, prefs: LowAlarmPreferences): boolean {
  return (prefs.digest_lanes ?? []).includes(lane);
}

/** Drop every item whose lane is snoozed or that is below its lane threshold. Order is preserved. */
export function applyLowAlarm<T extends LaneScored>(
  items: readonly T[],
  prefs: LowAlarmPreferences,
  now: string,
): T[] {
  return items.filter(
    (item) => !isLaneSnoozed(item.lane, prefs, now) && passesLaneThreshold(item, prefs),
  );
}

/** The highest severity present in a set of items, or "low" when empty. Used to score a digest row. */
export function peakSeverity(items: readonly LaneScored[]): AttentionSeverity {
  let peak: AttentionSeverity = "low";
  for (const item of items) {
    if (meetsSeverityThreshold(item.severity, "high")) return "high";
    if (item.severity === "medium") peak = "medium";
  }
  return peak;
}
