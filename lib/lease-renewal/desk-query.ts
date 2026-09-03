import type { DateWindow } from "@/lib/lease-renewal/cohort";
import type {
  DeskLeaseSummary,
  DeskLeaseSummaryBase,
  RenewalDeskQueryKeys,
  RenewalDeskWaitingKey,
} from "@/lib/lease-renewal/desk-model";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";

export const RENEWAL_DESK_SORTS = [
  "due",
  "end_date",
  "month",
  "owner",
  "tenant",
  "workflow_step",
  "waiting_on",
  "conflicts",
] as const;
export type RenewalDeskSort = (typeof RENEWAL_DESK_SORTS)[number];

export const RENEWAL_DESK_DUE_STATES = [
  "due",
  "not_due",
  "needs_verification",
  "unset",
  "disabled",
  "not_applicable",
] as const satisfies readonly RenewalFollowUpProjection["due"]["state"][];
export type RenewalDeskDueFilter = "all" | (typeof RENEWAL_DESK_DUE_STATES)[number];

export const RENEWAL_DESK_WAITING_STATES = [
  "owner",
  "tenant",
  "team",
  "document_coordinator",
  "unresolved_source",
  "not_waiting",
  "needs_verification",
] as const satisfies readonly RenewalDeskWaitingKey[];
export type RenewalDeskWaitingFilter =
  | "all"
  | (typeof RENEWAL_DESK_WAITING_STATES)[number];

export interface RenewalDeskQueryState {
  q: string;
  sort: RenewalDeskSort;
  direction: "asc" | "desc";
  scope: "active" | "tracked" | "all";
  /** Empty means all, `missing` means no end date, otherwise exact ISO date. */
  endDate: "" | "missing" | string;
  /** Empty means all, otherwise YYYY-MM. */
  month: "" | string;
  due: RenewalDeskDueFilter;
  /** Exact displayed source label; empty means all. */
  owner: string;
  /** Exact displayed source label; empty means all. */
  tenant: string;
  /** Stable renewal-v1 step id, `needs_verification`, or empty for all. */
  step: string;
  waiting: RenewalDeskWaitingFilter;
  conflicts: "all" | "with" | "without";
}

export const DEFAULT_RENEWAL_DESK_QUERY: Readonly<RenewalDeskQueryState> = {
  q: "",
  sort: "due",
  direction: "asc",
  scope: "active",
  endDate: "",
  month: "",
  due: "all",
  owner: "",
  tenant: "",
  step: "",
  waiting: "all",
  conflicts: "all",
};

type SearchParamRecord = Record<string, string | string[] | undefined>;

function param(
  input: URLSearchParams | SearchParamRecord,
  key: string,
): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

function boundedText(value: string | undefined, maxLength = 120): string {
  return (value ?? "").trim().slice(0, maxLength);
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

/** Parse untrusted URL state into one bounded, deterministic query contract. */
export function parseRenewalDeskQuery(
  input: URLSearchParams | SearchParamRecord = {},
): RenewalDeskQueryState {
  const endDate = boundedText(param(input, "endDate"), 10);
  const month = boundedText(param(input, "month"), 7);
  const step = boundedText(param(input, "step"), 64);
  return {
    q: boundedText(param(input, "q")),
    sort: oneOf(param(input, "sort"), RENEWAL_DESK_SORTS, "due"),
    direction: oneOf(param(input, "direction"), ["asc", "desc"] as const, "asc"),
    scope: oneOf(param(input, "scope"), ["active", "tracked", "all"] as const, "active"),
    endDate: endDate === "missing" || isIsoDate(endDate) ? endDate : "",
    month: /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ? month : "",
    due: oneOf(param(input, "due"), ["all", ...RENEWAL_DESK_DUE_STATES] as const, "all"),
    owner: boundedText(param(input, "owner")),
    tenant: boundedText(param(input, "tenant")),
    step: /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|needs_verification)$/.test(step) ? step : "",
    waiting: oneOf(
      param(input, "waiting"),
      ["all", ...RENEWAL_DESK_WAITING_STATES] as const,
      "all",
    ),
    conflicts: oneOf(
      param(input, "conflicts"),
      ["all", "with", "without"] as const,
      "all",
    ),
  };
}

/** Stable URL encoding. Defaults are omitted; clearing q therefore retains every selected control. */
export function serializeRenewalDeskQuery(query: RenewalDeskQueryState): string {
  const params = new URLSearchParams();
  const entries: readonly (readonly [keyof RenewalDeskQueryState, string])[] = [
    ["q", query.q],
    ["sort", query.sort],
    ["direction", query.direction],
    ["scope", query.scope],
    ["endDate", query.endDate],
    ["month", query.month],
    ["due", query.due],
    ["owner", query.owner],
    ["tenant", query.tenant],
    ["step", query.step],
    ["waiting", query.waiting],
    ["conflicts", query.conflicts],
  ];
  for (const [key, value] of entries) {
    if (value !== DEFAULT_RENEWAL_DESK_QUERY[key] && value !== "") {
      params.set(key, value);
    }
  }
  return params.toString();
}

