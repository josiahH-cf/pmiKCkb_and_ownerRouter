import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
  buildActiveFilterChips,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskV2Item,
} from "@/lib/lease-renewal/desk-query-v2";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  buildDeskReturnHref,
  buildWorkspaceHref,
  encodeDeskView,
  parseDeskViewState,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import {
  NOT_RECORDED_WORK_STATUS_LABEL,
  RENEWAL_WORK_STATUSES,
  RENEWAL_WORK_STATUS_CONTROL_LABEL,
  RENEWAL_WORK_STATUS_FILTERS,
  RENEWAL_WORK_STATUS_LABELS,
  UNAVAILABLE_WORK_STATUS_LABEL,
  matchesWorkStatusFilter,
  projectRenewalWorkStatus,
  workStatusDisplayLabel,
  workStatusFilterLabel,
  workStatusQueryKey,
  type RenewalWorkStatusProjection,
  type RenewalWorkStatusRecord,
} from "@/lib/lease-renewal/work-status";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";

// S119: the staff work status is a bounded, app-owned annotation projected once into the sidebar,
// the compact context and the desk filter. It never impersonates derived verification/completion.

const TOKEN_A = `p1_${"a".repeat(43)}`;

function record(
  overrides: Partial<RenewalWorkStatusRecord> = {},
): RenewalWorkStatusRecord {
  return {
    schemaVersion: "renewal-work-status/v1",
    leaseId: "701",
    revision: 1,
    status: "waiting_on_owner_response",
    recordedAt: "2026-09-16T23:10:00.000Z",
    recordedByUid: "op-1",
    recordedByLabel: "op1@pmikcmetro.com",
    cycleId: null,
    eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
    ...overrides,
  };
}

function item(
  id: string,
  overrides: {
    owners?: readonly string[];
    endDateIso?: string | null;
    workStatus?: RenewalDeskV2Item["queryKeys"]["workStatus"];
    omitWorkStatus?: boolean;
  } = {},
): RenewalDeskV2Item {
  const owners = overrides.owners ?? ["Owner Alpha"];
  const endDateIso =
    overrides.endDateIso === undefined ? "2026-09-30" : overrides.endDateIso;
  return {
    id,
    queryKeys: {
      normalizedLeaseId: id,
      normalizedSearchText: `${id} main st`,
      endDateIso,
      endMonth: endDateIso?.slice(0, 7) ?? null,
      normalizedOwners: owners.map((value) => value.toLowerCase()),
      normalizedTenants: ["tenant alpha"],
      workflowStepId: "owner-decision",
      workflowStepIndex: 1,
      waitingOn: "owner",
      dueState: "due",
      dueAtIso: "2026-09-01T00:00:00.000Z",
      sourceConflictCount: 0,
      leaseTerm: "fixed_term",
      nextReviewIso: null,
      ...(overrides.omitWorkStatus
        ? {}
        : { workStatus: overrides.workStatus ?? "not_recorded" }),
    },
    identity: { address: { label: `${id} Main St` }, property: null },
    retention: { state: "window" },
    guidance: {
      currentBaseRent: 1500,
      rentVerification: { state: "verified" },
      overallStatus: "ready",
      urgencyRank: 3,
      isBlocked: false,
    },
  };
}

const matchOwnerAlpha = (
  token: string,
  partyKind: "owner" | "tenant",
  normalizedLabels: readonly string[],
) =>
  token === TOKEN_A && partyKind === "owner" && normalizedLabels.includes("owner alpha");

