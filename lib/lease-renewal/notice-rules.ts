// Renewal-notice rule engine (S13 Wave 3 F1). Timing rules are DATA, not code: a typed rule set
// with three scopes (global defaults, per-property overrides, per-lease/tenant overrides) resolved
// deterministically MOST-SPECIFIC-WINS (lease > property > global). The resolver is pure — the rule
// set, the lease context, and the reference date are all inputs; no Date.now(), no I/O — mirroring
// lib/lease-renewal/cohort.ts.
//
// GOVERNANCE: every default value is UNVERIFIED (renders "Needs Verification:") until Dan confirms
// it. A number only becomes Verified when it arrives on a Dan-confirmed override in the seedable
// config record; the engine never invents a confirmed value and never sends or writes anything.
//
// The engine has four pure parts: (1) resolve the effective rule per lease with per-field
// provenance, (2) compute the notice schedule (deadline + operator warning date) with boundary-safe
// month/day math, (3) detect the per-lease notice status from the sheet facts, and (4) build a
// read-only effective-rule view for the desk/review ("Notice due by Jun 15 — property rule").

/** The four configurable timing fields plus an enabled flag. All present at the global scope. */
export interface NoticeRuleValues {
  /** Day of month the notice must be OUT by (1-31; clamped to the target month's last day). */
  noticeDeadlineDayOfMonth: number;
  /** Which month the deadline falls in, relative to the lease-end month (-1 = the month before). */
  noticeDeadlineMonthOffset: number;
  /** Operator warning lead days before the deadline. */
  operatorWarningLeadDays: number;
  /** Follow-up interval days after the notice is sent with no tenant response. */
  followUpIntervalDays: number;
  /** Whether notice tracking is enabled at this scope. */
  enabled: boolean;
}

export type NoticeRuleField = keyof NoticeRuleValues;

export type NoticeRuleScope = "global" | "property" | "lease";

/** A scoped (possibly partial) override. Global carries the full default set; property/lease may
 *  override any subset of fields. `verified` is Dan's confirmation; global defaults are unverified. */
export interface ScopedNoticeRule {
  scope: NoticeRuleScope;
  /** Property key (property scope) or lease id (lease scope); omitted for global. */
  key?: string;
  values: Partial<NoticeRuleValues>;
  /** True once Dan has confirmed these values; global defaults ship `false`. */
  verified: boolean;
}

export interface NoticeRuleSet {
  rules: ScopedNoticeRule[];
}

/** Which lease/property a resolution is for. Missing keys simply never match an override. */
export interface NoticeRuleContext {
  leaseId?: string | null;
  propertyKey?: string | null;
}

/** The note's global defaults (decision 4). Every one is a starting point Dan must confirm. */
export const DEFAULT_NOTICE_RULE_VALUES: NoticeRuleValues = {
  noticeDeadlineDayOfMonth: 15,
  noticeDeadlineMonthOffset: -1,
  operatorWarningLeadDays: 3,
  followUpIntervalDays: 10,
  enabled: true,
};

/** The seedable default rule set: one global scope carrying the (UNVERIFIED) defaults, no overrides. */
export const DEFAULT_NOTICE_RULE_SET: NoticeRuleSet = {
  rules: [
    { scope: "global", values: { ...DEFAULT_NOTICE_RULE_VALUES }, verified: false },
  ],
};

const SCOPE_PRECEDENCE: Record<NoticeRuleScope, number> = {
  global: 0,
  property: 1,
  lease: 2,
};

export interface ResolvedField<T> {
  value: T;
  /** The scope that provided this value. */
  scope: NoticeRuleScope;
  /** Whether the providing scope's value is Dan-confirmed. */
  verified: boolean;
}

export interface ResolvedNoticeRule {
  noticeDeadlineDayOfMonth: ResolvedField<number>;
  noticeDeadlineMonthOffset: ResolvedField<number>;
  operatorWarningLeadDays: ResolvedField<number>;
  followUpIntervalDays: ResolvedField<number>;
  enabled: ResolvedField<boolean>;
  /** True only when every field resolved from a Dan-confirmed override (no unverified default left). */
  fullyVerified: boolean;
}

function matchesContext(rule: ScopedNoticeRule, context: NoticeRuleContext): boolean {
  if (rule.scope === "global") return true;
  if (rule.scope === "property") {
    return (
      Boolean(rule.key) &&
      Boolean(context.propertyKey) &&
      rule.key === context.propertyKey
    );
  }
  return Boolean(rule.key) && Boolean(context.leaseId) && rule.key === context.leaseId;
}

