// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  FILTERED_EMPTY_COPY,
  PARTY_FILTERING_UNAVAILABLE_NOTICE,
  RenewalDeskTable,
  UNFILTERED_EMPTY_COPY,
  buildDeskPartyFilterOptions,
  type DeskPartyShortcuts,
} from "@/components/lease-renewal/RenewalDeskTable";
import type {
  DeskLeaseGuidance,
  DeskLeaseRow,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  fixedTermProjection,
  monthToMonthProjection,
  needsReviewTermProjection,
} from "@/tests/helpers/lease-term-fixtures";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";

const TOKEN_A = `p1_${"a".repeat(43)}`;
const TOKEN_B = `p1_${"b".repeat(43)}`;

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
    leaseTerm: fixedTermProjection("2026-10-15"),
    currentRent: 1500,
    unitListedRent: 1500,
    retention: { state: "window", label: "Inside the current-month renewal window" },
    processVersion: "renewal-v1",
    workflowStepId: "owner-decision",
    stageIndex: 1,
    stageLabel: "Owner decision",
    nextAction: "Record the owner decision.",
    openConflicts: 0,
    ...overrides,
  };
  return {
    ...withRenewalDeskQueryKeys(base),
    processState: {
      status: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
    },
    guidance: guidance(guidanceOverrides),
  };
}

const state: RenewalDeskQueryV2State = { ...DEFAULT_RENEWAL_DESK_QUERY_V2 };

afterEach(cleanup);

