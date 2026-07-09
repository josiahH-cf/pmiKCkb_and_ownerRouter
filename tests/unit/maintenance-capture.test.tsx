// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaintenanceCapture } from "@/components/maintenance/MaintenanceCapture";

// Maintenance capture desk (S4). Voice recording uses browser MediaRecorder (not exercised in jsdom);
// these cover the typed-capture → work-order-draft flow + the gated/blocker messaging.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MaintenanceCapture", () => {
  it("renders the capture form", () => {
    render(<MaintenanceCapture reporterUid="u" />);
    expect(screen.getByLabelText("Issue")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit / location")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record voice" })).toBeInTheDocument();
    expect(screen.getByText("Add / take photo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Build work-order draft" }),
    ).toBeInTheDocument();
  });

  it("builds a clean draft after matching the unit, marked simulation-only", async () => {
    const user = userEvent.setup();
    // The unit now comes from the type-ahead (real confidence), not the typed text — branch on URL.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/api/maintenance/units/search")
          ? Response.json({
              units: [{ unitId: "unit:456", label: "123 Main Street Unit 2" }],
            })
          : Response.json({}),
      ),
    );

    render(<MaintenanceCapture reporterUid="u" />);

    await user.type(screen.getByLabelText("Issue"), "Dishwasher won't drain");
    await user.type(screen.getByLabelText("Unit / location"), "123 Main");
    await user.click(
      await screen.findByRole("button", { name: /123 Main Street Unit 2/ }),
    );
    expect(await screen.findByText(/Matched:/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Build work-order draft" }));

    expect(
      await screen.findByRole("heading", { name: "Work-order draft" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dishwasher won't drain" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Test run only/)).toBeInTheDocument();
    expect(screen.getByText(/No blockers/)).toBeInTheDocument();

    // The non-executable M-5 stages surface alongside the draft.
    expect(
      screen.getByRole("heading", { name: "Owner notice — draft" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Draft only — no send/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Vendor assignment — suggestion" }),
    ).toBeInTheDocument();
    // "Dishwasher won't drain" → Appliance wins (dishwasher + washer = 2 hits > drain = 1);
    // the specific vendor always stays Needs-Verification (no roster).
    expect(screen.getByText("Trade:")).toBeInTheDocument();
    expect(screen.getAllByText(/Appliance/).length).toBeGreaterThan(0);
    expect(screen.getByText(/client vendor roster/)).toBeInTheDocument();
  });

  it("surfaces blockers when the issue and unit are missing", async () => {
    const user = userEvent.setup();
    render(<MaintenanceCapture reporterUid="u" />);

    await user.click(screen.getByRole("button", { name: "Build work-order draft" }));

    expect(
      await screen.findByText("Add an issue description or voice note."),
    ).toBeInTheDocument();
    expect(screen.getByText("Match the location to a unit.")).toBeInTheDocument();
  });
});
