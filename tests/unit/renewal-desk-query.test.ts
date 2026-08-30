import { describe, expect, it } from "vitest";

import type {
  DeskLeaseSummaryBase,
  RenewalDeskRetentionState,
} from "@/lib/lease-renewal/desk-model";
import {
  DEFAULT_RENEWAL_DESK_QUERY,
  applyRenewalDeskQuery,
  buildRenewalDeskWindow,
  parseRenewalDeskQuery,
  serializeRenewalDeskQuery,
  withRenewalDeskQueryKeys,
} from "@/lib/lease-renewal/desk-query";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";

function followUp(
  input: {
    due?: RenewalFollowUpProjection["due"];
    waiting?: RenewalFollowUpProjection["waiting"];
  } = {},
): RenewalFollowUpProjection {
  return {
    version: "renewal-follow-up-v1",
    leaseId: "placeholder",
    asOfIso: "2026-08-29T12:00:00.000Z",
    linkedThread: null,
    waiting: input.waiting ?? { state: "not_waiting", party: null, source: null },
    lastContact: { state: "needs_verification", atIso: null, source: null },
    policy: {
      state: "unset",
      label: "Timing policy not confirmed",
      version: null,
      updatedAtIso: null,
      effectiveScope: null,
      effectiveKey: null,
      intervalDays: null,
    },
    due: input.due ?? { state: "unset", atIso: null },
    nextAction: "Continue from exact evidence.",
    workItem: null,
    attentionState: "not_applicable",
    attention: null,
  };
}

function deskItem(id: string, overrides: Partial<DeskLeaseSummaryBase> = {}) {
  const retention: RenewalDeskRetentionState = {
    state: "window",
    label: "Inside the active window",
  };
  const base: DeskLeaseSummaryBase = {
    id,
    addressLabel: `${id} Main St`,
    propertyNameLabel: null,
    tenantNameLabel: "Tenant Alpha",
    tenantNameLabels: ["Tenant Alpha"],
    ownerNameLabels: ["Owner Alpha"],
    identity: {
      address: {
        label: `${id} Main St`,
        sourceRef: `rentvine:lease:${id}:property`,
      },
      property: null,
      tenants: [
        {
          label: "Tenant Alpha",
          sourceRef: `rentvine:lease:${id}:tenants[0].name`,
        },
      ],
      owners: [
        {
          label: "Owner Alpha",
          sourceRef: `rentvine:lease:${id}:portfolio.owners[0].name`,
        },
      ],
    },
    endDateIso: "2026-09-30",
    disposition: "actionable",
    reason: "actionable",
    reasonLabel: "Ready to work",
    retention,
    processVersion: "renewal-v1",
    workflowStepId: "verify-renewal",
    stageIndex: 0,
    stageLabel: "Verify renewal",
    nextAction: "Verify exact source facts.",
    openConflicts: 0,
    followUp: followUp(),
    ...overrides,
  };
  if (!overrides.identity) {
    base.identity = {
      ...base.identity,
      tenants: base.tenantNameLabels.map((label, index) => ({
        label,
        sourceRef: `rentvine:lease:${id}:tenants[${index}].name`,
      })),
      owners: base.ownerNameLabels.map((label, index) => ({
        label,
        sourceRef: `rentvine:lease:${id}:portfolio.owners[${index}].name`,
      })),
    };
  }
  return withRenewalDeskQueryKeys(base);
}

describe("S78 renewal desk window", () => {
  it("starts on the first day of the current month and ends 120 days after today", () => {
    expect(buildRenewalDeskWindow("2026-08-29", 120)).toEqual({
      startIso: "2026-08-01",
      endIso: "2026-12-27",
    });
  });

  it("fails closed for an invalid date or horizon", () => {
    expect(() => buildRenewalDeskWindow("08/29/2026", 120)).toThrow(/ISO calendar date/);
    expect(() => buildRenewalDeskWindow("2026-08-29", -1)).toThrow(
      /non-negative integer/,
    );
  });
});

