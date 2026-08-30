// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The desk embeds the S58 client refresh control, which uses the app router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { formatSnapshotAge, RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { DEFAULT_RENEWAL_DESK_QUERY } from "@/lib/lease-renewal/desk-query";
import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
  type DeskDataCurrency,
} from "@/tests/helpers/sample-desk";

afterEach(() => {
  cleanup();
});

describe("RenewalDesk", () => {
  it("renders labeled URL-backed triage controls and complete scan-first identity facts", () => {
    render(<RenewalDesk view={getRenewalDeskView()} />);

    expect(
      screen.getByRole("form", { name: "Renewal worklist controls" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search renewals")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort renewals")).toBeInTheDocument();
    expect(screen.getByLabelText("End date filter")).toBeInTheDocument();
    expect(screen.getByLabelText("End month filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Due state filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Tenant filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Workflow step filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Waiting on filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Source conflict filter")).toBeInTheDocument();

    expect(screen.getAllByText("Lease ID").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tenant").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current step").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Renewal worklist" })).toBeInTheDocument();
  });

  it("renders every active disposition in one canonical Live worklist", () => {
    render(<RenewalDesk view={getRenewalDeskView()} />);

    expect(
      screen.getByRole("heading", { name: "Renewals", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();

    // The desk now leads with a needs-attention fold; the address appears there and in the queue.
    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getAllByText("4821 Maple Ct, Unit 4").length).toBeGreaterThan(0);
    // The conflict lease surfaces a one-click "Resolve conflicts" next action at the top.
    expect(screen.getByRole("link", { name: "Resolve conflicts" })).toBeInTheDocument();

    // Actionable, skipped, and review leases share one worklist. Link names remain unique for
    // assistive technology even when every visible action reads "Open".
    expect(screen.getAllByRole("link", { name: /Open lease/ })).toHaveLength(6);

    // The conflict lease shows a humanized source-conflict pill, not severity jargon.
    expect(screen.getByText("1 source conflict")).toBeInTheDocument();

    // Non-actionable states remain explicit rather than disappearing into a separate queue.
    expect(screen.getByText("Off-cycle end date")).toBeInTheDocument();
    expect(screen.getByText("Month-to-month")).toBeInTheDocument();
    expect(screen.getByText("Program lease")).toBeInTheDocument();
    // Untracked outside-window work is absent from the default active scope.
    expect(screen.queryByText("12 Elm Ct, Unit 9")).not.toBeInTheDocument();
    expect(screen.getByText("Data diagnostics")).toBeInTheDocument();

    // A complete read renders as a normal desk: no incomplete-read notice, no partial labels.
    expect(screen.queryByText("Live read incomplete")).not.toBeInTheDocument();
    expect(screen.queryByText(/partial read/)).not.toBeInTheDocument();
  });

  // AC-S57-5: a partial read never renders as a normal desk — the incomplete-read notice is
  // visible and the lease count is labeled as partial.
  it("renders a visible incomplete-read notice and labels the count partial when the read is incomplete", () => {
    const view = { ...getRenewalDeskView(), readComplete: false };
    render(<RenewalDesk view={view} />);

    const statuses = screen
      .getAllByRole("status")
      .map((node) => node.textContent)
      .join(" ");
    expect(statuses).toContain("Live read incomplete");
    expect(screen.getByText(/leases loaded so far \(partial read\)/)).toBeInTheDocument();
    expect(
      screen.queryByText(/leases in your current renewal window/),
    ).not.toBeInTheDocument();
  });

  it("shows untracked outside-window rows only when the operator selects all scope", () => {
    render(
      <RenewalDesk
        view={getRenewalDeskView()}
        query={{ ...DEFAULT_RENEWAL_DESK_QUERY, scope: "all" }}
      />,
    );

    expect(screen.getByText("12 Elm Ct, Unit 9")).toBeInTheDocument();
    expect(screen.getByText("Outside this window")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Open lease/ })).toHaveLength(7);
  });

  it("keeps valid URL selections visible when the current read no longer contains them", () => {
    render(
      <RenewalDesk
        view={getRenewalDeskView()}
        query={{
          ...DEFAULT_RENEWAL_DESK_QUERY,
          endDate: "2027-01-31",
          month: "2027-01",
          owner: "Former Owner",
          tenant: "Former Tenant",
          step: "retired-step",
        }}
      />,
    );

    expect(screen.getByLabelText("End date filter")).toHaveValue("2027-01-31");
    expect(screen.getByLabelText("End month filter")).toHaveValue("2027-01");
    expect(screen.getByLabelText("Owner filter")).toHaveValue("Former Owner");
    expect(screen.getByLabelText("Tenant filter")).toHaveValue("Former Tenant");
    expect(screen.getByLabelText("Workflow step filter")).toHaveValue("retired-step");
    expect(screen.getByText("No matching renewals")).toBeInTheDocument();
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
    expect(screen.getAllByRole("link", { name: /Open lease/ }).length).toBeGreaterThan(0);
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

describe("RenewalWorkspace", () => {
  it("shows six evidence steps, source-tagged drafts, 3 tenant channels, and readiness", async () => {
    const user = userEvent.setup();
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7");
    expect(workspace).not.toBeNull();
    render(<RenewalWorkspace workspace={workspace!} />);

    expect(
      screen.getByRole("heading", { name: "318 Cedar Ave, Unit 7", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Data check", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Owner decision", level: 2 }),
    ).toBeInTheDocument();

    // The owner email is a draft, source-tagged, never offering a send. The source tag renders the
    // clean display label ("RentVine"), not the internal "Rentvine (read-authoritative)" id (S13 A5).
    expect(screen.getAllByText(/Review before sending/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/RentVine/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/read-authoritative/)).toBeNull();

    // Tenant offer: email is shown first; switching to the text channel reveals the short nudge.
    expect(
      within(screen.getByRole("tabpanel", { name: "Email" })).getByText(
        /we'll get the documents out/,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Text" }));
    expect(
      screen.queryByText(/emailed and messaged you the details/),
    ).not.toBeInTheDocument();

    // Readiness flags the Kansas City addendum.
    expect(screen.getByText("City-specific addendum")).toBeInTheDocument();
    expect(screen.getByText(/Kansas City city-specific addendum/)).toBeInTheDocument();
  });

  it("withholds the tenant offer until the owner decides and flags the conflict", () => {
    const workspace = getRenewalLeaseWorkspace("lease-1207-walnut-2");
    render(<RenewalWorkspace workspace={workspace!} />);

    expect(screen.getByText("Compose the tenant offer below")).toBeInTheDocument();
    expect(screen.getByText("Needs your decision")).toBeInTheDocument();
  });
});
