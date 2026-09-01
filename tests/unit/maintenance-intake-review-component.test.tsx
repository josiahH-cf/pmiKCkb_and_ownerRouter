// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnverifiedIntakeReview } from "@/components/maintenance/UnverifiedIntakeReview";
import type { UnverifiedIntakeRecord } from "@/lib/maintenance/intake-model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function intake(overrides: Partial<UnverifiedIntakeRecord> = {}): UnverifiedIntakeRecord {
  return {
    id: "i1",
    status: "unverified",
    source: "public-link",
    data_mode: "live",
    property_key: "prop-1",
    summary: "Water heater leaking",
    description: "Flooding the closet",
    contact: "tenant@example.com",
    reporter_kind: "external",
    ip_hash: "h",
    created_at: "2026-07-09T12:00:00.000Z",
    expires_at: "2026-10-07T12:00:00.000Z",
    ...overrides,
  };
}

describe("UnverifiedIntakeReview", () => {
  it("shows the unavailable note when the queue could not load", () => {
    render(<UnverifiedIntakeReview initialIntake={[]} unavailableNote="Unavailable." />);
    expect(screen.getByText("Unavailable.")).toBeInTheDocument();
  });

  it("renders each intake report with its summary and contact", () => {
    render(<UnverifiedIntakeReview initialIntake={[intake()]} />);
    expect(screen.getByText("Water heater leaking")).toBeInTheDocument();
    expect(screen.getByText(/contact: tenant@example.com/)).toBeInTheDocument();
  });

  it("promotes a report and removes it from the list", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ticket: { id: "t1" } }), {
          status: 201,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UnverifiedIntakeReview initialIntake={[intake()]} />);
    fireEvent.click(screen.getByText("Promote to Live app ticket"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/maintenance/intake/i1/promote",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Water heater leaking")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Promoted to a Live app ticket/)).toBeInTheDocument();
  });

  it("promotes with an operator-confirmed unit in the request body", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      return String(url).includes("/api/maintenance/units/search")
        ? Response.json({
            units: [{ unitId: "unit:456", label: "123 Main Street Unit 2" }],
          })
        : new Response(JSON.stringify({ ticket: { id: "t1" } }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UnverifiedIntakeReview initialIntake={[intake()]} />);
    fireEvent.change(screen.getByLabelText("Confirm unit (optional)"), {
      target: { value: "123 Main" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /123 Main Street Unit 2/ }),
    );
    fireEvent.click(screen.getByText("Promote to Live app ticket"));

    await waitFor(() => {
      const promoteCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/promote"),
      );
      expect(promoteCall).toBeTruthy();
      expect(JSON.parse(String(promoteCall?.[1]?.body))).toMatchObject({
        unit: { unitId: "unit:456", label: "123 Main Street Unit 2" },
      });
    });
  });

  it("omits a legacy Test intake from the Live review surface", () => {
    render(
      <UnverifiedIntakeReview
        initialIntake={[
          intake({
            data_mode: "test",
            summary: "Retired intake",
          }),
        ]}
      />,
    );

    expect(screen.queryByText("Retired intake")).toBeNull();
    expect(screen.queryByText("Promote to Test ticket")).toBeNull();
    expect(screen.getByText("No unverified intake right now.")).toBeVisible();
  });

  it("names the intake and requires a reason before dismissing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<UnverifiedIntakeReview initialIntake={[intake()]} />);
    fireEvent.click(screen.getByText("Dismiss"));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Dismiss unverified intake" });
    expect(dialog).toHaveTextContent("Water heater leaking");
    expect(dialog).toHaveTextContent("prop-1");
    expect(screen.getByRole("button", { name: "Dismiss intake" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "duplicate report" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss intake" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/maintenance/intake/i1/dismiss",
        expect.objectContaining({
          body: JSON.stringify({ reason: "duplicate report" }),
          method: "POST",
        }),
      ),
    );
  });

  it("does not dismiss when the confirmation is cancelled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UnverifiedIntakeReview initialIntake={[intake()]} />);

    fireEvent.click(screen.getByText("Dismiss"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
