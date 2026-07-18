// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    description: "",
    unit: null,
    photo_refs: [],
    reporter: { kind: "staff", uid: "u1" },
    labels: [],
    space_id: "maintenance",
    created_at: "2026-07-09T10:00:00.000Z",
    updated_at: "2026-07-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("MaintenanceQueue status pills + history", () => {
  it("shows the real status text with a maintenance-accurate tone (no renewal vocab)", () => {
    render(<MaintenanceQueue initialTickets={[ticket({ status: "Open" })]} />);
    const pill = screen.getByText("Open", { selector: ".queue-pill" });
    expect(pill).toHaveAttribute("data-value", "Needs Attention");
    expect(pill.getAttribute("data-value")).not.toBe("Ready for Approval");
  });

  it("closed tickets use a completed tone, not approval vocab", () => {
    render(
      <MaintenanceQueue
        initialTickets={[ticket({ status: "Closed", closed_reason: "resolved" })]}
      />,
    );
    const pill = screen.getByText("Closed", { selector: ".queue-pill" });
    expect(pill).toHaveAttribute("data-value", "Completed");
    expect(pill.getAttribute("data-value")).not.toBe("Approved");
  });

  it("renders a per-ticket history disclosure", () => {
    render(<MaintenanceQueue initialTickets={[ticket()]} />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("focuses a linked Test ticket, selects its data lane, and opens Closed tickets", () => {
    render(
      <MaintenanceQueue
        focusedTicketId="t1"
        initialTickets={[
          ticket({
            data_mode: "test",
            status: "Closed",
            closed_reason: "resolved",
          }),
        ]}
      />,
    );

    expect(screen.getByLabelText("Data")).toHaveValue("test");
    expect(document.getElementById("maintenance-ticket-t1")).toHaveFocus();
    expect(screen.getByText("Closed (1)").closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Reopen ticket" })).toBeEnabled();
    expect(screen.getAllByText("App ticket closed").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("region", {
        name: "Maintenance business closeout evidence gates",
      }),
    ).toHaveTextContent("Business closeout: Not proven");
  });

  it("shows a bodyless denial when a linked ticket is unavailable", () => {
    render(<MaintenanceQueue focusedTicketId="missing" initialTickets={[ticket()]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "linked maintenance ticket could not be found",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("missing");
  });

  it("fetches and renders the activity trail once when the history panel expands", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activity: [
          {
            id: "a1",
            ticket_id: "t1",
            actor_uid: "editor-1",
            action: "status",
            new_status: "Scheduled",
            created_at: "2026-07-09T10:30:00.000Z",
          },
          {
            id: "a2",
            ticket_id: "t1",
            actor_uid: "editor-1",
            action: "assign",
            text: "editor-abc123", // a raw uid — must NOT be rendered as a name
            created_at: "2026-07-09T11:00:00.000Z",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<MaintenanceQueue initialTickets={[ticket()]} />);
    const details = container.querySelector(
      "details.maintenance-history",
    ) as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    // describeActivity("status") + formatHistoryStamp render from the fetched trail.
    expect(await screen.findByText("Status set to Scheduled")).toBeInTheDocument();
    expect(screen.getByText("2026-07-09 10:30")).toBeInTheDocument();
    // describeActivity("assign") renders a value-free label, never the raw uid.
    expect(screen.getByText("Assignment updated")).toBeInTheDocument();
    expect(screen.queryByText(/editor-abc123/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/maintenance/tickets/t1/activity");

    // A second toggle must not refetch (fetch-once guard).
    fireEvent(details, new Event("toggle"));
    fireEvent(details, new Event("toggle"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