describe("S119 bounded staff work status (R119.1, R119.2)", () => {
  it("AC-S119-1: offers exactly the bounded workflow statuses, an explicit control label and Not recorded as the unset display", () => {
    expect([...RENEWAL_WORK_STATUSES]).toEqual([
      "verifying_lease_and_rent",
      "preparing_market_comparison",
      "preparing_owner_outreach",
      "waiting_on_owner_response",
      "preparing_tenant_offer",
      "waiting_on_tenant_response",
      "preparing_lease_documents",
      "waiting_on_signatures",
      "completing_follow_up",
      "non_renewal_handoff",
      "complete_staff_status",
    ]);
    expect(RENEWAL_WORK_STATUS_LABELS.verifying_lease_and_rent).toBe(
      "Verifying lease and rent",
    );
    expect(RENEWAL_WORK_STATUS_LABELS.waiting_on_owner_response).toBe(
      "Waiting on owner response",
    );
    expect(RENEWAL_WORK_STATUS_LABELS.waiting_on_tenant_response).toBe(
      "Waiting on tenant response",
    );
    expect(RENEWAL_WORK_STATUS_LABELS.preparing_lease_documents).toBe(
      "Preparing lease documents / Dotloop",
    );
    expect(RENEWAL_WORK_STATUS_LABELS.complete_staff_status).toMatch(
      /^Complete\b.*staff status$/,
    );
    // No duplicate "messaged tenants" state, no em dash and no free-form status designer.
    for (const label of Object.values(RENEWAL_WORK_STATUS_LABELS)) {
      expect(label).not.toMatch(/messaged|—/i);
    }
    expect(RENEWAL_WORK_STATUS_CONTROL_LABEL).toBe("Work status (recorded by staff)");
    expect(NOT_RECORDED_WORK_STATUS_LABEL).toBe("Not recorded");
    expect(RENEWAL_WORK_STATUS_FILTERS).toEqual([
      "all",
      "not_recorded",
      ...RENEWAL_WORK_STATUSES,
    ]);

    const unset = projectRenewalWorkStatus({ available: true, record: null }, null);
    expect(unset).toEqual({ state: "not_recorded" });
    expect(workStatusDisplayLabel(unset)).toBe("Not recorded");
    expect(workStatusQueryKey(unset)).toBe("not_recorded");
  });

  it("AC-S119-2: keeps the recorder, time and cycle relation explicit and never reads an unavailable record as Not recorded", () => {
    const current = projectRenewalWorkStatus(
      { available: true, record: record({ cycleId: "cycle-a" }) },
      "cycle-a",
    );
    expect(current).toMatchObject({
      state: "recorded",
      status: "waiting_on_owner_response",
      label: "Waiting on owner response",
      revision: 1,
      recordedAt: "2026-09-16T23:10:00.000Z",
      recordedByUid: "op-1",
      recordedByLabel: "op1@pmikcmetro.com",
      cycleId: "cycle-a",
      cycleRelation: "current",
    });
    expect(workStatusQueryKey(current)).toBe("waiting_on_owner_response");
    expect(workStatusDisplayLabel(current)).toBe("Waiting on owner response");

    // A value saved during an earlier cycle is distinguishable after rollover.
    expect(
      projectRenewalWorkStatus(
        { available: true, record: record({ cycleId: "cycle-a" }) },
        "cycle-b",
      ),
    ).toMatchObject({ state: "recorded", cycleRelation: "previous" });
    // A status recorded before any cycle started is not claimed for the cycle started later.
    expect(
      projectRenewalWorkStatus(
        { available: true, record: record({ cycleId: null }) },
        "cycle-b",
      ),
    ).toMatchObject({ state: "recorded", cycleRelation: "previous" });
    expect(
      projectRenewalWorkStatus(
        { available: true, record: record({ cycleId: null }) },
        null,
      ),
    ).toMatchObject({ state: "recorded", cycleRelation: "none" });
    // An unknown current cycle (the manual read failed) is named, never guessed.
    expect(
      projectRenewalWorkStatus(
        { available: true, record: record({ cycleId: "cycle-a" }) },
        undefined,
      ),
    ).toMatchObject({ state: "recorded", cycleRelation: "unverified" });

    const unavailable = projectRenewalWorkStatus({ available: false }, "cycle-a");
    expect(unavailable).toEqual({ state: "unavailable" });
    expect(workStatusDisplayLabel(unavailable)).toBe(UNAVAILABLE_WORK_STATUS_LABEL);
    expect(workStatusDisplayLabel(unavailable)).not.toBe("Not recorded");
    expect(workStatusQueryKey(unavailable)).toBe("unavailable");
    expect(workStatusQueryKey(undefined)).toBe("unavailable");
    // The projection carries no derived process fields: it cannot impersonate them.
    expect(current).not.toHaveProperty("complete");
    expect(current).not.toHaveProperty("overallStatus");
    expect(current).not.toHaveProperty("nextActivity");
  });
});

