// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  FILTERED_EMPTY_COPY,
  PARTY_FILTERING_UNAVAILABLE_NOTICE,
  RenewalDeskTable,
  UNFILTERED_EMPTY_COPY,
  type DeskPartyShortcuts,
} from "@/components/lease-renewal/RenewalDeskTable";
import type {
  DeskLeaseGuidance,
  DeskLeaseRow,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";

const TOKEN_A = `p1_${"a".repeat(43)}`;

const shortcuts: DeskPartyShortcuts = {
  available: true,
  tokenFor: (kind, normalizedLabel) =>
    kind === "owner" && normalizedLabel === "owner alpha" ? TOKEN_A : null,
};

function guidance(overrides: Partial<DeskLeaseGuidance> = {}): DeskLeaseGuidance {
  return {
    currentBaseRent: 1500,
    currentBaseRentSource: "RentVine",
    rentVerification: {
      state: "verified",
      verifiedByResolutionDiffers: false,
      destination: { kind: "workspace_phase", stepId: "verify-renewal" },
    },
    overallStatus: "ready",
    urgencyRank: OVERALL_STATUS_URGENCY_RANK.ready,
    isBlocked: false,
    blockers: [],
    action: {
      kind: "act",
      label: "Record the owner decision.",
      destination: { kind: "workspace_phase", stepId: "owner-decision" },
    },
    ...overrides,
  };
}

function row(
  id: string,
  overrides: Partial<DeskLeaseSummaryBase> = {},
  guidanceOverrides: Partial<DeskLeaseGuidance> = {},
): DeskLeaseRow {
  const base: DeskLeaseSummaryBase = {
    id,
    addressLabel: `${id} Main St`,
    propertyNameLabel: "Maple Portfolio",
    tenantNameLabel: "Tenant Alpha",
    tenantNameLabels: ["Tenant Alpha"],
    ownerNameLabels: ["Owner Alpha"],
    identity: {
      address: { label: `${id} Main St`, sourceRef: `rentvine:lease:${id}:property` },
      property: {
        label: "Maple Portfolio",
        sourceRef: `rentvine:lease:${id}:property.name`,
      },
      tenants: [
        { label: "Tenant Alpha", sourceRef: `rentvine:lease:${id}:tenants[0].name` },
      ],
      owners: [
        {
          label: "Owner Alpha",
          sourceRef: `rentvine:lease:${id}:portfolio.owners[0].name`,
        },
      ],
    },
    endDateIso: "2026-10-15",
    disposition: "actionable",
    reason: "actionable",
    reasonLabel: "Ready to work",
    retention: { state: "window", label: "Inside the current-month renewal window" },
    processVersion: "renewal-v1",
    workflowStepId: "owner-decision",
    stageIndex: 1,
    stageLabel: "Owner decision",
    nextAction: "Record the owner decision.",
    openConflicts: 0,
    ...overrides,
  };
  return { ...withRenewalDeskQueryKeys(base), guidance: guidance(guidanceOverrides) };
}

const state: RenewalDeskQueryV2State = { ...DEFAULT_RENEWAL_DESK_QUERY_V2 };

afterEach(cleanup);

describe("S82 table structure and sorting semantics", () => {
  it("renders the caption, sortable headers with aria-sort, and no menu roles", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, sort: "base_rent", direction: "desc" }}
        totalBeforeQuery={1}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    const sorted = document.querySelector('th[aria-sort="descending"]');
    expect(sorted?.textContent).toContain("Current base rent");
    expect(document.querySelectorAll("th[aria-sort]")).toHaveLength(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    // The scroll container is a labelled, keyboard-reachable region.
    expect(screen.getByRole("region", { name: "Renewal table" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("keeps every non-owned filter as hidden state inside a header sort form", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, overallStatus: "blocked", ownerKey: TOKEN_A }}
        totalBeforeQuery={1}
      />,
    );
    const button = screen.getByRole("button", { name: /Renewal date/ });
    const form = button.closest("form");
    if (!form) throw new Error("Missing sort form");
    const hidden = [...form.querySelectorAll("input[type=hidden]")].map((node) => [
      node.getAttribute("name"),
      node.getAttribute("value"),
    ]);
    expect(hidden).toContainEqual(["overallStatus", "blocked"]);
    expect(hidden).toContainEqual(["ownerKey", TOKEN_A]);
    expect(hidden).toContainEqual(["sort", "end_date"]);
  });
});

