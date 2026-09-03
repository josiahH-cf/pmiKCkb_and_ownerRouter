import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
  RENEWAL_DESK_RANGE_MAX_DAYS,
  RENEWAL_DESK_V2_SORTS,
  applyRenewalDeskQueryV2,
  buildActiveFilterChips,
  clearRenewalDeskFilters,
  hasActiveRenewalDeskFilters,
  inclusiveRangeDays,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  withDateDimension,
  type RenewalDeskQueryV2State,
  type RenewalDeskV2Item,
  type RenewalOverallStatus,
} from "@/lib/lease-renewal/desk-query-v2";
import { normalizeRenewalDeskText } from "@/lib/lease-renewal/desk-query";

const TOKEN_A = `p1_${"a".repeat(43)}`;
const TOKEN_B = `p1_${"b".repeat(43)}`;

/** Deterministic test matcher: token p1_aaa... matches "owner alpha"/"tenant alpha", p1_bbb... beta. */
function testMatcher(
  token: string,
  partyKind: "owner" | "tenant",
  normalizedLabels: readonly string[],
): boolean {
  const wanted =
    token === TOKEN_A
      ? `${partyKind} alpha`
      : token === TOKEN_B
        ? `${partyKind} beta`
        : null;
  return wanted !== null && normalizedLabels.includes(wanted);
}

function item(
  id: string,
  overrides: {
    address?: string | null;
    property?: string | null;
    endDateIso?: string | null;
    owners?: readonly string[];
    tenants?: readonly string[];
    workflowStepId?: string | null;
    workflowStepIndex?: number | null;
    waitingOn?: string;
    dueState?: string;
    dueAtIso?: string | null;
    sourceConflictCount?: number | null;
    retention?: string;
    currentBaseRent?: number | null;
    rentVerification?: "verified" | "needs_verification" | "unavailable";
    overallStatus?: RenewalOverallStatus;
    isBlocked?: boolean;
  } = {},
): RenewalDeskV2Item {
  const owners = overrides.owners ?? ["Owner Alpha"];
  const tenants = overrides.tenants ?? ["Tenant Alpha"];
  const address = overrides.address === undefined ? `${id} Main St` : overrides.address;
  const property = overrides.property === undefined ? null : overrides.property;
  const endDateIso =
    overrides.endDateIso === undefined ? "2026-09-30" : overrides.endDateIso;
  const overallStatus = overrides.overallStatus ?? "ready";
  return {
    id,
    queryKeys: {
      normalizedLeaseId: normalizeRenewalDeskText(id).replaceAll(" ", ""),
      normalizedSearchText: normalizeRenewalDeskText(
        [address, property, ...tenants, ...owners].filter(Boolean).join(" "),
      ),
      endDateIso,
      endMonth: endDateIso?.slice(0, 7) ?? null,
      normalizedOwners: owners.map(normalizeRenewalDeskText),
      normalizedTenants: tenants.map(normalizeRenewalDeskText),
      workflowStepId:
        overrides.workflowStepId === undefined
          ? "verify-renewal"
          : overrides.workflowStepId,
      workflowStepIndex:
        overrides.workflowStepIndex === undefined ? 0 : overrides.workflowStepIndex,
      waitingOn: overrides.waitingOn ?? "not_waiting",
      dueState: overrides.dueState ?? "unset",
      dueAtIso: overrides.dueAtIso ?? null,
      sourceConflictCount:
        overrides.sourceConflictCount === undefined ? 0 : overrides.sourceConflictCount,
    },
    identity: {
      address: address === null ? null : { label: address },
      property: property === null ? null : { label: property },
    },
    retention: { state: overrides.retention ?? "window" },
    guidance: {
      currentBaseRent:
        overrides.currentBaseRent === undefined ? 1500 : overrides.currentBaseRent,
      rentVerification: { state: overrides.rentVerification ?? "verified" },
      overallStatus,
      urgencyRank: OVERALL_STATUS_URGENCY_RANK[overallStatus],
      isBlocked: overrides.isBlocked ?? false,
    },
  };
}

