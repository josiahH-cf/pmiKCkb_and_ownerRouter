// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

// The desk embeds the S58 client refresh control, which uses the app router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} data-prefetch={String(prefetch)} />
  ),
}));

import { formatSnapshotAge, RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
  type DeskDataCurrency,
} from "@/tests/helpers/sample-desk";

afterEach(() => {
  cleanup();
});

describe("RenewalDesk (S82 table)", () => {
  it("loads desk and lease destinations only when selected, without speculative source reads", () => {
    render(<RenewalDesk view={getRenewalDeskView()} />);
    const links = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.includes("/desk"));
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) {
      expect(link).toHaveAttribute("data-prefetch", "false");
    }
  });

  it("renders one semantic table with every required column and no retired desk surface", () => {
    render(<RenewalDesk view={getRenewalDeskView()} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    for (const column of [
      "Lease / location",
      "Owner",
      "Tenant",
      "Renewal date",
      "Current base rent",
      "Overall status",
      "Rent verification",
      "Action",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(column) }),
      ).toBeInTheDocument();
    }

    // Retired S78 surfaces are gone: attention duplicate, metric grid, card worklist, global
    // search/controls, Apply view, single Open button, and the diagnostics disclosure.
    expect(screen.queryByText("Needs your attention")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search renewals")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open lease/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Data diagnostics")).not.toBeInTheDocument();
    expect(screen.queryByText("Visible")).not.toBeInTheDocument();

    // Source trust stays: Live chip and the truthful three-part result count.
    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(
      screen.getByText(/Matching: \d+ · Selected scope: \d+ · Total loaded: \d+/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Worklist scope:/).parentElement).toHaveTextContent(
      "Current window and tracked incomplete",
    );
  });

  it("renders each lease once as a row with its identity, date, rent state, and status", () => {
    render(<RenewalDesk view={getRenewalDeskView()} />);

    const rows = screen.getAllByRole("row");
    // Header sort row + header filter row + one row per active-scope lease.
    expect(rows.length).toBeGreaterThan(4);
    expect(screen.getAllByText("4821 Maple Ct, Unit 4").length).toBe(1);
    // Sample rows carry no live rent decision, so rent state fails closed, never fabricates.
    expect(screen.getAllByText("Needs verification").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RentVine").length).toBeGreaterThan(0);
    // Untracked outside-window work is absent from the default active scope.
    expect(screen.queryByText("12 Elm Ct, Unit 9")).not.toBeInTheDocument();
  });

  it("shows untracked outside-window rows only when the operator selects all scope", () => {
    render(
      <RenewalDesk
        query={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "all" }}
        view={getRenewalDeskView()}
      />,
    );

    expect(screen.getByText("12 Elm Ct, Unit 9")).toBeInTheDocument();
  });

  it("renders the filtered-empty state with an enabled Clear filters recovery", () => {
    render(
      <RenewalDesk
        query={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, endDate: "2031-01-31" }}
        view={getRenewalDeskView()}
      />,
    );

    expect(screen.getByText("No renewals match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toBeInTheDocument();
    // The semantic table structure survives the empty state.
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders a visible incomplete-read notice and labels the count partial when the read is incomplete", () => {
    const view = { ...getRenewalDeskView(), readComplete: false };
    render(<RenewalDesk view={view} />);

    const statuses = screen
      .getAllByRole("status")
      .map((node) => node.textContent)
      .join(" ");
    expect(statuses).toContain("Live read incomplete");
    expect(
      screen.getByText(/leases loaded from a partial source read/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Total loaded:.*partial portfolio read/)).toBeInTheDocument();
    expect(
      screen.queryByText(/leases in your current renewal window/),
    ).not.toBeInTheDocument();
  });

  it("keeps the desk usable while symbolic supporting reads are unavailable", () => {
    render(
      <RenewalDesk
        auxiliaryFailures={[{ key: "progress", status: "failed" }]}
        view={getRenewalDeskView()}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Supporting information unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/saved renewal progress: read did not complete/),
    ).toBeInTheDocument();
  });
});

