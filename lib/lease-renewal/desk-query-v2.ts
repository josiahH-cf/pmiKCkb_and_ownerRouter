// S82 `renewal-desk-query/v2` — the one public URL contract for the table-first renewal desk.
//
// Every key is scalar; the parser reads only the first occurrence, discards unknown keys, and falls
// back per known key on any invalid enum/date/month/range/opaque-key value. Canonical serialization
// emits keys in the contract's fixed order with defaults omitted; the completely default desk has no
// query string. Legacy S78 bookmarks (no `v`) parse into the same state, and legacy owner/tenant
// display labels may be resolved once — against the current authorized projection only — into exact
// opaque `p1_` tokens; no display label is ever echoed into a v2 URL.

import { LEASE_TERMS, type LeaseTerm } from "@/lib/lease-renewal/lease-term";
import {
  RENEWAL_DESK_DUE_STATES,
  RENEWAL_DESK_WAITING_STATES,
  normalizeRenewalDeskText,
  type RenewalDeskDueFilter,
  type RenewalDeskWaitingFilter,
} from "@/lib/lease-renewal/desk-query";
export const RENEWAL_DESK_QUERY_V2_VERSION = "2";

/** Opaque `renewal-party-filter-key/v1` URL token shape (the derivation lives server-side). */
export const PARTY_FILTER_TOKEN_PATTERN = /^p1_[A-Za-z0-9_-]{43}$/;

export const RENEWAL_DESK_V2_SORTS = [
  "due",
  "end_date",
  "month",
  "owner",
  "tenant",
  "workflow_step",
  "waiting_on",
  "conflicts",
  "lease",
  "base_rent",
  "overall_status",
  "rent_verification",
  "blocked",
] as const;
export type RenewalDeskV2Sort = (typeof RENEWAL_DESK_V2_SORTS)[number];

export const RENEWAL_OVERALL_STATUSES = [
  "needs_verification",
  "blocked",
  "complete",
  "waiting",
  "ready",
  "needs_review",
] as const;
export type RenewalOverallStatus = (typeof RENEWAL_OVERALL_STATUSES)[number];

/** Attention-first ordering shared by the overall-status sort and row urgency. */
export const OVERALL_STATUS_URGENCY_RANK: Record<RenewalOverallStatus, number> = {
  needs_verification: 0,
  blocked: 1,
  waiting: 2,
  ready: 3,
  needs_review: 4,
  complete: 5,
};

export const RENEWAL_RENT_VERIFICATION_STATES = [
  "verified",
  "needs_verification",
  "unavailable",
] as const;
export type RenewalRentVerificationState =
  (typeof RENEWAL_RENT_VERIFICATION_STATES)[number];

/** Needs-attention-first ordering for the rent-verification sort. */
export const RENT_VERIFICATION_ATTENTION_RANK: Record<
  RenewalRentVerificationState,
  number
> = {
  needs_verification: 0,
  unavailable: 1,
  verified: 2,
};

export const RENEWAL_DESK_V2_STEPS = [
  "verify-renewal",
  "owner-decision",
  "tenant-decision",
  "document-packet",
  "signatures-follow-up",
  "compliance-close",
  "needs_verification",
] as const;

/** Inclusive calendar-day maximum for the `from`/`through` range. */
export const RENEWAL_DESK_RANGE_MAX_DAYS = 120;

/**
 * Value-free diagnostics retained only for the current render. Invalid date URL values are still
 * dropped from canonical state, but the desk can now explain why instead of silently changing the
 * operator's request. No raw query value is retained in a diagnostic.
 */
export const RENEWAL_DESK_DATE_DIAGNOSTICS = [
  "end_date_malformed",
  "month_malformed",
  "range_incomplete",
  "range_malformed",
  "range_reversed",
  "range_too_long",
] as const;
export type RenewalDeskDateDiagnostic = (typeof RENEWAL_DESK_DATE_DIAGNOSTICS)[number];