function resolveField<K extends NoticeRuleField>(
  ruleSet: NoticeRuleSet,
  context: NoticeRuleContext,
  field: K,
): ResolvedField<NoticeRuleValues[K]> {
  // Highest precedence (lease > property > global) that both matches the context and defines the
  // field wins. Stable sort keeps the first matching rule of a given scope when keys are unique.
  const winner = ruleSet.rules
    .filter((rule) => matchesContext(rule, context) && rule.values[field] !== undefined)
    .sort(
      (left, right) => SCOPE_PRECEDENCE[right.scope] - SCOPE_PRECEDENCE[left.scope],
    )[0];

  if (winner) {
    return {
      value: winner.values[field] as NoticeRuleValues[K],
      scope: winner.scope,
      verified: winner.verified,
    };
  }
  // No scope (not even a partial global) supplied the field: fall back to the built-in default.
  return { value: DEFAULT_NOTICE_RULE_VALUES[field], scope: "global", verified: false };
}

/** Resolve the effective rule for one lease, most-specific-wins per field, with provenance. */
export function resolveNoticeRule(
  ruleSet: NoticeRuleSet,
  context: NoticeRuleContext = {},
): ResolvedNoticeRule {
  const noticeDeadlineDayOfMonth = resolveField(
    ruleSet,
    context,
    "noticeDeadlineDayOfMonth",
  );
  const noticeDeadlineMonthOffset = resolveField(
    ruleSet,
    context,
    "noticeDeadlineMonthOffset",
  );
  const operatorWarningLeadDays = resolveField(
    ruleSet,
    context,
    "operatorWarningLeadDays",
  );
  const followUpIntervalDays = resolveField(ruleSet, context, "followUpIntervalDays");
  const enabled = resolveField(ruleSet, context, "enabled");

  const fullyVerified = [
    noticeDeadlineDayOfMonth,
    noticeDeadlineMonthOffset,
    operatorWarningLeadDays,
    followUpIntervalDays,
    enabled,
  ].every((resolved) => resolved.verified);

  return {
    noticeDeadlineDayOfMonth,
    noticeDeadlineMonthOffset,
    operatorWarningLeadDays,
    followUpIntervalDays,
    enabled,
    fullyVerified,
  };
}

