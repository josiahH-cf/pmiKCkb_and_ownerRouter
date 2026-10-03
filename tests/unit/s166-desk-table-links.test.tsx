// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RenewalDeskTable,
  type DeskPartyShortcuts,
} from "@/components/lease-renewal/RenewalDeskTable";
import { resetRenewalDeskViewMemoryForTests } from "@/components/lease-renewal/RenewalDeskViewMemory";
import type {
  DeskLeaseGuidance,
  DeskLeaseRow,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
  applyRenewalDeskQueryV2,
  renewalDeskUrlNamesView,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";

// S166 (F15) and the S154 desk item: every worklist control names its view explicitly, every
// resolved lease row opens its workspace, and the account's remembered view is visible and
// resettable. Synthetic rows only.

const shortcuts: DeskPartyShortcuts = { available: false, tokenFor: () => null };

function guidance(overrides: Partial<DeskLeaseGuidance> = {}): DeskLeaseGuidance {
  return {
    currentBaseRent: 1500,
    currentBaseRentSource: "RentVine",
    rentVerification: {
      state: "needs_verification",
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
    addressLabel: `${id} Sample St`,
    propertyNameLabel: "Sample Portfolio",
    tenantNameLabel: "Tenant Sample",
    tenantNameLabels: ["Tenant Sample"],
    ownerNameLabels: ["Owner Sample"],
    identity: {
      address: { label: `${id} Sample St`, sourceRef: `rentvine:lease:${id}:property` },
      property: {
        label: "Sample Portfolio",
        sourceRef: `rentvine:lease:${id}:property.name`,
      },
      tenants: [
        { label: "Tenant Sample", sourceRef: `rentvine:lease:${id}:tenants[0].name` },
      ],
      owners: [
        {
          label: "Owner Sample",
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

const DEFAULT: RenewalDeskQueryV2State = { ...DEFAULT_RENEWAL_DESK_QUERY_V2 };

function deskHrefs(): string[] {
  return [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => href.split("?")[0] === "/lease-renewal/live/desk");
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetRenewalDeskViewMemoryForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S154 desk item: every resolved lease row opens its workspace", () => {
  it("BEH-S154-1 / BEH-S154-2: a row classified skip keeps its classification as context and gets the normal workspace links", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row("7001"),
          row(
            "7002",
            {
              disposition: "skip",
              reason: "month_to_month",
              reasonLabel: "Month-to-month",
              retention: { state: "outside", label: "Outside the renewal window" },
            },
            {
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
                  label: "Review the current source value.",
                  type: "source",
                  phaseId: "verify-renewal",
                  destination: { kind: "workspace_phase", stepId: "verify-renewal" },
                },
              ],
            },
          ),
          row("7003", {
            disposition: "skip",
            reason: "program",
            reasonLabel: "Program lease",
          }),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT, scope: "all" }}
        totalBeforeQuery={3}
      />,
    );

    for (const id of ["7001", "7002", "7003"]) {
      const link = screen.getByRole("link", { name: `${id} Sample St` });
      const url = new URL(`https://x${link.getAttribute("href")}`);
      expect(url.pathname).toBe(`/lease-renewal/live/desk/lease/${id}`);
      expect(url.searchParams.get("deskView")).toBe("v=2&scope=all");
      expect(link.closest("tr")).toHaveAttribute("data-workspace-available", "true");
    }
    const skipRow = screen.getByRole("link", { name: "7002 Sample St" }).closest("tr")!;
    // The classification stays readable and filterable; it no longer removes the link.
    expect(skipRow).toHaveAttribute("data-disposition", "skip");
    expect(
      skipRow.querySelector('[data-renewal-field="disposition-context"]'),
    ).toHaveTextContent("Month-to-month");
    // Its blocker and rent links open the same workspace as any other row's.
    const blocker = within(skipRow).getByRole("link", {
      name: "Review the current source value.",
    });
    expect(blocker.getAttribute("href")).toContain(
      "/lease-renewal/live/desk/lease/7002?",
    );
    expect(blocker.getAttribute("href")).toContain("step=verify-renewal");
    expect(
      within(skipRow)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.includes("/desk/lease/7002")).length,
    ).toBeGreaterThanOrEqual(3);
    // An ordinary skip row's action opens the workspace too.
    const ended = screen.getByRole("link", { name: "7003 Sample St" }).closest("tr")!;
    expect(
      within(ended).getByRole("link", { name: "Record the owner decision." }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/lease-renewal/live/desk/lease/7003?step=owner-decision"),
    );
    // A row with no resolved lease id still gets no fabricated link.
    cleanup();
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("", { addressLabel: "Unresolved Sample St" })]}
        shortcuts={shortcuts}
        sourceReadOk
        state={DEFAULT}
        totalBeforeQuery={1}
      />,
    );
    expect(screen.queryByRole("link", { name: "Unresolved Sample St" })).toBeNull();
    expect(screen.getByText("Unresolved Sample St").closest("tr")).toHaveAttribute(
      "data-workspace-available",
      "false",
    );
  });
});