describe("S119 desk filter and continuation (R119.3)", () => {
  it("AC-S119-3: parses, bounds and serializes the optional staff-status key after every existing key", () => {
    expect(DEFAULT_RENEWAL_DESK_QUERY_V2.workStatus).toBe("all");
    const parsed = parseRenewalDeskQueryV2(
      new URLSearchParams("v=2&workStatus=waiting_on_owner_response"),
    );
    expect(parsed.workStatus).toBe("waiting_on_owner_response");
    expect(
      parseRenewalDeskQueryV2(new URLSearchParams("v=2&workStatus=not_recorded"))
        .workStatus,
    ).toBe("not_recorded");
    expect(
      parseRenewalDeskQueryV2(new URLSearchParams("v=2&workStatus=messaged_tenants"))
        .workStatus,
    ).toBe("all");
    expect(
      parseRenewalDeskQueryV2(new URLSearchParams("v=2&workStatus=unavailable"))
        .workStatus,
    ).toBe("all");
    // Old bookmarks without the key keep working unchanged.
    const legacy = parseRenewalDeskQueryV2(
      new URLSearchParams("sort=end_date&scope=all"),
    );
    expect(legacy.workStatus).toBe("all");
    expect(serializeRenewalDeskQueryV2(legacy)).toBe("v=2&sort=end_date&scope=all");

    const state = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      scope: "all" as const,
      ownerKey: TOKEN_A,
      endDate: "2026-09-30",
      term: "fixed_term" as const,
      workStatus: "waiting_on_owner_response" as const,
    };
    const serialized = serializeRenewalDeskQueryV2(state);
    expect(serialized).toBe(
      `v=2&scope=all&endDate=2026-09-30&ownerKey=${TOKEN_A}&term=fixed_term&workStatus=waiting_on_owner_response`,
    );
    expect(serialized).not.toMatch(/op-1|op1%40|pmikcmetro|Owner\+Alpha/);
    const chips = buildActiveFilterChips(state);
    const chip = chips.find((entry) => entry.key === "workStatus");
    expect(chip?.label).toBe("Staff status: Waiting on owner response");
    expect(chip?.withoutFilter.workStatus).toBe("all");
    expect(chip?.withoutFilter.ownerKey).toBe(TOKEN_A);
    expect(workStatusFilterLabel("not_recorded")).toBe("Staff status: Not recorded");
    expect(matchesWorkStatusFilter("all", "unavailable")).toBe(true);
    expect(matchesWorkStatusFilter("not_recorded", "unavailable")).toBe(false);
    expect(matchesWorkStatusFilter("not_recorded", "not_recorded")).toBe(true);
    expect(matchesWorkStatusFilter("waiting_on_owner_response", "not_recorded")).toBe(
      false,
    );
  });

  it("AC-S119-3: combines the saved staff status with party and date filters over the same projection, with honest unavailable rows", () => {
    const items = [
      item("1", { workStatus: "waiting_on_owner_response" }),
      item("2", { workStatus: "waiting_on_owner_response", owners: ["Owner Beta"] }),
      item("3", { workStatus: "waiting_on_owner_response", endDateIso: "2026-10-15" }),
      item("4", { workStatus: "not_recorded" }),
      item("5", { workStatus: "unavailable" }),
      item("6", { omitWorkStatus: true }),
    ];
    const waitingOnOwners = applyRenewalDeskQueryV2(
      items,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, workStatus: "waiting_on_owner_response" },
      matchOwnerAlpha,
    );
    expect(waitingOnOwners.items.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
    const combined = applyRenewalDeskQueryV2(
      items,
      {
        ...DEFAULT_RENEWAL_DESK_QUERY_V2,
        workStatus: "waiting_on_owner_response",
        ownerKey: TOKEN_A,
        endDate: "2026-09-30",
      },
      matchOwnerAlpha,
    );
    expect(combined.items.map((entry) => entry.id)).toEqual(["1"]);
    expect(combined.totalLoaded).toBe(6);
    expect(combined.totalInScope).toBe(6);
    expect(combined.totalMatching).toBe(1);
    // Not recorded is a real filter value; an unavailable or unprojected row never matches it.
    const notRecorded = applyRenewalDeskQueryV2(
      items,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, workStatus: "not_recorded" },
      matchOwnerAlpha,
    );
    expect(notRecorded.items.map((entry) => entry.id)).toEqual(["4"]);
    // The existing overall-status filter is untouched by the staff annotation.
    const ready = applyRenewalDeskQueryV2(
      items,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, overallStatus: "ready" },
      matchOwnerAlpha,
    );
    expect(ready.items).toHaveLength(6);
  });

  it("AC-S119-3: carries the staff-status filter through the lease link and Back even after a save changes membership", () => {
    const state = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      workStatus: "waiting_on_owner_response" as const,
      ownerKey: TOKEN_A,
    };
    const deskView = encodeDeskView(state);
    if (!deskView) throw new Error("Expected a nondefault deskView.");
    expect(validateDeskView(deskView)).toBe(deskView);
    const href = buildWorkspaceHref({ leaseId: "701", deskView });
    const url = new URL(`https://app.example${href}`);
    expect(url.searchParams.get("deskView")).toBe(deskView);
    expect(buildDeskReturnHref(deskView)).toBe(`/lease-renewal/live/desk?${deskView}`);
    expect(parseDeskViewState(deskView)).toMatchObject({
      workStatus: "waiting_on_owner_response",
      ownerKey: TOKEN_A,
    });
    // After the lease's status is saved as something else, the same restored query simply
    // no longer lists it; the filter itself is never dropped to keep the row visible.
    const before = [item("701", { workStatus: "waiting_on_owner_response" })];
    const after = [item("701", { workStatus: "preparing_tenant_offer" })];
    const restored = parseDeskViewState(deskView);
    expect(
      applyRenewalDeskQueryV2(before, restored, matchOwnerAlpha).items.map(
        (entry) => entry.id,
      ),
    ).toEqual(["701"]);
    expect(applyRenewalDeskQueryV2(after, restored, matchOwnerAlpha).items).toEqual([]);
    expect(serializeRenewalDeskQueryV2(restored)).toBe(deskView);
    // A nested or damaged value still falls back to the default desk.
    expect(validateDeskView(`${deskView}&workStatus=not_recorded`)).toBeNull();
  });

  it("AC-S119-3: the desk query index takes the staff status from the one saved projection", () => {
    const base = getRenewalDeskView().items[0];
    const projection: RenewalWorkStatusProjection = projectRenewalWorkStatus(
      { available: true, record: record({ leaseId: base.id }) },
      null,
    );
    expect(
      withRenewalDeskQueryKeys({ ...base, workStatus: projection }).queryKeys.workStatus,
    ).toBe("waiting_on_owner_response");
    expect(
      withRenewalDeskQueryKeys({ ...base, workStatus: { state: "not_recorded" } })
        .queryKeys.workStatus,
    ).toBe("not_recorded");
    expect(
      withRenewalDeskQueryKeys({ ...base, workStatus: { state: "unavailable" } })
        .queryKeys.workStatus,
    ).toBe("unavailable");
    const { workStatus: _omitted, ...withoutProjection } = base;
    expect(withRenewalDeskQueryKeys(withoutProjection).queryKeys.workStatus).toBe(
      "unavailable",
    );
  });
});