export interface RenewalDeskQueryV2State {
  /** Legacy-only bounded cross-field text; the v2 UI never creates it. */
  q: string;
  /** Lease/location text over only lease id, address, and property. */
  lease: string;
  sort: RenewalDeskV2Sort;
  direction: "asc" | "desc";
  scope: "active" | "tracked" | "all" | "periodic_review";
  endDate: "" | "missing" | string;
  month: "" | string;
  due: RenewalDeskDueFilter;
  ownerKey: string;
  tenantKey: string;
  from: "" | string;
  through: "" | string;
  step: "" | (typeof RENEWAL_DESK_V2_STEPS)[number];
  waiting: RenewalDeskWaitingFilter;
  conflicts: "all" | "with" | "without";
  overallStatus: "all" | RenewalOverallStatus;
  blocked: "all" | "blocked" | "not_blocked";
  rentVerification: "all" | RenewalRentVerificationState;
  /** S103: filter the table by the one shared lease-term projection. */
  term: "all" | LeaseTerm;
  /** Noncanonical render-only feedback; never serialized into a desk URL. */
  readonly dateDiagnostics?: readonly RenewalDeskDateDiagnostic[];
}

export const DEFAULT_RENEWAL_DESK_QUERY_V2: Readonly<RenewalDeskQueryV2State> = {
  q: "",
  lease: "",
  sort: "due",
  direction: "asc",
  scope: "active",
  endDate: "",
  month: "",
  due: "all",
  ownerKey: "",
  tenantKey: "",
  from: "",
  through: "",
  step: "",
  waiting: "all",
  conflicts: "all",
  overallStatus: "all",
  blocked: "all",
  rentVerification: "all",
  term: "all",
};

/** Fixed canonical key order; serialization emits nondefault values in exactly this order. */
const V2_KEY_ORDER = [
  "q",
  "lease",
  "sort",
  "direction",
  "scope",
  "endDate",
  "month",
  "due",
  "ownerKey",
  "tenantKey",
  "from",
  "through",
  "step",
  "waiting",
  "conflicts",
  "overallStatus",
  "blocked",
  "rentVerification",
  "term",
] as const satisfies readonly (keyof RenewalDeskQueryV2State)[];

type SearchParamRecord = Record<string, string | string[] | undefined>;