describe("S82 v2 parse and canonical serialization", () => {
  it("serializes the completely default desk to an empty query string", () => {
    expect(serializeRenewalDeskQueryV2({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 })).toBe("");
  });

  it("emits v=2 plus nondefault keys in the exact fixed order regardless of interaction order", () => {
    const state: RenewalDeskQueryV2State = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      rentVerification: "verified",
      lease: "12 Oak",
      sort: "base_rent",
      direction: "desc",
      ownerKey: TOKEN_A,
      month: "2026-10",
      overallStatus: "blocked",
    };
    const encoded = serializeRenewalDeskQueryV2(state);
    expect(encoded).toBe(
      "v=2&lease=12+Oak&sort=base_rent&direction=desc&month=2026-10" +
        `&ownerKey=${TOKEN_A}&overallStatus=blocked&rentVerification=verified`,
    );
    // Round trip is byte-stable.
    expect(
      serializeRenewalDeskQueryV2(parseRenewalDeskQueryV2(new URLSearchParams(encoded))),
    ).toBe(encoded);
  });

  it("reads only the first occurrence of a repeated key", () => {
    const params = new URLSearchParams(
      "v=2&sort=base_rent&sort=due&lease=first&lease=second",
    );
    const state = parseRenewalDeskQueryV2(params);
    expect(state.sort).toBe("base_rent");
    expect(state.lease).toBe("first");
  });

  it("discards unknown keys and falls back per known key on invalid values", () => {
    const state = parseRenewalDeskQueryV2(
      new URLSearchParams(
        "v=9&unknown=x&sort=nope&direction=up&scope=zz&endDate=2026-13-40&month=2026-13" +
          "&due=bogus&ownerKey=OwnerAlpha&tenantKey=p1_short&step=owner-decision-x" +
          "&waiting=??&conflicts=maybe&overallStatus=green&blocked=perhaps&rentVerification=ok",
      ),
    );
    expect(state).toEqual({
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      dateDiagnostics: ["end_date_malformed", "month_malformed"],
    });
    expect(serializeRenewalDeskQueryV2(state)).toBe("");
  });

  it.each([
    [
      "malformed exact date",
      { v: "2", endDate: "2026-02-31", lease: "Maple" },
      "end_date_malformed",
    ],
    ["malformed month", { v: "2", month: "2026-19", lease: "Maple" }, "month_malformed"],
    [
      "incomplete range",
      { v: "2", from: "2026-09-01", lease: "Maple" },
      "range_incomplete",
    ],
    [
      "malformed range",
      { v: "2", from: "2026-09-01", through: "not-a-date", lease: "Maple" },
      "range_malformed",
    ],
    [
      "reversed range",
      { v: "2", from: "2026-09-02", through: "2026-09-01", lease: "Maple" },
      "range_reversed",
    ],
    [
      "range over 120 days",
      { v: "2", from: "2026-09-01", through: "2026-12-30", lease: "Maple" },
      "range_too_long",
    ],
  ] as const)("returns a symbolic diagnostic for %s", (_label, input, diagnostic) => {
    const state = parseRenewalDeskQueryV2(input);
    expect(state.dateDiagnostics).toContain(diagnostic);
    expect(state.lease).toBe("Maple");
    expect(state.from).toBe("");
    expect(state.through).toBe("");
    const canonical = serializeRenewalDeskQueryV2(state);
    expect(canonical).toContain("lease=Maple");
    expect(canonical).not.toContain("not-a-date");
    expect(canonical).not.toContain("2026-12-30");
  });

  it("bounds the two free-text keys to 120 trimmed UTF-16 code units", () => {
    const long = `  ${"x".repeat(300)}  `;
    const state = parseRenewalDeskQueryV2({ q: long, lease: long });
    expect(state.q).toHaveLength(120);
    expect(state.lease).toHaveLength(120);
  });

  it.each([
    ["one day", "2026-09-01", "2026-09-01", true, 1],
    ["120 days", "2026-09-01", "2026-12-29", true, 120],
    ["121 days", "2026-09-01", "2026-12-30", false, 121],
    ["reversed", "2026-09-02", "2026-09-01", false, 0],
  ])("validates the inclusive range bound (%s)", (_l, from, through, valid, days) => {
    if (days > 0) expect(inclusiveRangeDays(from, through)).toBe(days);
    const state = parseRenewalDeskQueryV2({ v: "2", from, through });
    expect(state.from).toBe(valid ? from : "");
    expect(state.through).toBe(valid ? through : "");
    expect(RENEWAL_DESK_RANGE_MAX_DAYS).toBe(120);
  });

  it("keeps the date dimension mutually exclusive: range beats endDate beats month", () => {
    const all = parseRenewalDeskQueryV2({
      v: "2",
      from: "2026-09-01",
      through: "2026-09-30",
      endDate: "2026-10-01",
      month: "2026-11",
    });
    expect([all.from, all.through, all.endDate, all.month]).toEqual([
      "2026-09-01",
      "2026-09-30",
      "",
      "",
    ]);

    const dateAndMonth = parseRenewalDeskQueryV2({
      v: "2",
      endDate: "2026-10-01",
      month: "2026-11",
    });
    expect([dateAndMonth.endDate, dateAndMonth.month]).toEqual(["2026-10-01", ""]);

    // An invalid range is dropped as a pair and does not suppress a valid exact date.
    const brokenRange = parseRenewalDeskQueryV2({
      v: "2",
      from: "2026-09-01",
      endDate: "2026-10-01",
    });
    expect([brokenRange.from, brokenRange.through, brokenRange.endDate]).toEqual([
      "",
      "",
      "2026-10-01",
    ]);
  });

  it("applies a date shortcut by clearing the other representations first", () => {
    const withRange = withDateDimension(
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, endDate: "2026-10-01" },
      { kind: "range", from: "2026-09-01", through: "2026-09-30" },
    );
    expect([
      withRange.endDate,
      withRange.month,
      withRange.from,
      withRange.through,
    ]).toEqual(["", "", "2026-09-01", "2026-09-30"]);
    const withMonth = withDateDimension(withRange, { kind: "month", value: "2026-11" });
    expect([withMonth.from, withMonth.through, withMonth.month]).toEqual([
      "",
      "",
      "2026-11",
    ]);
  });

  it("normalizes a legacy no-version bookmark into the same v2 state", () => {
    const state = parseRenewalDeskQueryV2({
      q: "alpha",
      sort: "end_date",
      direction: "desc",
      endDate: "missing",
      waiting: "owner",
    });
    expect(state.q).toBe("alpha");
    expect(state.sort).toBe("end_date");
    expect(state.endDate).toBe("missing");
    expect(state.waiting).toBe("owner");
    const encoded = serializeRenewalDeskQueryV2(state);
    expect(encoded.startsWith("v=2&")).toBe(true);
    expect(encoded).not.toContain("owner=");
  });

  it("resolves a legacy owner/tenant display label once and never echoes the label", () => {
    const state = parseRenewalDeskQueryV2(
      { owner: "Owner Alpha", tenant: "Unknown Person" },
      {
        resolveLegacyPartyLabel: (kind, label) =>
          kind === "owner" && label === "Owner Alpha" ? TOKEN_A : null,
      },
    );
    expect(state.ownerKey).toBe(TOKEN_A);
    expect(state.tenantKey).toBe("");
    const encoded = serializeRenewalDeskQueryV2(state);
    expect(encoded).toContain(`ownerKey=${TOKEN_A}`);
    expect(encoded).not.toContain("Owner");
    expect(encoded).not.toContain("owner=");
    expect(encoded).not.toContain("tenant=");
  });

  it("never resolves legacy labels on a v2 URL and rejects malformed opaque keys", () => {
    const state = parseRenewalDeskQueryV2(
      { v: "2", owner: "Owner Alpha", ownerKey: "p1_not43chars" },
      { resolveLegacyPartyLabel: () => TOKEN_A },
    );
    expect(state.ownerKey).toBe("");
  });
});

