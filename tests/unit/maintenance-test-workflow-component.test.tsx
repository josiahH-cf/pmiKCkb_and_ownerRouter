// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import {
  MAINTENANCE_TEST_CONFIRMATION,
  MAINTENANCE_TEST_UNIT,
  MAINTENANCE_TEST_VENDOR,
} from "@/lib/maintenance/test-workflow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ticket(
  dataMode: "live" | "test",
  overrides: Partial<MaintenanceTicketRecord> = {},
): MaintenanceTicketRecord {
  return {
    id: `${dataMode}-ticket`,
    data_mode: dataMode,
    status: "Open",
    priority: "High",
    priority_provenance: "operator-set",
    summary: dataMode === "test" ? "TEST — Kitchen sink leak" : "Live sink leak",
    description: "Water below the sink",
    unit:
      dataMode === "test"
        ? MAINTENANCE_TEST_UNIT
        : { unitId: "live-unit-1", label: "123 Main St Unit 1" },
    photo_refs: [],
    reporter: { kind: "staff", uid: "editor-1" },
    labels: dataMode === "test" ? ["TEST DATA"] : [],
    space_id: "maintenance",
    created_at: "2026-07-15T12:00:00.000Z",
    updated_at: "2026-07-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("Maintenance production Test workspace", () => {
  it("visibly distinguishes Test and Live records and filters either lane", () => {
    render(<MaintenanceQueue initialTickets={[ticket("test"), ticket("live")]} />);

    expect(screen.getByText("TEST DATA", { selector: ".queue-pill" })).toBeVisible();
    expect(screen.getByText("LIVE DATA", { selector: ".queue-pill" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "test" } });
    expect(screen.getByText("TEST — Kitchen sink leak")).toBeVisible();
    expect(screen.queryByText("Live sink leak")).toBeNull();
  });

  it("creates the canonical Test ticket from the production queue", async () => {
    const seeded = ticket("test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: seeded }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MaintenanceQueue initialTickets={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Create Test ticket" }));

    expect(await screen.findByText("TEST — Kitchen sink leak")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/maintenance/tickets/test-seed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "plumbing" }),
    });
  });

  it("shows the exact Test target and records an ineligible receipt only after confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        receipt: {
          id: "receipt-1",
          ticket_id: "test-ticket",
          data_mode: "test",
          action_key: "rentvine.work_order.create",
          target_label: "TEST RentVine workspace (internal simulation)",
          outcome: "simulated_success",
          provider_contacted: false,
          live_proof_eligible: false,
          actor_uid: "editor-1",
          created_at: "2026-07-15T12:05:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MaintenanceQueue initialTickets={[ticket("test")]} />);

    const run = screen.getByRole("button", { name: "Run Test action" });
    expect(run).toBeDisabled();
    expect(
      screen.getByText(/TEST RentVine workspace \(internal simulation\)/),
    ).toBeVisible();

    fireEvent.click(
      screen.getByLabelText("I confirm this exact Test action and target."),
    );
    expect(run).toBeEnabled();
    fireEvent.click(run);

    expect(
      await screen.findByText(
        "Internal Test receipt recorded. No external provider was contacted.",
      ),
    ).toBeVisible();
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("/api/maintenance/tickets/test-ticket/test-actions");
    expect(JSON.parse(request[1].body)).toEqual({
      actionKey: "rentvine.work_order.create",
      confirmation: MAINTENANCE_TEST_CONFIRMATION,
    });
  });

  it("uses the reserved Test Vendor id for the explicit assignment transition", async () => {
    const updated = ticket("test", { vendor_id: MAINTENANCE_TEST_VENDOR.id });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: updated }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MaintenanceQueue initialTickets={[ticket("test")]} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Assign ${MAINTENANCE_TEST_VENDOR.label}`,
      }),
    );
    expect(
      await screen.findByText(/service@summit-plumbing\.example\.invalid/),
    ).toBeVisible();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      op: "vendor-assign",
      vendorId: MAINTENANCE_TEST_VENDOR.id,
    });
  });

  it("disables an already-recorded Test action instead of creating a second effect", () => {
    render(
      <MaintenanceQueue
        initialTestReceipts={[
          {
            id: "receipt-1",
            ticket_id: "test-ticket",
            data_mode: "test",
            action_key: "rentvine.work_order.create",
            target_label: "TEST RentVine workspace (internal simulation)",
            outcome: "simulated_success",
            provider_contacted: false,
            live_proof_eligible: false,
            actor_uid: "editor-1",
            created_at: "2026-07-15T12:05:00.000Z",
          },
        ]}
        initialTickets={[ticket("test")]}
      />,
    );

    expect(screen.getByRole("button", { name: "Test action recorded" })).toBeDisabled();
    expect(screen.getByText(/one idempotent receipt/i)).toBeVisible();
  });
});
