// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnverifiedIntakeReview } from "@/components/maintenance/UnverifiedIntakeReview";
import type { UnverifiedIntakeRecord } from "@/lib/maintenance/intake-model";
import { MAINTENANCE_TEST_PUBLIC_INTAKE } from "@/lib/maintenance/test-workflow";

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

  it("renders and promotes Test intake without exposing a Live unit selector", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ticket: { id: "test-ticket" } }), {
          status: 201,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UnverifiedIntakeReview
        initialIntake={[
          intake({
            data_mode: "test",
            property_key: MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey,
            summary: MAINTENANCE_TEST_PUBLIC_INTAKE.summary,
            description: MAINTENANCE_TEST_PUBLIC_INTAKE.description,
            contact: MAINTENANCE_TEST_PUBLIC_INTAKE.contact,
          }),
        ]}
      />,
    );

    expect(screen.getByText("TEST INTAKE")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm unit (optional)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Promote to Test ticket"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/maintenance/intake/i1/promote",
        expect.objectContaining({ method: "POST", body: undefined }),
      );
    });
    expect(
      await screen.findByText(/Promoted to an isolated Test ticket/),
    ).toBeInTheDocument();
    expect(screen.getByText(/No Live ticket or provider effect/)).toBeInTheDocument();
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