/** Case, punctuation, spacing, and diacritic-insensitive operator lookup key. */
export function normalizeRenewalDeskText(value: string): string {
  return (value.normalize("NFKD").match(/[\p{L}\p{N}]+/gu) ?? [])
    .join(" ")
    .toLocaleLowerCase("en-US");
}

function compactNormalized(value: string): string {
  return value.replaceAll(" ", "");
}

function waitingKey(followUp: DeskLeaseSummaryBase["followUp"]): RenewalDeskWaitingKey {
  if (!followUp || followUp.waiting.state === "needs_verification") {
    return "needs_verification";
  }
  if (followUp.waiting.state === "not_waiting" || !followUp.waiting.party) {
    return "not_waiting";
  }
  return followUp.waiting.party;
}

/** Attach the exact query index to the serializable lease projection. */
export function withRenewalDeskQueryKeys(
  summary: DeskLeaseSummaryBase,
): DeskLeaseSummary {
  const ownerLabels = summary.identity.owners.map((fact) => fact.label);
  const tenantLabels = summary.identity.tenants.map((fact) => fact.label);
  const exactSearchLabels = [
    summary.identity.address?.label,
    summary.identity.property?.label,
    ...tenantLabels,
    ...ownerLabels,
  ].filter((value): value is string => Boolean(value));
  const dueState = summary.followUp?.due.state ?? "needs_verification";
  const queryKeys: RenewalDeskQueryKeys = {
    normalizedLeaseId: normalizeRenewalDeskText(summary.id).replaceAll(" ", ""),
    normalizedSearchText: normalizeRenewalDeskText(exactSearchLabels.join(" ")),
    endDateIso: summary.endDateIso,
    endMonth: summary.endDateIso?.slice(0, 7) ?? null,
    ownerLabels,
    normalizedOwners: ownerLabels.map(normalizeRenewalDeskText),
    tenantLabels,
    normalizedTenants: tenantLabels.map(normalizeRenewalDeskText),
    workflowStepId: summary.workflowStepId,
    workflowStepIndex: summary.workflowStepId ? summary.stageIndex : null,
    waitingOn: waitingKey(summary.followUp),
    dueState,
    dueAtIso: summary.followUp?.due.atIso ?? null,
    sourceConflictCount: summary.workflowStepId === null ? null : summary.openConflicts,
    leaseTerm: summary.leaseTerm.term,
    nextReviewIso: summary.leaseTerm.nextReviewIso,
  };
  return { ...summary, queryKeys };
}

function sameNormalizedLabel(values: readonly string[], selected: string): boolean {
  const normalized = normalizeRenewalDeskText(selected);
  const compact = compactNormalized(normalized);
  return (
    normalized !== "" &&
    values.some((value) => value === normalized || compactNormalized(value) === compact)
  );
}

function inScope(item: DeskLeaseSummary, scope: RenewalDeskQueryState["scope"]): boolean {
  if (scope === "all") return true;
  if (scope === "tracked") return item.retention.state === "tracked_incomplete";
  return item.retention.state !== "outside";
}

function matchesQuery(item: DeskLeaseSummary, query: RenewalDeskQueryState): boolean {
  if (!inScope(item, query.scope)) return false;
  const normalizedQuery = normalizeRenewalDeskText(query.q);
  if (query.q && normalizedQuery === "") return false;
  if (normalizedQuery) {
    const normalizedId = compactNormalized(normalizedQuery);
    const compactQuery = compactNormalized(normalizedQuery);
    if (
      normalizedId !== item.queryKeys.normalizedLeaseId &&
      !item.queryKeys.normalizedSearchText.includes(normalizedQuery) &&
      !compactNormalized(item.queryKeys.normalizedSearchText).includes(compactQuery)
    ) {
      return false;
    }
  }
  if (
    query.endDate === "missing"
      ? item.queryKeys.endDateIso !== null
      : query.endDate && item.queryKeys.endDateIso !== query.endDate
  ) {
    return false;
  }
  if (query.month && item.queryKeys.endMonth !== query.month) return false;
  if (query.due !== "all" && item.queryKeys.dueState !== query.due) return false;
  if (query.owner && !sameNormalizedLabel(item.queryKeys.normalizedOwners, query.owner)) {
    return false;
  }
  if (
    query.tenant &&
    !sameNormalizedLabel(item.queryKeys.normalizedTenants, query.tenant)
  ) {
    return false;
  }
  if (query.step) {
    const step = item.queryKeys.workflowStepId ?? "needs_verification";
    if (step !== query.step) return false;
  }
  if (query.waiting !== "all" && item.queryKeys.waitingOn !== query.waiting) {
    return false;
  }
  if (query.conflicts === "with") {
    if ((item.queryKeys.sourceConflictCount ?? 0) <= 0) return false;
  } else if (query.conflicts === "without") {
    if (item.queryKeys.sourceConflictCount !== 0) return false;
  }
  return true;
}

