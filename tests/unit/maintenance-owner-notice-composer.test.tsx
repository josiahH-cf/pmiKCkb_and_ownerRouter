// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ticket(
  overrides: Partial<MaintenanceTicketRecord> = {},
): MaintenanceTicketRecord {
  return {
    id: "t1",
    data_mode: "live",
    status: "Open",
    priority: "Normal",
    priority_provenance: "operator-set",
    summary: "Kitchen leak",
    description: "Water below the sink.",
    unit: { unitId: "unit:456", label: "512 Rosewood Ct" },
    photo_refs: [],
    reporter: { kind: "staff", uid: "u1" },
    labels: [],
    space_id: "maintenance-work-order-intake",
    created_at: "2026-07-09T10:00:00.000Z",
    updated_at: "2026-07-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("S193 maintenance owner communication entry and earlier attempts", () => {
  it("opens the workflow composer in a new tab and offers no legacy creation", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);
    expect(
      screen.getByRole("link", { name: "Compose owner message in Communications" }),
    ).toHaveAttribute("href", "/gmail-hub?compose=maintenance_owner&ticket=t1");
    expect(
      screen.getByRole("link", { name: "Compose owner message in Communications" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.queryByRole("button", { name: /Preview draft|Create Gmail draft/ }),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("is absent for a read-only user", () => {
    render(<MaintenanceQueue canEdit={false} initialTickets={[ticket()]} />);
    expect(
      screen.queryByRole("link", { name: "Compose owner message in Communications" }),
    ).toBeNull();
  });
  it("omits a legacy Test ticket", () => {
    render(
      <MaintenanceQueue
        canEdit
        initialTickets={[ticket({ data_mode: "test", summary: "TEST — leak" })]}
      />,
    );
    expect(screen.queryByText("TEST — leak")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Compose owner message in Communications" }),
    ).toBeNull();
  });
  it("reads bodyless original attempts and recovers only the selected consumed one", async () => {
    const executionId = `exec_${"a".repeat(40)}`;
    const calls: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_u: RequestInfo | URL, i?: RequestInit) => {
      if (i?.body) {
        calls.push(JSON.parse(String(i.body)));
        return Response.json({
          status: "reconciliation",
          resolution: "not_found",
          reason:
            "The exact earlier draft was not found. Its outcome remains unresolved; no new draft was attempted.",
        });
      }
      return Response.json({
        attempts: [
          {
            executionId,
            state: "Needs reconciliation",
            recoveryAvailable: true,
            updatedAt: "2026-10-08T10:00:00Z",
            attemptCount: 1,
          },
        ],
        cursor: null,
      });
    });
    vi.stubGlobal("fetch", fetch);
    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);
    fireEvent.click(screen.getByText("Earlier Gmail draft attempts"));
    fireEvent.click(screen.getByRole("button", { name: "Read earlier attempts" }));
    await screen.findByText(/Needs reconciliation/);
    fireEvent.change(
      screen.getByLabelText("Original reviewed wording (only if it was edited)"),
      { target: { value: "Original reviewed words" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Recover original attempt" }));
    await screen.findByText(/The exact earlier draft was not found/);
    expect(calls).toEqual([
      { ticketRef: "t1", body: "Original reviewed words", reconcile: { executionId } },
    ]);
    expect(screen.queryByRole("button", { name: /Create Gmail draft/ })).toBeNull();
  });
  it("shows a failed history read as failed and retry reads only", async () => {
    let fails = true;
    const fetch = vi.fn(async () =>
      fails
        ? Response.json({ error: "Saved status unavailable" }, { status: 503 })
        : Response.json({ attempts: [], cursor: null }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);
    fireEvent.click(screen.getByText("Earlier Gmail draft attempts"));
    fireEvent.click(screen.getByRole("button", { name: "Read earlier attempts" }));
    await screen.findByText("Saved status unavailable");
    fails = false;
    fireEvent.click(screen.getByRole("button", { name: "Read earlier attempts" }));
    await screen.findByText(/No earlier owner-notice attempts/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