// S58: the four currency states. Exactly one renders at all times (AC-S58-9), the age comes from
// the snapshot timestamp, and a failed refresh never renders as fresh or empty (AC-S58-4).
describe("RenewalDesk data currency", () => {
  function currency(overrides: Partial<DeskDataCurrency>): DeskDataCurrency {
    return {
      state: "fresh",
      readAtIso: "2026-07-14T00:00:00.000Z",
      ageMs: 5_000,
      refreshing: false,
      lastError: false,
      ...overrides,
    };
  }
  const withCurrency = (c: DeskDataCurrency) => ({
    ...getRenewalDeskView(),
    dataCurrency: c,
  });

  const UPDATED = /Updated 5 seconds ago/;
  const REFRESHING = /Refreshing lease data/;
  const FAILED = /did not complete/;
  const TOO_OLD = /Data too old to act on/;

  it("exposes only closed source-state values on the desk root", () => {
    const { container } = render(
      <RenewalDesk
        view={{
          ...withCurrency(
            currency({ state: "expired", refreshing: true, lastError: true }),
          ),
          readComplete: false,
        }}
      />,
    );
    const desk = container.firstElementChild;
    expect(desk).toHaveAttribute("data-source-currency-state", "expired");
    expect(desk).toHaveAttribute("data-source-read-complete", "false");
    expect(desk).toHaveAttribute("data-source-refreshing", "true");
    expect(desk).toHaveAttribute("data-source-refresh-failed", "true");
    expect(desk).not.toHaveAttribute("data-source-read-at-iso");
    expect(desk).not.toHaveAttribute("data-source-age-ms");
  });

  it("renders exactly the updated state on fresh data", () => {
    render(<RenewalDesk view={withCurrency(currency({}))} />);
    expect(screen.getByText(UPDATED)).toBeInTheDocument();
    expect(screen.queryByText(REFRESHING)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
    expect(screen.queryByText(TOO_OLD)).not.toBeInTheDocument();
  });

  it("renders exactly the refreshing state while a revalidation is in flight", () => {
    render(
      <RenewalDesk view={withCurrency(currency({ state: "stale", refreshing: true }))} />,
    );
    expect(screen.getByText(REFRESHING)).toBeInTheDocument();
    expect(screen.queryByText(UPDATED)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
    expect(screen.queryByText(TOO_OLD)).not.toBeInTheDocument();
  });

  // AC-S58-4: failed refresh → last good rows, failed state, visible age; never empty, never fresh.
  it("renders the could-not-refresh state with the rows and a visible age after a failed refresh", () => {
    render(
      <RenewalDesk
        view={withCurrency(currency({ state: "stale", lastError: true, ageMs: 120_000 }))}
      />,
    );
    expect(screen.getByText(/Last updated 2 minutes ago/)).toBeInTheDocument();
    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText(UPDATED)).not.toBeInTheDocument();
    expect(screen.queryByText(TOO_OLD)).not.toBeInTheDocument();
    // The desk still shows its rows — a provider failure never renders an empty portfolio.
    expect(screen.getAllByText("4821 Maple Ct, Unit 4").length).toBe(1);
  });

  it("renders exactly the too-old state when the snapshot is expired", () => {
    render(
      <RenewalDesk
        view={withCurrency(
          currency({ state: "expired", lastError: true, ageMs: 16 * 60_000 }),
        )}
      />,
    );
    expect(screen.getByText(TOO_OLD)).toBeInTheDocument();
    expect(screen.getByText(/16 minutes old/)).toBeInTheDocument();
    expect(screen.queryByText(UPDATED)).not.toBeInTheDocument();
    expect(screen.queryByText(REFRESHING)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  it("derives the displayed age from the snapshot timestamp, not render time", () => {
    expect(formatSnapshotAge(0)).toBe("0 seconds");
    expect(formatSnapshotAge(1_000)).toBe("1 second");
    expect(formatSnapshotAge(89_000)).toBe("89 seconds");
    expect(formatSnapshotAge(120_000)).toBe("2 minutes");
    expect(formatSnapshotAge(16 * 60_000)).toBe("16 minutes");
  });
});

describe("RenewalWorkspace (S113 dashboard with S82 evidence)", () => {
  it("renders five section destinations, every section and one Do-this-next card", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    render(<RenewalWorkspace workspace={workspace} />);
    expect(
      screen.getByRole("heading", { name: "318 Cedar Ave, Unit 7", level: 1 }),
    ).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", {
      name: "Renewal dashboard sections",
    });
    expect(within(navigation).getAllByRole("link")).toHaveLength(5);
    for (const name of [
      "Lease details",
      "Comps",
      "Owner",
      "Tenant",
      "Documents and completion",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Do this next")).toHaveLength(1);
    expect(screen.queryByText(/renewal-v1/)).not.toBeInTheDocument();
    expect(screen.getByText("Build docs readiness")).toBeInTheDocument();
  });

  it("keeps the complete dashboard inspectable from upcoming and invalid historical step URLs", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    for (const step of ["document-packet", "not-a-step"]) {
      render(<RenewalWorkspace selectedStepId={step} workspace={workspace} />);
      expect(screen.getByText("Build docs readiness")).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: "Renewal dashboard sections" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Do this next")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Confirm.*upload/i }),
      ).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("shows upcoming tenant draft readiness while retaining the actual execution refusal", () => {
    const workspace = getRenewalLeaseWorkspace("lease-1207-walnut-2")!;
    render(<RenewalWorkspace selectedStepId="tenant-decision" workspace={workspace} />);
    expect(
      within(screen.getByRole("region", { name: "Tenant" })).getByRole("heading", {
        name: "Renewal-notice draft",
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();
  });

  it("keeps the data check with source-tagged candidates on the verify phase", () => {
    const workspace = getRenewalLeaseWorkspace("lease-1207-walnut-2");
    render(<RenewalWorkspace selectedStepId="verify-renewal" workspace={workspace!} />);

    expect(screen.getByText("Data check")).toBeInTheDocument();
    expect(screen.getByText("Needs your decision")).toBeInTheDocument();
    expect(screen.queryByText(/read-authoritative/)).toBeNull();
  });
});