function comparePresent<T>(
  left: T | null,
  right: T | null,
  direction: RenewalDeskQueryState["direction"],
  compare: (a: T, b: T) => number,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const result = compare(left, right);
  return direction === "asc" ? result : -result;
}

const DUE_RANK: Record<RenewalFollowUpProjection["due"]["state"], number> = {
  due: 0,
  not_due: 1,
  needs_verification: 2,
  unset: 3,
  disabled: 4,
  not_applicable: 5,
};

const WAITING_RANK: Record<RenewalDeskWaitingKey, number> = {
  owner: 0,
  tenant: 1,
  team: 2,
  document_coordinator: 3,
  unresolved_source: 4,
  not_waiting: 5,
  needs_verification: 6,
};

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, "en-US");
}

function primaryValue(
  item: DeskLeaseSummary,
  sort: RenewalDeskSort,
): string | number | null {
  switch (sort) {
    case "end_date":
      return item.queryKeys.endDateIso;
    case "month":
      return item.queryKeys.endMonth;
    case "owner":
      return item.queryKeys.normalizedOwners[0] ?? null;
    case "tenant":
      return item.queryKeys.normalizedTenants[0] ?? null;
    case "workflow_step":
      return item.queryKeys.workflowStepIndex;
    case "waiting_on":
      return WAITING_RANK[item.queryKeys.waitingOn];
    case "conflicts":
      return item.queryKeys.sourceConflictCount;
    case "due":
      return DUE_RANK[item.queryKeys.dueState];
  }
}

function compareDeskItems(
  left: DeskLeaseSummary,
  right: DeskLeaseSummary,
  query: RenewalDeskQueryState,
): number {
  const leftPrimary = primaryValue(left, query.sort);
  const rightPrimary = primaryValue(right, query.sort);
  const primary = comparePresent(leftPrimary, rightPrimary, query.direction, (a, b) =>
    typeof a === "number" && typeof b === "number"
      ? a - b
      : compareStrings(String(a), String(b)),
  );
  if (primary !== 0) return primary;

  if (query.sort === "due") {
    const dueAt = comparePresent(
      left.queryKeys.dueAtIso,
      right.queryKeys.dueAtIso,
      query.direction,
      compareStrings,
    );
    if (dueAt !== 0) return dueAt;
  }
  return left.id.localeCompare(right.id, "en-US");
}

export interface RenewalDeskQueryResult {
  /** New array; source projection is never mutated. */
  items: DeskLeaseSummary[];
  totalBeforeQuery: number;
  totalAfterQuery: number;
}

/** One filter + one comparator for the canonical list and every derived fold. */
export function applyRenewalDeskQuery(
  items: readonly DeskLeaseSummary[],
  query: RenewalDeskQueryState,
): RenewalDeskQueryResult {
  const filtered = items.filter((item) => matchesQuery(item, query));
  const ordered = [...filtered].sort((left, right) =>
    compareDeskItems(left, right, query),
  );
  return {
    items: ordered,
    totalBeforeQuery: items.length,
    totalAfterQuery: ordered.length,
  };
}

/** Pure current-month window; the caller supplies today's ISO date and therefore owns the clock. */
export function buildRenewalDeskWindow(todayIso: string, horizonDays = 120): DateWindow {
  if (!isIsoDate(todayIso)) {
    throw new Error("todayIso must be an ISO calendar date (YYYY-MM-DD).");
  }
  if (!Number.isSafeInteger(horizonDays) || horizonDays < 0) {
    throw new Error("horizonDays must be a non-negative integer.");
  }
  const startIso = `${todayIso.slice(0, 7)}-01`;
  const end = new Date(`${todayIso}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + horizonDays);
  return { startIso, endIso: end.toISOString().slice(0, 10) };
}

export interface RenewalDeskFilterOptions {
  endDates: string[];
  months: string[];
  owners: string[];
  tenants: string[];
  steps: { value: string; label: string }[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en-US"));
}

/** Exact option labels from the same serialized source; no name or policy value is invented. */
export function buildRenewalDeskFilterOptions(
  items: readonly DeskLeaseSummary[],
): RenewalDeskFilterOptions {
  const stepLabels = new Map<string, string>();
  for (const item of items) {
    if (item.workflowStepId && item.stageLabel) {
      stepLabels.set(item.workflowStepId, item.stageLabel);
    }
  }
  return {
    endDates: uniqueSorted(
      items.flatMap((item) => (item.endDateIso ? [item.endDateIso] : [])),
    ),
    months: uniqueSorted(
      items.flatMap((item) => (item.queryKeys.endMonth ? [item.queryKeys.endMonth] : [])),
    ),
    owners: uniqueSorted(items.flatMap((item) => item.ownerNameLabels)),
    tenants: uniqueSorted(items.flatMap((item) => item.tenantNameLabels)),
    steps: [...stepLabels]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "en-US")),
  };
}