describe("S78 normalized search and cohort retention", () => {
  const exact = deskItem("RV-10", {
    addressLabel: "104 N.E. Lindsay Ave",
    propertyNameLabel: "North End",
    tenantNameLabel: "José O'Neil",
    tenantNameLabels: ["José O'Neil"],
    ownerNameLabels: ["Cedar-Holdings, LLC"],
    identity: {
      address: {
        label: "104 N.E. Lindsay Ave",
        sourceRef: "rentvine:lease:RV-10:property",
      },
      property: {
        label: "North End",
        sourceRef: "rentvine:lease:RV-10:property.name",
      },
      tenants: [
        {
          label: "José O'Neil",
          sourceRef: "rentvine:lease:RV-10:tenants[0].name",
        },
      ],
      owners: [
        {
          label: "Cedar-Holdings, LLC",
          sourceRef: "rentvine:lease:RV-10:portfolio.owners[0].name",
        },
      ],
    },
  });
  const tracked = deskItem("tracked-old", {
    endDateIso: "2026-07-31",
    disposition: "out_of_window",
    reason: "out_of_window",
    reasonLabel: "Outside this window",
    retention: {
      state: "tracked_incomplete",
      label: "Tracked incomplete renewal retained outside the active window",
    },
  });
  const untracked = deskItem("outside", {
    endDateIso: "2027-01-31",
    disposition: "out_of_window",
    reason: "out_of_window",
    reasonLabel: "Outside this window",
    retention: { state: "outside", label: "Outside the active window" },
  });

  it.each([
    ["jose oneil", ["RV-10"]],
    ["CEDAR holdings llc", ["RV-10"]],
    ["104 ne lindsay", ["RV-10"]],
    ["north-end", ["RV-10"]],
    ["rv10", ["RV-10"]],
    ["rv", []],
  ])("searches normalized exact-source fields for %s", (q, ids) => {
    expect(
      applyRenewalDeskQuery([exact], { ...DEFAULT_RENEWAL_DESK_QUERY, q }).items.map(
        (item) => item.id,
      ),
    ).toEqual(ids);
  });

  it("retains tracked incomplete work but excludes untracked outside-window rows by default", () => {
    const active = applyRenewalDeskQuery(
      [untracked, tracked, exact],
      DEFAULT_RENEWAL_DESK_QUERY,
    );
    expect(active.items.map((item) => item.id).sort()).toEqual(["RV-10", "tracked-old"]);

    const all = applyRenewalDeskQuery([untracked, tracked, exact], {
      ...DEFAULT_RENEWAL_DESK_QUERY,
      scope: "all",
    });
    expect(all.items).toHaveLength(3);
  });
});