// --- Boundary-safe date math (UTC, no Date.now) ---------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Last calendar day (28-31) of a 1-indexed month. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Add (or subtract) whole calendar days to an ISO date, in UTC. Returns ISO YYYY-MM-DD. */
export function addDaysIso(iso: string, days: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const base = Date.UTC(parts.year, parts.month - 1, parts.day);
  const shifted = new Date(base + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export interface NoticeSchedule {
  leaseEndDateIso: string;
  /** The notice must be OUT by this date. */
  noticeDueByIso: string;
  /** The operator should be warned on this date (deadline minus the lead days). */
  operatorWarnOnIso: string;
  followUpIntervalDays: number;
}

/**
 * Compute the notice schedule for one lease. The deadline lands on `noticeDeadlineDayOfMonth` of the
 * month at `noticeDeadlineMonthOffset` relative to the lease-end month, clamped to that month's last
 * day (so day 31 in February becomes the 28th/29th), and correctly crosses year boundaries. Pure.
 */
export function computeNoticeSchedule(
  leaseEndDateIso: string,
  resolved: ResolvedNoticeRule,
): NoticeSchedule | null {
  const end = parseIso(leaseEndDateIso);
  if (!end) return null;

  // Month index arithmetic keeps year rollovers correct in both directions.
  const endMonthIndex = end.year * 12 + (end.month - 1);
  const targetMonthIndex = endMonthIndex + resolved.noticeDeadlineMonthOffset.value;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (((targetMonthIndex % 12) + 12) % 12) + 1; // 1-12

  const lastDay = lastDayOfMonth(targetYear, targetMonth);
  const day = Math.min(Math.max(resolved.noticeDeadlineDayOfMonth.value, 1), lastDay);
  const noticeDueByIso = `${targetYear}-${pad2(targetMonth)}-${pad2(day)}`;
  const operatorWarnOnIso = addDaysIso(
    noticeDueByIso,
    -Math.max(resolved.operatorWarningLeadDays.value, 0),
  );

  return {
    leaseEndDateIso,
    noticeDueByIso,
    operatorWarnOnIso,
    followUpIntervalDays: resolved.followUpIntervalDays.value,
  };
}

// --- Per-lease notice-status detector -------------------------------------------------------------

/** The sheet facts the detector reads (already-parsed, in-boundary; never committed). */
export interface LeaseNoticeFacts {
  /** RentVine read-authoritative lease end, or null when unknown. */
  leaseEndDateIso: string | null;
  /** Sheet `renewal_letter_sent` reduced to the date the letter went out, or null when blank. */
  renewalLetterSentIso: string | null;
  /** Sheet `tenant_responded` reduced to a boolean. */
  tenantResponded: boolean;
}

export type NoticeStatusCode =
  | "disabled"
  | "no_lease_end"
  | "notice_scheduled"
  | "notice_due_soon"
  | "notice_overdue"
  | "awaiting_response"
  | "follow_up_due"
  | "responded";

export interface NoticeStatus {
  code: NoticeStatusCode;
  schedule: NoticeSchedule | null;
  /** For the follow-up path: the date the follow-up is/was due (sent + interval). */
  followUpDueByIso: string | null;
}

/**
 * Detect one lease's notice status from the resolved rule, the sheet facts, and a reference date
 * (all inputs — no Date.now). Decision order (first wins):
 *   1. rule disabled -> disabled
 *   2. no lease end -> no_lease_end
 *   3. tenant already responded -> responded
 *   4. notice sent -> follow_up_due (ref >= sent + interval) else awaiting_response
 *   5. notice not sent -> notice_overdue (ref > due) / notice_due_soon (ref >= warn) / notice_scheduled
 */
export function detectNoticeStatus(
  resolved: ResolvedNoticeRule,
  facts: LeaseNoticeFacts,
  referenceDateIso: string,
): NoticeStatus {
  if (!resolved.enabled.value) {
    return { code: "disabled", schedule: null, followUpDueByIso: null };
  }
  if (!facts.leaseEndDateIso) {
    return { code: "no_lease_end", schedule: null, followUpDueByIso: null };
  }

  const schedule = computeNoticeSchedule(facts.leaseEndDateIso, resolved);
  if (!schedule) {
    return { code: "no_lease_end", schedule: null, followUpDueByIso: null };
  }

  if (facts.tenantResponded) {
    return { code: "responded", schedule, followUpDueByIso: null };
  }

  if (facts.renewalLetterSentIso) {
    const followUpDueByIso = addDaysIso(
      facts.renewalLetterSentIso,
      Math.max(schedule.followUpIntervalDays, 0),
    );
    const code: NoticeStatusCode =
      referenceDateIso >= followUpDueByIso ? "follow_up_due" : "awaiting_response";
    return { code, schedule, followUpDueByIso };
  }

  let code: NoticeStatusCode = "notice_scheduled";
  if (referenceDateIso > schedule.noticeDueByIso) {
    code = "notice_overdue";
  } else if (referenceDateIso >= schedule.operatorWarnOnIso) {
    code = "notice_due_soon";
  }
  return { code, schedule, followUpDueByIso: null };
}

// --- Read-only effective-rule view (F2) -----------------------------------------------------------

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Format an ISO date as "Jun 15, 2026" for read-only display. Returns the input if unparseable. */
export function formatNoticeDate(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  return `${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

/** Human label for where a value came from: "default" for an unconfirmed global, else "<scope> rule". */
export function provenanceLabel(scope: NoticeRuleScope, verified: boolean): string {
  if (scope === "global") return verified ? "global rule" : "default";
  return `${scope} rule`;
}

export interface NoticeStatusLabels {
  /** Short human status, e.g. "Notice due soon". */
  status: string;
}

const STATUS_LABELS: Record<NoticeStatusCode, string> = {
  disabled: "Notice tracking off",
  no_lease_end: "No lease end on file",
  notice_scheduled: "Notice scheduled",
  notice_due_soon: "Notice due soon",
  notice_overdue: "Notice overdue",
  awaiting_response: "Awaiting tenant response",
  follow_up_due: "Follow-up due",
  responded: "Tenant responded",
};

export interface EffectiveRuleLine {
  label: string;
  value: string;
  /** "default" / "property rule" / "lease rule" / "global rule". */
  provenance: string;
  /** True when the value is an unconfirmed default (render "Needs Verification:"). */
  needsVerification: boolean;
}

export interface EffectiveRuleView {
  statusLabel: string;
  lines: EffectiveRuleLine[];
  /** True when any surfaced value is still an unconfirmed default. */
  hasUnverified: boolean;
}

/** The deadline provenance combines the day-of-month and month-offset fields: it is the more specific
 *  of the two, and only "verified" when BOTH are. */
function deadlineProvenance(resolved: ResolvedNoticeRule): {
  scope: NoticeRuleScope;
  verified: boolean;
} {
  const day = resolved.noticeDeadlineDayOfMonth;
  const month = resolved.noticeDeadlineMonthOffset;
  const scope =
    SCOPE_PRECEDENCE[day.scope] >= SCOPE_PRECEDENCE[month.scope]
      ? day.scope
      : month.scope;
  return { scope, verified: day.verified && month.verified };
}

/**
 * Build the read-only effective-rule view for the desk/review. Value-bearing dates render only on
 * the live in-boundary surface (never committed, never on a value-free queue). Each line carries its
 * provenance and a Needs-Verification flag so an unconfirmed default is always visibly unconfirmed.
 */
export function buildEffectiveRuleView(
  resolved: ResolvedNoticeRule,
  status: NoticeStatus,
): EffectiveRuleView {
  const lines: EffectiveRuleLine[] = [];

  if (status.schedule) {
    const deadline = deadlineProvenance(resolved);
    lines.push({
      label: "Notice due by",
      value: formatNoticeDate(status.schedule.noticeDueByIso),
      provenance: provenanceLabel(deadline.scope, deadline.verified),
      needsVerification: !deadline.verified,
    });
    // The warn date is DERIVED from the deadline (warnOn = deadline - leadDays), so it inherits the
    // deadline's confirmation: it is only "verified" when the deadline AND the lead days are BOTH
    // confirmed. Otherwise a warn date computed from an unconfirmed default deadline would render as
    // confirmed — masking the very default the engine must flag Needs Verification.
    const lead = resolved.operatorWarningLeadDays;
    const warnVerified = deadline.verified && lead.verified;
    // When unverified, surface the unconfirmed contributor's scope so a default is not hidden behind a
    // more-specific confirmed field; when both are confirmed, use the more specific scope.
    const warnScope = warnVerified
      ? SCOPE_PRECEDENCE[deadline.scope] >= SCOPE_PRECEDENCE[lead.scope]
        ? deadline.scope
        : lead.scope
      : deadline.verified
        ? lead.scope
        : deadline.scope;
    lines.push({
      label: "Warn operator on",
      value: formatNoticeDate(status.schedule.operatorWarnOnIso),
      provenance: provenanceLabel(warnScope, warnVerified),
      needsVerification: !warnVerified,
    });
  }

  if (status.followUpDueByIso) {
    lines.push({
      label: "Follow-up due",
      value: formatNoticeDate(status.followUpDueByIso),
      provenance: provenanceLabel(
        resolved.followUpIntervalDays.scope,
        resolved.followUpIntervalDays.verified,
      ),
      needsVerification: !resolved.followUpIntervalDays.verified,
    });
  }

  return {
    statusLabel: STATUS_LABELS[status.code],
    lines,
    hasUnverified: lines.some((line) => line.needsVerification),
  };
}

// --- Rule-level summary (context-free effective rule, for the Space desk) --------------------------

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function describeMonthOffset(offset: number): string {
  if (offset === 0) return "the lease-end month";
  if (offset === -1) return "the month before lease end";
  if (offset < -1) return `${Math.abs(offset)} months before lease end`;
  if (offset === 1) return "the month after lease end";
  return `${offset} months after lease end`;
}

/**
 * Build a read-only description of the effective RULE itself (not a specific lease's dates), for the
 * Space desk where no single lease is selected. Each line carries provenance and a Needs-Verification
 * flag so an unconfirmed default reads as unconfirmed.
 */
export function buildNoticeRuleSummary(resolved: ResolvedNoticeRule): EffectiveRuleView {
  const deadline = deadlineProvenance(resolved);
  const lines: EffectiveRuleLine[] = [
    {
      label: "Notice deadline",
      value: `By the ${ordinal(resolved.noticeDeadlineDayOfMonth.value)} of ${describeMonthOffset(
        resolved.noticeDeadlineMonthOffset.value,
      )}`,
      provenance: provenanceLabel(deadline.scope, deadline.verified),
      needsVerification: !deadline.verified,
    },
    {
      label: "Operator warning",
      value: `${resolved.operatorWarningLeadDays.value} day(s) before the deadline`,
      provenance: provenanceLabel(
        resolved.operatorWarningLeadDays.scope,
        resolved.operatorWarningLeadDays.verified,
      ),
      needsVerification: !resolved.operatorWarningLeadDays.verified,
    },
    {
      label: "Follow-up",
      value: `${resolved.followUpIntervalDays.value} day(s) after the notice with no response`,
      provenance: provenanceLabel(
        resolved.followUpIntervalDays.scope,
        resolved.followUpIntervalDays.verified,
      ),
      needsVerification: !resolved.followUpIntervalDays.verified,
    },
  ];

  return {
    statusLabel: resolved.enabled.value ? "Notice tracking on" : "Notice tracking off",
    lines,
    hasUnverified: lines.some((line) => line.needsVerification),
  };
}