describe("S103 visible lease term (BEH-S103-2 / BEH-S103-3)", () => {
  it("shows each row's term and, for month-to-month, its next review date", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("L1"),
          row("L2", {
            leaseTerm: monthToMonthProjection("2025-09-15"),
            retention: {
              state: "periodic_review",
              label: "Periodic review due 2026-09-15",
            },
          }),
          row("L3", { leaseTerm: needsReviewTermProjection() }),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={3}
      />,
    );

    const cells = Array.from(
      document.querySelectorAll('[data-renewal-field="lease-term"]'),
    );
    expect(cells.map((cell) => cell.getAttribute("data-lease-term"))).toEqual([
      "fixed_term",
      "month_to_month",
      "needs_review",
    ]);
    expect(cells[0]).toHaveTextContent("Fixed-term");
    expect(cells[1]).toHaveTextContent("Month-to-month · review due 2026-09-15");
    expect(cells[2]).toHaveTextContent("Needs review");
  });

  it("says the review date needs review when a month-to-month lease has no anchor", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1", { leaseTerm: monthToMonthProjection(null) })]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={1}
      />,
    );
    expect(document.querySelector('[data-renewal-field="lease-term"]')).toHaveTextContent(
      "Month-to-month · review date needs review",
    );
  });

  it("offers a term header filter and renders an active term filter as a removable chip", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, term: "month_to_month" }}
        totalBeforeQuery={1}
      />,
    );
    expect(screen.getByLabelText("Lease term")).toBeInTheDocument();
    expect(screen.getByText("Lease term: month to month")).toBeInTheDocument();
  });
});

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

  it("labels matching, selected-scope, and loaded totals plus the always-visible default scope", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadComplete={false}
        sourceReadOk={false}
        state={state}
        totalInScope={4}
        totalLoaded={5}
      />,
    );

    expect(
      screen.getByText(
        "Matching: 1 · Selected scope: 4 · Total loaded: 5 (partial portfolio read)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Worklist scope:/).parentElement).toHaveTextContent(
      "Current window and tracked incomplete",
    );
  });

  it("keeps exact portfolio counts separate from unavailable dependent status", () => {
    render(
      <RenewalDeskTable
        dependentStateComplete={false}
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadComplete
        sourceReadOk
        state={state}
        totalInScope={4}
        totalLoaded={5}
      />,
    );

    expect(
      screen.getByText("Matching: 1 · Selected scope: 4 · Total loaded: 5"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/partial portfolio read/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Incomplete: refresh before relying/)).toBeInTheDocument();
  });

  it("offers discoverable exact owner and tenant choices using only opaque tokens", () => {
    render(
      <RenewalDeskTable
        partyOptions={{
          owner: [{ label: "Owner Alpha", token: TOKEN_A }],
          tenant: [{ label: "Tenant Alpha", token: TOKEN_B }],
        }}
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalInScope={1}
        totalLoaded={1}
      />,
    );

    const owner = document.querySelector<HTMLSelectElement>("#renewal-filter-ownerKey");
    const tenant = document.querySelector<HTMLSelectElement>("#renewal-filter-tenantKey");
    expect(owner).not.toBeNull();
    expect(tenant).not.toBeNull();
    expect([...owner!.options].map((option) => [option.text, option.value])).toEqual([
      ["All owners", ""],
      ["Owner Alpha", TOKEN_A],
    ]);
    expect([...tenant!.options].map((option) => [option.text, option.value])).toEqual([
      ["All tenants", ""],
      ["Tenant Alpha", TOKEN_B],
    ]);
    expect(TOKEN_A).toMatch(/^p1_[A-Za-z0-9_-]{43}$/);
    expect(TOKEN_B).toMatch(/^p1_[A-Za-z0-9_-]{43}$/);
  });

  it("derives stable party choices only from valid issued tokens in the supplied projection", () => {
    const options = buildDeskPartyFilterOptions([row("L2"), row("L1")], {
      available: true,
      tokenFor: (kind, normalizedLabel) =>
        kind === "owner" && normalizedLabel === "owner alpha"
          ? TOKEN_A
          : "not-an-opaque-token",
    });
    expect(options.owner).toEqual([{ label: "Owner Alpha", token: TOKEN_A }]);
    expect(options.tenant).toEqual([]);
  });

  it("uses native date controls and exposes symbolic invalid-range feedback", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...state, dateDiagnostics: ["range_reversed", "range_too_long"] }}
        totalInScope={1}
        totalLoaded={1}
      />,
    );

    expect(document.querySelector("#renewal-filter-endDate")).toHaveAttribute(
      "type",
      "date",
    );
    expect(document.querySelector("#renewal-filter-month")).toHaveAttribute(
      "type",
      "month",
    );
    expect(document.querySelector("#renewal-filter-from")).toHaveAttribute(
      "type",
      "date",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The range end must be on or after the range start.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Renewal date ranges can cover at most 120 days.",
    );
    expect(
      screen.getByText("Filter renewal date", { exact: true }).closest("details"),
    ).toHaveAttribute("open");
  });

  it("announces a pending GET filter submission and prevents a repeat submit", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalInScope={1}
        totalLoaded={1}
      />,
    );
    const input = document.querySelector("#renewal-filter-lease");
    const form = input?.closest("form");
    if (!form) throw new Error("Missing lease filter form");
    fireEvent.submit(form);
    expect(within(form).getByRole("button", { name: "Applying…" })).toBeDisabled();
    expect(within(form).getByRole("status")).toHaveTextContent(
      "Applying lease or location filter.",
    );
    expect(form).toHaveAttribute("aria-busy", "true");
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
    const leaseRow = lease.closest("tr");
    expect(leaseRow).toHaveAttribute("data-lease-id", "L1");
    expect(leaseRow).toHaveAttribute("data-disposition", "actionable");
    expect(leaseRow).toHaveAttribute("data-status", "ready");
    expect(leaseRow).toHaveAttribute("data-rent-verification", "verified");
    expect(leaseRow).toHaveAttribute("data-rent-verification-differs", "false");
    expect(leaseRow).toHaveAttribute("data-is-blocked", "false");
    expect(leaseRow).toHaveAttribute("data-action-kind", "act");
    expect(leaseRow).toHaveAttribute("data-blocker-count", "0");
    expect(leaseRow).toHaveAttribute("data-process-status", "active");
    expect(leaseRow).toHaveAttribute("data-process-current-step", "owner-decision");
    expect(leaseRow).toHaveAttribute("data-process-current-step-state", "ready");
    expect(leaseRow).toHaveAttribute("data-retention-state", "window");
    expect(leaseRow).toHaveAttribute("data-waiting-party", "none");
    expect(leaseRow).toHaveAttribute("data-workspace-available", "true");
    expect(
      leaseRow?.querySelector('[data-renewal-field="overall-status"]'),
    ).toHaveAttribute("data-status", "ready");
    expect(
      leaseRow?.querySelector('[data-renewal-field="rent-verification"]'),
    ).toHaveAttribute("data-rent-verification", "verified");
    expect(leaseRow?.querySelector('[data-renewal-field="action"]')).toHaveAttribute(
      "data-action-destination-kind",
      "workspace_phase",
    );
    expect(leaseRow?.querySelector('[data-renewal-field="action"]')).toHaveAttribute(
      "data-action-step-id",
      "owner-decision",
    );
  });

  it("keeps review leases inspectable and makes definitive skips non-navigable", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("SKIP", {
            disposition: "skip",
            reason: "month_to_month",
            reasonLabel: "Month-to-month",
          }),
          row("REVIEW", {
            disposition: "review",
            reason: "no_end_date",
            reasonLabel: "No end date on file",
          }),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={2}
      />,
    );

    const review = screen.getByRole("link", { name: "REVIEW Main St" });
    expect(review.closest("tr")).toHaveAttribute("data-workspace-available", "true");
    expect(
      document.querySelector('tr[data-workspace-available="true"] a.renewal-lease-link'),
    ).toBe(review);
    expect(screen.queryByRole("link", { name: "SKIP Main St" })).toBeNull();
    const skipRow = screen.getByText("SKIP Main St").closest("tr");
    expect(skipRow).toHaveAttribute("data-workspace-available", "false");
    expect(
      [...(skipRow?.querySelectorAll("a") ?? [])].some((link) =>
        link.getAttribute("href")?.includes("/desk/lease/SKIP"),
      ),
    ).toBe(false);
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

  it("renders a server-validated RentVine destination as a protected external link", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("L1", {
            sourceDestinations: {
              rentvine: {
                kind: "external",
                href: "https://pmikcmetro.rentvine.com/leases/1",
                label: "Opens this lease in RentVine in a new tab.",
              },
            },
          }),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalInScope={1}
        totalLoaded={1}
      />,
    );
    const source = screen.getByRole("link", {
      name: "Open lease L1 in RentVine in a new tab",
    });
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(source).toHaveAttribute("href", "https://pmikcmetro.rentvine.com/leases/1");
  });
});

