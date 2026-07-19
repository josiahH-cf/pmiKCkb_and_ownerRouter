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
    expect(screen.getByLabelText("Issue", { exact: false })).toBeInTheDocument();
    expect(
      screen.getByLabelText("Unit / location", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record voice" })).toBeInTheDocument();
    expect(
      screen.getByText(/Photo storage is unavailable until the Drive action/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/photo/i, { selector: "input" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Build work-order draft" }),
    ).toBeInTheDocument();

    // MWO-3 (§I): Issue + Unit are marked required (asterisk + aria-required) and the primary
    // action is the prominent large Button.
    expect(screen.getByLabelText("Issue", { exact: false })).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText("Unit / location", { exact: false })).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getAllByText("*")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Build work-order draft" })).toHaveClass(
      "button--large",
    );
  });

  it("requires the registry preview and explicit confirmation before an enabled upload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => Response.json({ ref: "stub:fixture.jpg" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MaintenanceCapture
        reporterUid="u"
        photoAction={{
          actionKey: "google_drive.maintenance_photo.store",
          executable: true,
          message: "Review before upload.",
          targetLabel: "Safe maintenance folder",
        }}
      />,
    );

    const input = screen.getByLabelText("Choose / take photo");
    await user.upload(
      input,
      new File(["fixture"], "fixture.jpg", { type: "image/jpeg" }),
    );

    expect(screen.getByText("fixture.jpg")).toBeInTheDocument();
    expect(screen.getByText("Safe maintenance folder")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm photo upload" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("builds a clean Live in-app draft after matching the unit", async () => {
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

    await user.type(
      screen.getByLabelText("Issue", { exact: false }),
      "Dishwasher won't drain",
    );
    await user.type(
      screen.getByLabelText("Unit / location", { exact: false }),
      "123 Main",
    );
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
    expect(screen.getByText(/Live in-app ticket preview/)).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Create ticket" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create ticket" })).toHaveAttribute(
      "aria-describedby",
      "maintenance-ticket-blockers",
    );
  });

  it("invalidates a ready draft when the selected unit is edited", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ units: [{ unitId: "u1", label: "123 Main St Unit 1" }] }),
      ),
    );
    render(<MaintenanceCapture reporterUid="u" />);

    await user.type(
      screen.getByLabelText("Issue", { exact: false }),
      "Kitchen pipe is leaking",
    );
    await user.type(
      screen.getByLabelText("Unit / location", { exact: false }),
      "123 Main",
    );
    await user.click(await screen.findByRole("button", { name: "123 Main St Unit 1" }));
    await user.click(screen.getByRole("button", { name: "Build work-order draft" }));
    expect(screen.getByRole("button", { name: "Create ticket" })).toBeEnabled();

    await user.type(
      screen.getByLabelText("Unit / location", { exact: false }),
      " edited",
    );
    expect(
      screen.queryByRole("button", { name: "Create ticket" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("The work-order draft appears here.")).toBeInTheDocument();
  });
});