describe("S82 v2 filter application", () => {
  const items = [
    item("L1", {
      owners: ["Owner Alpha", "Owner Beta"],
      tenants: ["Tenant Alpha"],
      endDateIso: "2026-09-15",
      overallStatus: "blocked",
      isBlocked: true,
      rentVerification: "needs_verification",
      currentBaseRent: null,
      sourceConflictCount: 2,
    }),
    item("L2", {
      owners: ["Owner Beta"],
      tenants: ["Tenant Beta"],
      endDateIso: "2026-10-05",
      overallStatus: "ready",
      currentBaseRent: 1800,
    }),
    item("L3", {
      owners: ["Owner Gamma"],
      tenants: ["Tenant Alpha", "Tenant Beta"],
      endDateIso: null,
      overallStatus: "needs_verification",
      isBlocked: true,
      rentVerification: "unavailable",
      currentBaseRent: 1200,
      retention: "needs_verification",
      workflowStepId: null,
      workflowStepIndex: null,
    }),
    item("L4", {
      owners: ["Owner Alpha"],
      endDateIso: "2026-12-01",
      overallStatus: "complete",
      retention: "tracked_incomplete",
      currentBaseRent: 950,
    }),
  ];

  const base = { ...DEFAULT_RENEWAL_DESK_QUERY_V2 };

  it("filters by opaque owner key across multiple authoritative owners (OR within the cell)", () => {
    const result = applyRenewalDeskQueryV2(
      items,
      { ...base, ownerKey: TOKEN_A },
      testMatcher,
    );
    expect(result.items.map((entry) => entry.id)).toEqual(["L1", "L4"]);
    expect(result.totalBeforeQuery).toBe(4);
    expect(result.totalAfterQuery).toBe(2);
    expect(result.totalLoaded).toBe(4);
    expect(result.totalInScope).toBe(4);
    expect(result.totalMatching).toBe(2);
  });

  it("separates loaded, selected-scope, and matching totals", () => {
    const source = [
      ...items,
      item("L5", { retention: "outside", overallStatus: "blocked" }),
    ];
    const result = applyRenewalDeskQueryV2(
      source,
      { ...base, overallStatus: "blocked" },
      testMatcher,
    );
    expect(result.totalLoaded).toBe(5);
    expect(result.totalInScope).toBe(4);
    expect(result.totalMatching).toBe(1);
    expect(result.items.map((entry) => entry.id)).toEqual(["L1"]);
  });

  it("keeps a 320-row worklist deterministic with one party match per in-scope row", () => {
    const large = Array.from({ length: 320 }, (_, index) =>
      item(`L${String(index).padStart(3, "0")}`, {
        retention: index % 10 === 0 ? "outside" : "window",
        owners: ["Owner Alpha"],
        endDateIso: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String(
          (index % 28) + 1,
        ).padStart(2, "0")}`,
      }),
    );
    let matchCalls = 0;
    const matcher: typeof testMatcher = (...args) => {
      matchCalls += 1;
      return testMatcher(...args);
    };
    const startedAt = performance.now();
    const first = applyRenewalDeskQueryV2(
      large,
      { ...base, ownerKey: TOKEN_A, sort: "end_date" },
      matcher,
    );
    const elapsedMs = performance.now() - startedAt;
    const second = applyRenewalDeskQueryV2(
      large,
      { ...base, ownerKey: TOKEN_A, sort: "end_date" },
      testMatcher,
    );

    expect(first.totalLoaded).toBe(320);
    expect(first.totalInScope).toBe(288);
    expect(first.totalMatching).toBe(288);
    expect(matchCalls).toBe(288);
    expect(first.items.map((entry) => entry.id)).toEqual(
      second.items.map((entry) => entry.id),
    );
    expect(large[0]?.id).toBe("L000");
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it("combines filters with AND across columns", () => {
    const result = applyRenewalDeskQueryV2(
      items,
      { ...base, ownerKey: TOKEN_B, tenantKey: TOKEN_B },
      testMatcher,
    );
    expect(result.items.map((entry) => entry.id)).toEqual(["L2"]);
  });

  it("filters by overall status, blocked state, and rent verification", () => {
    expect(
      applyRenewalDeskQueryV2(
        items,
        { ...base, overallStatus: "blocked" },
        testMatcher,
      ).items.map((entry) => entry.id),
    ).toEqual(["L1"]);
    expect(
      applyRenewalDeskQueryV2(items, { ...base, blocked: "blocked" }, testMatcher)
        .items.map((entry) => entry.id)
        .sort(),
    ).toEqual(["L1", "L3"]);
    expect(
      applyRenewalDeskQueryV2(items, { ...base, blocked: "not_blocked" }, testMatcher)
        .items.map((entry) => entry.id)
        .sort(),
    ).toEqual(["L2", "L4"]);
    expect(
      applyRenewalDeskQueryV2(
        items,
        { ...base, rentVerification: "unavailable" },
        testMatcher,
      ).items.map((entry) => entry.id),
    ).toEqual(["L3"]);
  });

  it("filters by the bounded inclusive range against the renewal date", () => {
    const result = applyRenewalDeskQueryV2(
      items,
      { ...base, from: "2026-09-01", through: "2026-10-31" },
      testMatcher,
    );
    expect(result.items.map((entry) => entry.id)).toEqual(["L1", "L2"]);
  });

  it("scopes lease text to id, address, and property only — never a party name", () => {
    const byTenantName = applyRenewalDeskQueryV2(
      items,
      { ...base, lease: "Tenant Alpha" },
      testMatcher,
    );
    expect(byTenantName.items).toEqual([]);
    const byAddress = applyRenewalDeskQueryV2(
      items,
      { ...base, lease: "L2 Main" },
      testMatcher,
    );
    expect(byAddress.items.map((entry) => entry.id)).toEqual(["L2"]);
    const byId = applyRenewalDeskQueryV2(items, { ...base, lease: "l3" }, testMatcher);
    expect(byId.items.map((entry) => entry.id)).toEqual(["L3"]);
  });

  it("keeps the legacy q cross-field match for old bookmarks", () => {
    const result = applyRenewalDeskQueryV2(
      items,
      { ...base, q: "Owner Gamma" },
      testMatcher,
    );
    expect(result.items.map((entry) => entry.id)).toEqual(["L3"]);
  });

  it("retains tracked-incomplete leases in scope=active and isolates them in scope=tracked", () => {
    expect(
      applyRenewalDeskQueryV2(items, base, testMatcher).items.map((entry) => entry.id),
    ).toContain("L4");
    expect(
      applyRenewalDeskQueryV2(
        items,
        { ...base, scope: "tracked" },
        testMatcher,
      ).items.map((entry) => entry.id),
    ).toEqual(["L4"]);
  });

  it("sorts base rent numerically with missing values last in both directions", () => {
    const asc = applyRenewalDeskQueryV2(
      items,
      { ...base, sort: "base_rent" },
      testMatcher,
    );
    expect(asc.items.map((entry) => entry.id)).toEqual(["L4", "L3", "L2", "L1"]);
    const desc = applyRenewalDeskQueryV2(
      items,
      { ...base, sort: "base_rent", direction: "desc" },
      testMatcher,
    );
    expect(desc.items.map((entry) => entry.id)).toEqual(["L2", "L3", "L4", "L1"]);
  });

  it("sorts overall status by shared urgency rank then renewal date with a stable id tie-break", () => {
    const result = applyRenewalDeskQueryV2(
      items,
      { ...base, sort: "overall_status" },
      testMatcher,
    );
    expect(result.items.map((entry) => entry.id)).toEqual(["L3", "L1", "L2", "L4"]);

    const tied = [
      item("T2", { overallStatus: "ready", endDateIso: "2026-09-10" }),
      item("T1", { overallStatus: "ready", endDateIso: "2026-09-10" }),
    ];
    expect(
      applyRenewalDeskQueryV2(
        tied,
        { ...base, sort: "overall_status" },
        testMatcher,
      ).items.map((entry) => entry.id),
    ).toEqual(["T1", "T2"]);
  });

  it("supports every declared sort without mutating the source projection", () => {
    const frozen = Object.freeze([...items]);
    for (const sort of RENEWAL_DESK_V2_SORTS) {
      const result = applyRenewalDeskQueryV2(frozen, { ...base, sort }, testMatcher);
      expect(result.items).toHaveLength(4);
    }
    expect(frozen.map((entry) => entry.id)).toEqual(["L1", "L2", "L3", "L4"]);
  });
});

describe("S82 active filter chips and clear behavior", () => {
  it("renders one chip per active filter, one chip per range, and none for sort/direction", () => {
    const state: RenewalDeskQueryV2State = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      sort: "base_rent",
      direction: "desc",
      lease: "Oak",
      from: "2026-09-01",
      through: "2026-09-30",
      ownerKey: TOKEN_A,
      q: "legacy words",
    };
    const chips = buildActiveFilterChips(state);
    expect(chips.map((chip) => chip.key)).toEqual(["q", "lease", "ownerKey", "from"]);
    expect(chips.find((chip) => chip.key === "q")?.label).toContain("Legacy search");
    expect(chips.find((chip) => chip.key === "ownerKey")?.label).toBe("Owner: selected");
    const withoutRange = chips.find((chip) => chip.key === "from")?.withoutFilter;
    expect(withoutRange?.from).toBe("");
    expect(withoutRange?.through).toBe("");
    expect(withoutRange?.lease).toBe("Oak");
  });

  it("clears every filter including legacy q while retaining sort and direction", () => {
    const state: RenewalDeskQueryV2State = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      sort: "tenant",
      direction: "desc",
      q: "legacy",
      overallStatus: "blocked",
      tenantKey: TOKEN_B,
    };
    expect(hasActiveRenewalDeskFilters(state)).toBe(true);
    const cleared = clearRenewalDeskFilters(state);
    expect(cleared).toEqual({
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      sort: "tenant",
      direction: "desc",
    });
    expect(hasActiveRenewalDeskFilters(cleared)).toBe(false);
  });
});