describe("S78 deterministic URL, filters, and ordering", () => {
  const dueA = deskItem("lease-a", {
    endDateIso: "2026-09-30",
    tenantNameLabel: "Beta Tenant",
    tenantNameLabels: ["Beta Tenant"],
    ownerNameLabels: ["Zed Owner"],
    stageIndex: 1,
    workflowStepId: "owner-decision",
    stageLabel: "Owner decision",
    openConflicts: 2,
    followUp: followUp({
      due: { state: "due", atIso: "2026-08-27T12:00:00.000Z" },
      waiting: { state: "verified", party: "owner", source: null },
    }),
  });
  const dueB = deskItem("lease-b", {
    endDateIso: "2026-09-30",
    tenantNameLabel: "Alpha Tenant",
    tenantNameLabels: ["Alpha Tenant"],
    ownerNameLabels: ["Able Owner"],
    stageIndex: 2,
    workflowStepId: "tenant-decision",
    stageLabel: "Tenant decision",
    followUp: followUp({
      due: { state: "due", atIso: "2026-08-27T12:00:00.000Z" },
      waiting: { state: "verified", party: "tenant", source: null },
    }),
  });
  const missing = deskItem("lease-missing", {
    endDateIso: null,
    tenantNameLabel: "Needs Verification",
    tenantNameLabels: [],
    ownerNameLabels: [],
    identity: {
      address: {
        label: "lease-missing Main St",
        sourceRef: "rentvine:lease:lease-missing:property",
      },
      property: null,
      tenants: [],
      owners: [],
    },
    processVersion: null,
    workflowStepId: null,
    stageIndex: -1,
    stageLabel: null,
    nextAction: null,
    followUp: undefined,
  });
  const items = [missing, dueB, dueA];

  it("round-trips every supported URL field and drops invalid enum values to safe defaults", () => {
    const parsed = parseRenewalDeskQuery(
      new URLSearchParams({
        q: "Alpha tenant",
        sort: "owner",
        direction: "desc",
        scope: "all",
        endDate: "2026-09-30",
        month: "2026-09",
        due: "due",
        owner: "Able Owner",
        tenant: "Alpha Tenant",
        step: "tenant-decision",
        waiting: "tenant",
        conflicts: "without",
      }),
    );
    expect(
      parseRenewalDeskQuery(new URLSearchParams(serializeRenewalDeskQuery(parsed))),
    ).toEqual(parsed);
    expect(
      parseRenewalDeskQuery(
        new URLSearchParams({ sort: "random", direction: "sideways" }),
      ),
    ).toMatchObject({ sort: "due", direction: "asc" });
  });

  it("clearing search retains the selected sort and filters deterministically", () => {
    const state = {
      ...DEFAULT_RENEWAL_DESK_QUERY,
      q: "tenant",
      sort: "owner" as const,
      scope: "all" as const,
      due: "due" as const,
    };
    const cleared = new URLSearchParams(serializeRenewalDeskQuery({ ...state, q: "" }));
    expect(cleared.get("q")).toBeNull();
    expect(cleared.get("sort")).toBe("owner");
    expect(cleared.get("scope")).toBe("all");
    expect(cleared.get("due")).toBe("due");
  });

  it.each([
    ["end_date", ["lease-a", "lease-b", "lease-missing"]],
    ["month", ["lease-a", "lease-b", "lease-missing"]],
    ["owner", ["lease-b", "lease-a", "lease-missing"]],
    ["tenant", ["lease-b", "lease-a", "lease-missing"]],
    ["workflow_step", ["lease-a", "lease-b", "lease-missing"]],
    ["waiting_on", ["lease-a", "lease-b", "lease-missing"]],
    ["conflicts", ["lease-b", "lease-a", "lease-missing"]],
    ["due", ["lease-a", "lease-b", "lease-missing"]],
  ] as const)(
    "sorts %s with missing values last and lease-id ties stable",
    (sort, ids) => {
      expect(
        applyRenewalDeskQuery(items, {
          ...DEFAULT_RENEWAL_DESK_QUERY,
          scope: "all",
          sort,
        }).items.map((item) => item.id),
      ).toEqual(ids);
    },
  );

  it("keeps missing values last even when descending", () => {
    expect(
      applyRenewalDeskQuery(items, {
        ...DEFAULT_RENEWAL_DESK_QUERY,
        scope: "all",
        sort: "owner",
        direction: "desc",
      }).items.at(-1)?.id,
    ).toBe("lease-missing");
  });

  it.each([
    [{ endDate: "2026-09-30" }, ["lease-a", "lease-b"]],
    [{ endDate: "missing" }, ["lease-missing"]],
    [{ month: "2026-09" }, ["lease-a", "lease-b"]],
    [{ due: "due" }, ["lease-a", "lease-b"]],
    [{ owner: "Able Owner" }, ["lease-b"]],
    [{ tenant: "Alpha Tenant" }, ["lease-b"]],
    [{ step: "owner-decision" }, ["lease-a"]],
    [{ waiting: "owner" }, ["lease-a"]],
    [{ conflicts: "with" }, ["lease-a"]],
    [{ conflicts: "without" }, ["lease-b"]],
  ] as const)("applies the explicit filter %j", (filter, ids) => {
    expect(
      applyRenewalDeskQuery(items, {
        ...DEFAULT_RENEWAL_DESK_QUERY,
        scope: "all",
        ...filter,
      }).items.map((item) => item.id),
    ).toEqual(ids);
  });

  it("never mutates the source projection while searching, filtering, or sorting", () => {
    const before = structuredClone(items);
    Object.freeze(items);
    for (const item of items) Object.freeze(item);
    applyRenewalDeskQuery(items, {
      ...DEFAULT_RENEWAL_DESK_QUERY,
      scope: "all",
      sort: "tenant",
      q: "tenant",
    });
    expect(items).toEqual(before);
  });
});