describe("S166 worklist controls name their view (ARCH-S166-3)", () => {
  it("BEH-S166-7 / BEH-S166-8: every control that changes the view links an explicit view, including the default", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("7001")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT, scope: "all", overallStatus: "ready" }}
        totalBeforeQuery={1}
      />,
    );
    const hrefs = deskHrefs();
    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs) {
      expect(renewalDeskUrlNamesView(new URLSearchParams(href.split("?")[1] ?? ""))).toBe(
        true,
      );
    }
    // Removing the last filter, or choosing the default worklist, is an explicit default link.
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/lease-renewal/live/desk?v=2",
    );
    cleanup();
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("7001")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT, scope: "all" }}
        totalBeforeQuery={1}
      />,
    );
    expect(
      screen
        .getByRole("navigation", { name: "Worklist views" })
        .querySelector('[data-view="active"]'),
    ).toHaveAttribute("href", "/lease-renewal/live/desk?v=2");
    // Every GET form already submits the version marker, so a form result is explicit too.
    for (const form of document.querySelectorAll("form")) {
      expect(form.querySelector('input[name="v"][value="2"]')).not.toBeNull();
    }
  });

  it("BEH-S166-6 / BEH-S166-7: the remembered view is labelled and can be reset to the default", async () => {
    const saved = "v=2&scope=all";
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("7001")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT, scope: "all" }}
        totalBeforeQuery={1}
        viewMemory={{ source: "saved", savedView: saved, memory: "saved" }}
      />,
    );
    const worklist = screen.getByRole("region", { name: "Renewal worklist" });
    expect(worklist).toHaveAttribute("data-desk-view-source", "saved");
    expect(within(worklist).getByText("Showing your saved view.")).toBeInTheDocument();
    expect(
      within(worklist).getByRole("link", { name: "Reset to default view" }),
    ).toHaveAttribute("href", "/lease-renewal/live/desk?v=2");
  });

  it("BEH-S166-8 / AC-S166-3: the explicit default view carries itself through a lease and back while another view is remembered", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("7001")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={DEFAULT}
        totalBeforeQuery={1}
        viewMemory={{ source: "explicit", savedView: "v=2&scope=all", memory: "saved" }}
      />,
    );
    const url = new URL(
      `https://x${screen.getByRole("link", { name: "7001 Sample St" }).getAttribute("href")}`,
    );
    expect(url.searchParams.get("deskView")).toBe("v=2");
  });

  it("BEH-S166-10: with nothing remembered, default-view lease links stay exactly as before", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("7001")]}
        shortcuts={shortcuts}
        sourceReadOk
        state={DEFAULT}
        totalBeforeQuery={1}
      />,
    );
    expect(screen.getByRole("link", { name: "7001 Sample St" })).toHaveAttribute(
      "href",
      "/lease-renewal/live/desk/lease/7001",
    );
    expect(screen.queryByText("Showing your saved view.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Reset to default view" })).toBeNull();
  });
});

describe("S166 the existing ways to find a lease still open it (ARCH-S166-1)", () => {
  it("BEH-S166-4: tenant search and All leases both lead to the lease's own workspace link", () => {
    const token = `p1_${"t".repeat(43)}`;
    const tenantShortcuts: DeskPartyShortcuts = {
      available: true,
      tokenFor: (kind, normalizedLabel) =>
        kind === "tenant" && normalizedLabel === "tenant sample" ? token : null,
    };
    const rows = [
      row("7001"),
      row("7004", {
        tenantNameLabel: "Other Sample",
        tenantNameLabels: ["Other Sample"],
        identity: {
          address: { label: "7004 Sample St", sourceRef: "rentvine:lease:7004:property" },
          property: null,
          tenants: [
            { label: "Other Sample", sourceRef: "rentvine:lease:7004:tenants[0].name" },
          ],
          owners: [],
        },
        retention: { state: "outside", label: "Outside the renewal window" },
      }),
    ];
    // Tenant search: the opaque token selects exactly that tenant's lease.
    const byTenant = applyRenewalDeskQueryV2(
      rows,
      { ...DEFAULT, scope: "all", tenantKey: token },
      (candidate, kind, labels) =>
        candidate === token && kind === "tenant" && labels.includes("tenant sample"),
    );
    expect(byTenant.items.map((item) => item.id)).toEqual(["7001"]);
    render(
      <RenewalDeskTable
        role="Editor"
        rows={byTenant.items}
        shortcuts={tenantShortcuts}
        sourceReadOk
        state={{ ...DEFAULT, scope: "all", tenantKey: token }}
        totalBeforeQuery={2}
      />,
    );
    const found = new URL(
      `https://x${screen.getByRole("link", { name: "7001 Sample St" }).getAttribute("href")}`,
    );
    expect(found.pathname).toBe("/lease-renewal/live/desk/lease/7001");
    expect(found.searchParams.get("deskView")).toBe(`v=2&scope=all&tenantKey=${token}`);
    expect(
      (document.getElementById("renewal-filter-tenantKey") as HTMLSelectElement).value,
    ).toBe(token);
    cleanup();

    // All leases: the view is one explicit link, and a lease outside the worklist opens the same way.
    render(
      <RenewalDeskTable
        role="Editor"
        rows={rows}
        shortcuts={tenantShortcuts}
        sourceReadOk
        state={{ ...DEFAULT, scope: "all" }}
        totalBeforeQuery={2}
      />,
    );
    expect(
      screen
        .getByRole("navigation", { name: "Worklist views" })
        .querySelector('[data-view="all"]'),
    ).toHaveAttribute("href", "/lease-renewal/live/desk?v=2&scope=all");
    expect(
      screen.getByRole("link", { name: "Tenant Sample" }).getAttribute("href"),
    ).toContain(`tenantKey=${token}`);
    expect(
      screen.getByRole("link", { name: "7004 Sample St" }).getAttribute("href"),
    ).toContain("/lease-renewal/live/desk/lease/7004?");
  });
});