describe("S82 action cell", () => {
  it("renders every causal blocker as a phase link for a capable actor", () => {
    render(
      <RenewalDeskTable
        role="Admin"
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
    const rowElement = blocker.closest("tr");
    expect(rowElement).toHaveAttribute("data-action-kind", "blocked");
    expect(rowElement).toHaveAttribute("data-is-blocked", "true");
    expect(rowElement).toHaveAttribute("data-blocker-count", "2");
    const blockerItem = blocker.closest("li");
    expect(blockerItem).toHaveAttribute("data-blocker-id", "b1");
    expect(blockerItem).toHaveAttribute("data-blocker-type", "evidence");
    expect(blockerItem).toHaveAttribute("data-blocker-phase-id", "verify-renewal");
    expect(blockerItem).toHaveAttribute(
      "data-blocker-destination-kind",
      "workspace_phase",
    );
    expect(blockerItem).toHaveAttribute("data-blocker-step-id", "verify-renewal");
    expect(blockerItem).toHaveAttribute("data-required-capability", "none");
  });

  it("swaps a capability-gated blocker for the exact S83 access handoff", () => {
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
                  id: "source-resolution:0",
                  label: "Record an exact source disposition.",
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
        state={{ ...state, ownerKey: TOKEN_A, overallStatus: "blocked" }}
        totalBeforeQuery={1}
      />,
    );

    expect(
      screen.getByText("Record an exact source disposition.").closest("a"),
    ).toBeNull();
    const request = screen.getByRole("link", { name: "Request access" });
    const handoff = new URL(`https://example.invalid${request.getAttribute("href")}`);
    expect(handoff.searchParams.get("capability")).toBe("approve");
    const returnTo = new URL(
      handoff.searchParams.get("return_to")!,
      "https://example.invalid",
    );
    expect(returnTo.pathname).toBe("/lease-renewal/live/desk");
    expect(returnTo.searchParams.get("ownerKey")).toBe(TOKEN_A);
    expect(returnTo.searchParams.get("overallStatus")).toBe("blocked");
  });

  it("renders needs-verification causal blockers while definitive skips stay unlinked", () => {
    const blockerGuidance: Partial<DeskLeaseGuidance> = {
      overallStatus: "needs_verification",
      urgencyRank: OVERALL_STATUS_URGENCY_RANK.needs_verification,
      isBlocked: true,
      action: {
        kind: "needs_verification",
        label: "Current process state needs verification.",
        destination: { kind: "workspace_phase", stepId: "verify-renewal" },
      },
      blockers: [
        {
          id: "source-check:0",
          label: "Review the current source conflict.",
          type: "source",
          phaseId: "verify-renewal",
          destination: { kind: "workspace_phase", stepId: "verify-renewal" },
        },
      ],
    };
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("L1", {}, blockerGuidance),
          row(
            "SKIP",
            {
              disposition: "skip",
              reason: "month_to_month",
              reasonLabel: "Month-to-month",
            },
            {
              ...blockerGuidance,
              blockers: [
                {
                  id: "skip-check:0",
                  label: "Review the definitive skip evidence.",
                  type: "evidence",
                  phaseId: "verify-renewal",
                  destination: {
                    kind: "workspace_phase",
                    stepId: "verify-renewal",
                  },
                },
              ],
            },
          ),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={2}
      />,
    );

    const eligible = screen.getByRole("link", {
      name: "Review the current source conflict.",
    });
    expect(eligible.getAttribute("href")).toContain("step=verify-renewal");
    const skipText = screen.getByText("Review the definitive skip evidence.");
    expect(skipText.closest("a")).toBeNull();
    expect(skipText.closest("tr")).toHaveAttribute("data-workspace-available", "false");
    expect(skipText.closest("li")).toHaveAttribute("data-blocker-id", "skip-check:0");
  });

  it("links eligible review work to verification but leaves unread progress non-actionable", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row(
            "REVIEW",
            {
              disposition: "review",
              reason: "no_end_date",
              reasonLabel: "No end date on file",
            },
            {
              overallStatus: "needs_verification",
              urgencyRank: OVERALL_STATUS_URGENCY_RANK.needs_verification,
              isBlocked: true,
              action: {
                kind: "needs_verification",
                label: "Resolve the missing renewal date.",
                destination: {
                  kind: "workspace_phase",
                  stepId: "verify-renewal",
                },
              },
            },
          ),
          row(
            "UNREAD",
            {},
            {
              overallStatus: "needs_verification",
              urgencyRank: OVERALL_STATUS_URGENCY_RANK.needs_verification,
              isBlocked: true,
              action: {
                kind: "needs_verification",
                label:
                  "Saved renewal progress could not be verified. Refresh before acting.",
                destination: { kind: "none" },
              },
            },
          ),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={state}
        totalBeforeQuery={2}
      />,
    );

    const reviewAction = screen.getByRole("link", {
      name: "Resolve the missing renewal date.",
    });
    expect(reviewAction.getAttribute("href")).toContain("step=verify-renewal");
    const unreadAction = screen.getByText(
      "Saved renewal progress could not be verified. Refresh before acting.",
    );
    expect(unreadAction.closest("a")).toBeNull();
    expect(unreadAction.closest("td")).toHaveAttribute(
      "data-action-destination-kind",
      "none",
    );
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
        state={{
          ...state,
          q: "legacy words",
          lease: "Main",
          ownerKey: TOKEN_A,
          scope: "tracked",
          overallStatus: "blocked",
        }}
        totalBeforeQuery={1}
      />,
    );
    const request = screen.getByRole("link", { name: "Request access" });
    const href = request.getAttribute("href") ?? "";
    expect(href).toContain("/admin/access?");
    expect(href).toContain("capability=approve");
    const handoff = new URL(`https://example.invalid${href}`);
    const returnTo = handoff.searchParams.get("return_to");
    expect(returnTo).not.toBeNull();
    const restored = new URL(returnTo!, "https://example.invalid");
    expect(restored.pathname).toBe("/lease-renewal/live/desk");
    expect(restored.searchParams.get("ownerKey")).toBe(TOKEN_A);
    expect(restored.searchParams.get("scope")).toBe("tracked");
    expect(restored.searchParams.get("overallStatus")).toBe("blocked");
    expect(restored.searchParams.has("q")).toBe(false);
    expect(restored.searchParams.has("lease")).toBe(false);
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
