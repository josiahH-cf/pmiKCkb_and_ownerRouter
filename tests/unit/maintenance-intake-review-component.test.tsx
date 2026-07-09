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
    fireEvent.click(screen.getByText("Promote to ticket"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/maintenance/intake/i1/promote",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Water heater leaking")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Promoted to a ticket/)).toBeInTheDocument();
  });

  it("requires a reason to dismiss (cancels when the prompt is empty)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("prompt", () => "");

    render(<UnverifiedIntakeReview initialIntake={[intake()]} />);
    fireEvent.click(screen.getByText("Dismiss"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("A reason is required to dismiss an intake."),
    ).toBeInTheDocument();
  });
});