function firstValue(
  input: URLSearchParams | SearchParamRecord,
  key: string,
): string | undefined {
  if (input instanceof URLSearchParams) return input.getAll(key)[0];
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

function boundedText(value: string | undefined, maxLength: number): string {
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

/** Inclusive calendar days spanned by a valid ISO pair (equal dates span one day). */
export function inclusiveRangeDays(fromIso: string, throughIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00.000Z`);
  const through = Date.parse(`${throughIso}T00:00:00.000Z`);
  return Math.round((through - from) / 86_400_000) + 1;
}

function partyToken(value: string | undefined): string {
  const bounded = boundedText(value, 46);
  return PARTY_FILTER_TOKEN_PATTERN.test(bounded) ? bounded : "";
}

export interface LegacyPartyLabelResolver {
  (partyKind: "owner" | "tenant", displayLabel: string): string | null;
}

export interface ParseRenewalDeskQueryV2Options {
  /**
   * One-shot legacy `owner`/`tenant` display-label resolution against the current authorized
   * projection. Absent, ambiguous, or unresolved labels are dropped; the label itself is never
   * retained in the parsed state.
   */
  readonly resolveLegacyPartyLabel?: LegacyPartyLabelResolver;
}

/** Parse untrusted URL state into one bounded, deterministic v2 contract. */
export function parseRenewalDeskQueryV2(
  input: URLSearchParams | SearchParamRecord = {},
  options: ParseRenewalDeskQueryV2Options = {},
): RenewalDeskQueryV2State {
  // Keep one extra sentinel code unit so an overlong value cannot be truncated into a valid date.
  const endDateCandidate = boundedText(firstValue(input, "endDate"), 11);
  const monthCandidate = boundedText(firstValue(input, "month"), 8);
  const rawEndDate = endDateCandidate.slice(0, 10);
  const rawMonth = monthCandidate.slice(0, 7);
  const rawStep = boundedText(firstValue(input, "step"), 64);
  const fromCandidate = boundedText(firstValue(input, "from"), 11);
  const throughCandidate = boundedText(firstValue(input, "through"), 11);
  const rawFrom = fromCandidate.slice(0, 10);
  const rawThrough = throughCandidate.slice(0, 10);

  const versionValue = firstValue(input, "v");
  const isLegacy = versionValue === undefined;

  let ownerKey = partyToken(firstValue(input, "ownerKey"));
  let tenantKey = partyToken(firstValue(input, "tenantKey"));
  if (isLegacy && options.resolveLegacyPartyLabel) {
    if (!ownerKey) {
      const legacyOwner = boundedText(firstValue(input, "owner"), 120);
      if (legacyOwner) {
        ownerKey = options.resolveLegacyPartyLabel("owner", legacyOwner) ?? "";
      }
    }
    if (!tenantKey) {
      const legacyTenant = boundedText(firstValue(input, "tenant"), 120);
      if (legacyTenant) {
        tenantKey = options.resolveLegacyPartyLabel("tenant", legacyTenant) ?? "";
      }
    }
  }

  const dateDiagnostics: RenewalDeskDateDiagnostic[] = [];
  const endDateValid =
    endDateCandidate.length <= 10 &&
    (rawEndDate === "" || rawEndDate === "missing" || isIsoDate(rawEndDate));
  const monthValid =
    monthCandidate.length <= 7 &&
    (rawMonth === "" || /^\d{4}-(?:0[1-9]|1[0-2])$/.test(rawMonth));
  if (!endDateValid) dateDiagnostics.push("end_date_malformed");
  if (!monthValid) dateDiagnostics.push("month_malformed");

  const hasFrom = rawFrom !== "";
  const hasThrough = rawThrough !== "";
  const rangeIncomplete = hasFrom !== hasThrough;
  const rangeMalformed =
    hasFrom &&
    hasThrough &&
    (fromCandidate.length > 10 ||
      throughCandidate.length > 10 ||
      !isIsoDate(rawFrom) ||
      !isIsoDate(rawThrough));
  const rangeReversed = hasFrom && hasThrough && !rangeMalformed && rawThrough < rawFrom;
  const rangeTooLong =
    hasFrom &&
    hasThrough &&
    !rangeMalformed &&
    !rangeReversed &&
    inclusiveRangeDays(rawFrom, rawThrough) > RENEWAL_DESK_RANGE_MAX_DAYS;
  if (rangeIncomplete) dateDiagnostics.push("range_incomplete");
  if (rangeMalformed) dateDiagnostics.push("range_malformed");
  if (rangeReversed) dateDiagnostics.push("range_reversed");
  if (rangeTooLong) dateDiagnostics.push("range_too_long");

  const endDate = endDateValid ? rawEndDate : "";
  const month = monthValid ? rawMonth : "";
  const rangeValid =
    hasFrom && hasThrough && !rangeMalformed && !rangeReversed && !rangeTooLong;

  // The date dimension is mutually exclusive: a valid range wins, then a valid exact date, then the
  // month. An incomplete/invalid range is dropped as a pair and never suppresses the other keys.
  const state: RenewalDeskQueryV2State = {
    q: boundedText(firstValue(input, "q"), 120),
    lease: boundedText(firstValue(input, "lease"), 120),
    sort: oneOf(firstValue(input, "sort"), RENEWAL_DESK_V2_SORTS, "due"),
    direction: oneOf(firstValue(input, "direction"), ["asc", "desc"] as const, "asc"),
    scope: oneOf(
      firstValue(input, "scope"),
      ["active", "tracked", "all", "periodic_review"] as const,
      "active",
    ),
    endDate: rangeValid ? "" : endDate,
    month: rangeValid || endDate ? "" : month,
    due: oneOf(
      firstValue(input, "due"),
      ["all", ...RENEWAL_DESK_DUE_STATES] as const,
      "all",
    ),
    ownerKey,
    tenantKey,
    from: rangeValid ? rawFrom : "",
    through: rangeValid ? rawThrough : "",
    step: oneOf(rawStep, ["", ...RENEWAL_DESK_V2_STEPS] as const, ""),
    waiting: oneOf(
      firstValue(input, "waiting"),
      ["all", ...RENEWAL_DESK_WAITING_STATES] as const,
      "all",
    ),
    conflicts: oneOf(
      firstValue(input, "conflicts"),
      ["all", "with", "without"] as const,
      "all",
    ),
    overallStatus: oneOf(
      firstValue(input, "overallStatus"),
      ["all", ...RENEWAL_OVERALL_STATUSES] as const,
      "all",
    ),
    blocked: oneOf(
      firstValue(input, "blocked"),
      ["all", "blocked", "not_blocked"] as const,
      "all",
    ),
    rentVerification: oneOf(
      firstValue(input, "rentVerification"),
      ["all", ...RENEWAL_RENT_VERIFICATION_STATES] as const,
      "all",
    ),
    term: oneOf(firstValue(input, "term"), ["all", ...LEASE_TERMS] as const, "all"),
    ...(dateDiagnostics.length > 0 ? { dateDiagnostics } : {}),
  };
  return state;
}

/**
 * Canonical, interaction-order-independent serialization. Emits `v=2` whenever any nondefault state
 * is emitted; the completely default desk serializes to the empty string.
 */
export function serializeRenewalDeskQueryV2(state: RenewalDeskQueryV2State): string {
  const params = new URLSearchParams();
  let nondefault = false;
  for (const key of V2_KEY_ORDER) {
    const value = state[key];
    if (value !== DEFAULT_RENEWAL_DESK_QUERY_V2[key] && value !== "") {
      nondefault = true;
    }
  }
  if (!nondefault) return "";
  params.set("v", RENEWAL_DESK_QUERY_V2_VERSION);
  for (const key of V2_KEY_ORDER) {
    const value = state[key];
    if (value !== DEFAULT_RENEWAL_DESK_QUERY_V2[key] && value !== "") {
      params.set(key, value);
    }
  }
  return params.toString();
}

/** Apply one date-dimension shortcut, clearing the other representations before serialization. */
export function withDateDimension(
  state: RenewalDeskQueryV2State,
  dimension:
    | { kind: "none" }
    | { kind: "endDate"; value: "missing" | string }
    | { kind: "month"; value: string }
    | { kind: "range"; from: string; through: string },
): RenewalDeskQueryV2State {
  const cleared = { ...state, endDate: "" as const, month: "", from: "", through: "" };
  switch (dimension.kind) {
    case "none":
      return cleared;
    case "endDate":
      return { ...cleared, endDate: dimension.value };
    case "month":
      return { ...cleared, month: dimension.value };
    case "range":
      return { ...cleared, from: dimension.from, through: dimension.through };
  }
}

export interface RenewalDeskV2Item {
  readonly id: string;
  readonly queryKeys: {
    readonly normalizedLeaseId: string;
    readonly normalizedSearchText: string;
    readonly endDateIso: string | null;
    readonly endMonth: string | null;
    readonly normalizedOwners: readonly string[];
    readonly normalizedTenants: readonly string[];
    readonly workflowStepId: string | null;
    readonly workflowStepIndex: number | null;
    readonly waitingOn: string;
    readonly dueState: string;
    readonly dueAtIso: string | null;
    readonly sourceConflictCount: number | null;
    readonly leaseTerm: LeaseTerm;
    readonly nextReviewIso: string | null;
  };
  readonly identity: {
    readonly address: { readonly label: string } | null;
    readonly property: { readonly label: string } | null;
  };
  readonly retention: { readonly state: string };
  readonly guidance: {
    readonly currentBaseRent: number | null;
    readonly rentVerification: { readonly state: RenewalRentVerificationState };
    readonly overallStatus: RenewalOverallStatus;
    readonly urgencyRank: number;
    readonly isBlocked: boolean;
  };
}

export interface PartyTokenMatcher {
  (
    token: string,
    partyKind: "owner" | "tenant",
    normalizedLabels: readonly string[],
  ): boolean;
}

const DUE_RANK: Record<string, number> = {
  due: 0,
  not_due: 1,
  needs_verification: 2,
  unset: 3,
  disabled: 4,
  not_applicable: 5,
};

const WAITING_RANK: Record<string, number> = {
  owner: 0,
  tenant: 1,
  team: 2,
  document_coordinator: 3,
  unresolved_source: 4,
  not_waiting: 5,
  needs_verification: 6,
};

function inScope(item: RenewalDeskV2Item, scope: RenewalDeskQueryV2State["scope"]) {
  if (scope === "all") return true;
  if (scope === "tracked") return item.retention.state === "tracked_incomplete";
  // S103: the periodic-review scope isolates month-to-month leases whose annual review is due
  // inside the current window. They also remain in the default active worklist, so an operator
  // sees the review without switching scopes; they are never in the monthly actionable cohort.
  if (scope === "periodic_review") return item.retention.state === "periodic_review";
  return item.retention.state !== "outside";
}

function compactNormalized(value: string): string {
  return value.replaceAll(" ", "");
}

function matchesLeaseText(item: RenewalDeskV2Item, leaseText: string): boolean {
  const normalizedQuery = normalizeRenewalDeskText(leaseText);
  if (normalizedQuery === "") return false;
  const compactQuery = compactNormalized(normalizedQuery);
  if (item.queryKeys.normalizedLeaseId === compactQuery) return true;
  const scopeText = normalizeRenewalDeskText(
    [item.identity.address?.label, item.identity.property?.label]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  return (
    scopeText.includes(normalizedQuery) ||
    compactNormalized(scopeText).includes(compactQuery)
  );
}

function matchesLegacyQ(item: RenewalDeskV2Item, q: string): boolean {
  const normalizedQuery = normalizeRenewalDeskText(q);
  if (normalizedQuery === "") return false;
  const compactQuery = compactNormalized(normalizedQuery);
  return (
    item.queryKeys.normalizedLeaseId === compactQuery ||
    item.queryKeys.normalizedSearchText.includes(normalizedQuery) ||
    compactNormalized(item.queryKeys.normalizedSearchText).includes(compactQuery)
  );
}

function matchesQuery(
  item: RenewalDeskV2Item,
  query: RenewalDeskQueryV2State,
  matchParty: PartyTokenMatcher,
): boolean {
  if (!inScope(item, query.scope)) return false;
  if (query.q && !matchesLegacyQ(item, query.q)) return false;
  if (query.lease && !matchesLeaseText(item, query.lease)) return false;
  if (
    query.endDate === "missing"
      ? item.queryKeys.endDateIso !== null
      : query.endDate && item.queryKeys.endDateIso !== query.endDate
  ) {
    return false;
  }
  if (query.month && item.queryKeys.endMonth !== query.month) return false;
  if (query.from && query.through) {
    const endDate = item.queryKeys.endDateIso;
    if (!endDate || endDate < query.from || endDate > query.through) return false;
  }
  if (query.due !== "all" && item.queryKeys.dueState !== query.due) return false;
  if (
    query.ownerKey &&
    !matchParty(query.ownerKey, "owner", item.queryKeys.normalizedOwners)
  ) {
    return false;
  }
  if (
    query.tenantKey &&
    !matchParty(query.tenantKey, "tenant", item.queryKeys.normalizedTenants)
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
  if (
    query.overallStatus !== "all" &&
    item.guidance.overallStatus !== query.overallStatus
  ) {
    return false;
  }
  if (query.blocked === "blocked" && !item.guidance.isBlocked) return false;
  if (query.blocked === "not_blocked" && item.guidance.isBlocked) return false;
  if (
    query.rentVerification !== "all" &&
    item.guidance.rentVerification.state !== query.rentVerification
  ) {
    return false;
  }
  if (query.term !== "all" && item.queryKeys.leaseTerm !== query.term) return false;
  return true;
}

function comparePresent<T>(
  left: T | null,
  right: T | null,
  direction: "asc" | "desc",
  compare: (a: T, b: T) => number,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const result = compare(left, right);
  return direction === "asc" ? result : -result;
}

function primaryValue(
  item: RenewalDeskV2Item,
  sort: RenewalDeskV2Sort,
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
      return WAITING_RANK[item.queryKeys.waitingOn] ?? null;
    case "conflicts":
      return item.queryKeys.sourceConflictCount;
    case "lease": {
      const label = item.identity.address?.label ?? item.identity.property?.label ?? null;
      return label === null
        ? null
        : `${normalizeRenewalDeskText(label)} ${item.queryKeys.normalizedLeaseId}`;
    }
    case "base_rent":
      return item.guidance.currentBaseRent;
    case "overall_status":
      return item.guidance.urgencyRank;
    case "rent_verification":
      return RENT_VERIFICATION_ATTENTION_RANK[item.guidance.rentVerification.state];
    case "blocked":
      return item.guidance.isBlocked ? 0 : 1;
    case "due":
      return DUE_RANK[item.queryKeys.dueState] ?? null;
  }
}

function secondaryValue(item: RenewalDeskV2Item, sort: RenewalDeskV2Sort): string | null {
  if (sort === "due") return item.queryKeys.dueAtIso;
  // Attention-style columns break ties chronologically so a sooner renewal never sorts below a
  // later one inside the same band.
  if (sort === "overall_status" || sort === "rent_verification" || sort === "blocked") {
    return item.queryKeys.endDateIso;
  }
  return null;
}

function compareItems(
  left: RenewalDeskV2Item,
  right: RenewalDeskV2Item,
  query: RenewalDeskQueryV2State,
): number {
  const primary = comparePresent(
    primaryValue(left, query.sort),
    primaryValue(right, query.sort),
    query.direction,
    (a, b) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), "en-US"),
  );
  if (primary !== 0) return primary;
  const secondary = comparePresent(
    secondaryValue(left, query.sort),
    secondaryValue(right, query.sort),
    query.direction,
    (a, b) => a.localeCompare(b, "en-US"),
  );
  if (secondary !== 0) return secondary;
  return left.id.localeCompare(right.id, "en-US");
}

export interface RenewalDeskQueryV2Result<T extends RenewalDeskV2Item> {
  items: T[];
  /** Every lease in the current authorized source projection. */
  totalLoaded: number;
  /** Leases remaining after the selected worklist scope, before column filters. */
  totalInScope: number;
  /** Leases remaining after scope and every column filter. */
  totalMatching: number;
  /** @deprecated Compatibility alias for totalLoaded. */
  totalBeforeQuery: number;
  /** @deprecated Compatibility alias for totalMatching. */
  totalAfterQuery: number;
}

/** One filter + one comparator for the canonical table; the source projection is never mutated. */
export function applyRenewalDeskQueryV2<T extends RenewalDeskV2Item>(
  items: readonly T[],
  query: RenewalDeskQueryV2State,
  matchParty: PartyTokenMatcher,
): RenewalDeskQueryV2Result<T> {
  const scoped = items.filter((item) => inScope(item, query.scope));
  const filtered = items.filter((item) => matchesQuery(item, query, matchParty));
  const ordered = [...filtered].sort((left, right) => compareItems(left, right, query));
  return {
    items: ordered,
    totalLoaded: items.length,
    totalInScope: scoped.length,
    totalMatching: ordered.length,
    totalBeforeQuery: items.length,
    totalAfterQuery: ordered.length,
  };
}

export interface RenewalDeskActiveFilterChip {
  readonly key: keyof RenewalDeskQueryV2State;
  readonly label: string;
  /** The state with only this filter removed; sort/direction are never part of a chip. */
  readonly withoutFilter: RenewalDeskQueryV2State;
}

const CHIP_LABELS: Partial<Record<keyof RenewalDeskQueryV2State, (v: string) => string>> =
  {
    q: (value) => `Legacy search: ${value}`,
    lease: (value) => `Lease/location: ${value}`,
    scope: (value) =>
      value === "tracked"
        ? "Scope: tracked incomplete"
        : value === "periodic_review"
          ? "Scope: periodic review"
          : "Scope: all loaded leases",
    endDate: (value) =>
      value === "missing" ? "Renewal date: missing" : `Renewal date: ${value}`,
    month: (value) => `Renewal month: ${value}`,
    due: (value) => `Due state: ${value.replaceAll("_", " ")}`,
    ownerKey: () => "Owner: selected",
    tenantKey: () => "Tenant: selected",
    step: (value) => `Phase: ${value.replaceAll("-", " ").replaceAll("_", " ")}`,
    waiting: (value) => `Waiting on: ${value.replaceAll("_", " ")}`,
    conflicts: (value) =>
      value === "with" ? "Has source conflicts" : "No verified source conflicts",
    overallStatus: (value) => `Status: ${value.replaceAll("_", " ")}`,
    blocked: (value) => (value === "blocked" ? "Blocked" : "Not blocked"),
    rentVerification: (value) => `Rent verification: ${value.replaceAll("_", " ")}`,
    term: (value) => `Lease term: ${value.replaceAll("_", " ")}`,
  };

/** Sort and direction are view state, not filters; a range renders as one removable chip. */
export function buildActiveFilterChips(
  state: RenewalDeskQueryV2State,
): RenewalDeskActiveFilterChip[] {
  const chips: RenewalDeskActiveFilterChip[] = [];
  for (const key of V2_KEY_ORDER) {
    if (key === "sort" || key === "direction" || key === "through") continue;
    const value = state[key];
    if (value === DEFAULT_RENEWAL_DESK_QUERY_V2[key] || value === "") continue;
    if (key === "from") {
      chips.push({
        key,
        label: `Renewal date range: ${state.from} through ${state.through}`,
        withoutFilter: { ...state, from: "", through: "" },
      });
      continue;
    }
    const label = CHIP_LABELS[key]?.(value) ?? `${key}: ${value}`;
    chips.push({
      key,
      label,
      withoutFilter: { ...state, [key]: DEFAULT_RENEWAL_DESK_QUERY_V2[key] },
    });
  }
  return chips;
}

/** Remove every filter, including legacy `q`, while retaining the current sort/direction. */
export function clearRenewalDeskFilters(
  state: RenewalDeskQueryV2State,
): RenewalDeskQueryV2State {
  return {
    ...DEFAULT_RENEWAL_DESK_QUERY_V2,
    sort: state.sort,
    direction: state.direction,
  };
}

export function hasActiveRenewalDeskFilters(state: RenewalDeskQueryV2State): boolean {
  return buildActiveFilterChips(state).length > 0;
}
