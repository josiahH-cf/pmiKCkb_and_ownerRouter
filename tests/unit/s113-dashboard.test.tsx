// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

afterEach(cleanup);

describe("S113 F1 consolidated dashboard", () => {
  it("shows the actual simple correction controls while advanced history stays collapsed", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    render(
      <RenewalWorkspace
        workspace={workspace}
        selectedStepId="owner-decision"
        correctionPanel={
          <RenewalCorrections
            leaseId={workspace.summary.id}
            role="Admin"
            dataCheck={workspace.dataCheck}
            sheetValues={null}
            workspaceContext={null}
            inventory={null}
            sheetPreviewHash={null}
            rentvinePreviewHash={null}
            reviewHref={null}
          />
        }
        discrepancyPanel={<p>Retained prior correction decision</p>}
      />,
    );
    expect(screen.getByLabelText("Fact to correct")).toBeVisible();
    expect(screen.getByLabelText("Value source / reason")).toBeVisible();
    expect(screen.getByLabelText("Destinations")).toBeVisible();
    expect(screen.getByText("Retained prior correction decision")).not.toBeVisible();
    expect(
      screen.getAllByText("Discrepancy decision history and advanced disposition"),
    ).toHaveLength(1);
  });
  it("keeps all five sections inspectable from an old verification bookmark", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    render(<RenewalWorkspace workspace={workspace} selectedStepId="verify-renewal" />);
    for (const name of [
      "Lease details",
      "Comps",
      "Owner",
      "Tenant",
      "Documents and completion",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("navigation", { name: "Renewal phases" })).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Documents and completion" })).getByText(
        "Build docs readiness",
      ),
    ).toBeInTheDocument();
  });

  it("connects each displayed source to its verified destination or local comparison", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    render(<RenewalWorkspace workspace={workspace} selectedStepId="owner-decision" />);
    const details = screen.getByRole("region", { name: "Lease details" });
    expect(
      within(details).getAllByRole("link", { name: /source|comparison/i }).length,
    ).toBeGreaterThan(0);
  });

  it("gives next actions a mounted keyboard-focusable target", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const { container } = render(<RenewalWorkspace workspace={workspace} />);
    const action = screen.getByRole("link", { name: /^Go to / });
    const fragment = new URL(action.getAttribute("href")!, "https://local.invalid").hash;
    expect(fragment).not.toBe("");
    expect(container.querySelector(fragment)).toHaveAttribute("tabindex", "-1");
  });
  it("opens a disclosure and focuses its actual editable control", () => {
    render(
      <section id="renewal-test">
        <details>
          <summary>Details</summary>
          <input data-renewal-next-control aria-label="Required source value" />
        </details>
      </section>,
    );
    focusRenewalDashboardControl("renewal-test");
    expect(screen.getByLabelText("Required source value")).toHaveFocus();
    expect(screen.getByText("Details").parentElement).toHaveAttribute("open");
  });
});