describe("S82 row cells and exact-value shortcuts", () => {
  it("links the lease label to the workspace carrying the desk continuation", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, sort: "base_rent" }}
        totalBeforeQuery={1}
      />,
    );
    const lease = screen.getByRole("link", { name: "L1 Main St" });
    const url = new URL(`https://x${lease.getAttribute("href")}`);
    expect(url.pathname).toBe("/lease-renewal/live/desk/lease/L1");
    expect(url.searchParams.get("deskView")).toBe("v=2&sort=base_rent");
  });

  it("applies the opaque owner key on the owner shortcut and never a display label", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={1}
      />,
    );
    const owner = screen.getByRole("link", { name: "Owner Alpha" });
    const href = owner.getAttribute("href") ?? "";
    expect(href).toContain(`ownerKey=${TOKEN_A}`);
    expect(href).not.toContain("Owner");
    // The tenant has no issued token in this fixture, so it renders as plain text.
    expect(screen.queryByRole("link", { name: "Tenant Alpha" })).toBeNull();
    expect(screen.getByText("Tenant Alpha")).toBeInTheDocument();
  });

  it("renders plain party text plus the exact unavailability notice when keys are unconfigured", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
        state={state}
        totalBeforeQuery={1}
      />,
    );
    expect(screen.queryByRole("link", { name: "Owner Alpha" })).toBeNull();
    expect(
      screen.getAllByText(PARTY_FILTERING_UNAVAILABLE_NOTICE).length,
    ).toBeGreaterThan(0);
  });

  it("clears the other date representations in the renewal-date shortcut", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, month: "2026-09" }}
        totalBeforeQuery={1}
      />,
    );
    const date = screen.getByRole("link", { name: "2026-10-15" });
    const href = date.getAttribute("href") ?? "";
    expect(href).toContain("endDate=2026-10-15");
    expect(href).not.toContain("month=");
  });

  it("formats the RentVine amount, marks a differing resolution, and never coerces missing to zero", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row(
            "L1",
            {},
            {
              rentVerification: {
                state: "verified",
                verifiedByResolutionDiffers: true,
                destination: { kind: "workspace_phase", stepId: "verify-renewal" },
              },
            },
          ),
          row("L2", { addressLabel: "L2 Main St" }, { currentBaseRent: null }),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={2}
      />,
    );
    expect(screen.getByText("$1,500")).toBeInTheDocument();
    expect(
      screen.getByText("Verified by resolution · differs from RentVine"),
    ).toBeInTheDocument();
    expect(screen.queryByText("$0")).toBeNull();
    const l2 = screen.getByText("L2 Main St").closest("tr");
    expect(
      within(l2 as HTMLElement).getAllByText("Needs Verification").length,
    ).toBeGreaterThan(0);
  });
});

describe("S82 action cell", () => {
  it("renders every causal blocker as a phase link carrying the continuation", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row(
            "L1",
            {},
            {
              overallStatus: "blocked",
              urgencyRank: OVERALL_STATUS_URGENCY_RANK.blocked,
              isBlocked: true,
              action: { kind: "blocked" },
              blockers: [
                {
                  id: "b1",
                  label: "Contractual base rent is missing.",
                  type: "evidence",
                  phaseId: "verify-renewal",
                  destination: { kind: "workspace_phase", stepId: "verify-renewal" },
                },
                {
                  id: "b2",
                  label: "2 blocking source items remain.",
                  type: "evidence",
                  phaseId: "verify-renewal",
                  destination: { kind: "workspace_phase", stepId: "verify-renewal" },
                  requiredCapability: "approve",
                },
              ],
            },
          ),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, blocked: "blocked" }}
        totalBeforeQuery={1}
      />,
    );
    const blocker = screen.getByRole("link", {
      name: "Contractual base rent is missing.",
    });
    const href = blocker.getAttribute("href") ?? "";
    expect(href).toContain("/lease-renewal/live/desk/lease/L1");
    expect(href).toContain("step=verify-renewal");
    expect(href).toContain("deskView=");
    expect(
      screen.getByRole("link", { name: "2 blocking source items remain." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });

  it("swaps a capability-gated next control for the exact S83 access handoff", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row(
            "L1",
            {},
            {
              action: {
                kind: "act",
                label: "Record an exact source disposition.",
                destination: { kind: "workspace_phase", stepId: "verify-renewal" },
                requiredCapability: "approve",
              },
            },
          ),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, lease: "Main" }}
        totalBeforeQuery={1}
      />,
    );
    const request = screen.getByRole("link", { name: "Request access" });
    const href = request.getAttribute("href") ?? "";
    expect(href).toContain("/admin/access?");
    expect(href).toContain("capability=approve");
    // An active text filter warns that the access return clears it.
    expect(
      screen.getByText("Your text search will be cleared in the access return link."),
    ).toBeInTheDocument();
  });
});

describe("S82 chips, clear control, and zero states", () => {
  it("renders one removable chip per filter and Clear filters retains the sort", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{
          ...state,
          sort: "tenant",
          direction: "desc",
          overallStatus: "ready",
          ownerKey: TOKEN_A,
        }}
        totalBeforeQuery={1}
      />,
    );
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getByText("Owner: selected")).toBeInTheDocument();
    expect(within(chips).getByText("Status: ready")).toBeInTheDocument();
    const removeOwner = screen.getByRole("link", {
      name: "Remove filter: Owner: selected",
    });
    expect(removeOwner.getAttribute("href")).not.toContain("ownerKey");
    const clear = screen.getByRole("link", { name: "Clear filters" });
    const clearHref = clear.getAttribute("href") ?? "";
    expect(clearHref).toContain("sort=tenant");
    expect(clearHref).toContain("direction=desc");
    expect(clearHref).not.toContain("overallStatus");
  });

  it("renders the exact unfiltered-empty and filtered-empty copies and keeps table semantics", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={0}
      />,
    );
    expect(screen.getByText(UNFILTERED_EMPTY_COPY)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    cleanup();

    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, overallStatus: "blocked" }}
        totalBeforeQuery={4}
      />,
    );
    expect(screen.getByText(FILTERED_EMPTY_COPY)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("never claims an empty worklist from a partial or failed read", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[]}
        shortcuts={shortcuts}
        sourceReadOk={false}
        state={state}
        totalBeforeQuery={0}
      />,
    );
    expect(screen.queryByText(UNFILTERED_EMPTY_COPY)).toBeNull();
    expect(screen.queryByText(FILTERED_EMPTY_COPY)).toBeNull();
    expect(screen.getByText(/cannot claim an empty worklist/)).toBeInTheDocument();
  });
});
