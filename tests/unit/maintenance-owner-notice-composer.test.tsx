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

describe("MaintenanceOwnerNoticeDraftComposer on the queue (AC-S38-4)", () => {
  it("renders the owner-notice draft control for an edit-capable user on a Live ticket", () => {
    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);
    expect(screen.getByText("Owner notice: draft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview draft" })).toBeInTheDocument();
  });

  it("is absent for a read-only user", () => {
    render(<MaintenanceQueue canEdit={false} initialTickets={[ticket()]} />);
    expect(screen.queryByText("Owner notice: draft")).toBeNull();
  });

  it("is absent on a Test ticket even for an edit-capable user", () => {
    render(
      <MaintenanceQueue
        canEdit
        initialTickets={[ticket({ data_mode: "test", summary: "TEST — leak" })]}
      />,
    );
    expect(screen.queryByText("Owner notice: draft")).toBeNull();
  });

  it("posts Preview then Create to the gated route with the ticket id", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        ticketRef: string;
        confirm: boolean;
      };
      if (body.confirm) {
        return {
          ok: true,
          json: async () => ({
            status: "created",
            recipient: { to: "owner@cedar-holdings.com" },
            subject: "Maintenance request for 512 Rosewood Ct",
            draftId: "draft-123",
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          status: "preview",
          recipient: { to: "owner@cedar-holdings.com" },
          subject: "Maintenance request for 512 Rosewood Ct",
          body: "Draft — Review before sending\n\nHello Cedar Holdings,",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));

    await waitFor(() => expect(screen.getByText(/Preview only/)).toBeInTheDocument());
    const previewCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/maintenance/owner-notice-draft"),
    );
    expect(previewCall).toBeTruthy();
    expect(JSON.parse(String(previewCall![1].body))).toEqual({
      ticketRef: "t1",
      confirm: false,
    });

    const create = screen.getByRole("button", { name: "Create Gmail draft" });
    expect(create).toBeEnabled();
    fireEvent.click(create);

    await waitFor(() =>
      expect(screen.getByText(/Unsent Gmail draft created/)).toBeInTheDocument(),
    );
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/api/maintenance/owner-notice-draft") &&
        JSON.parse(String((init as RequestInit).body)).confirm === true,
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall![1].body))).toEqual({
      ticketRef: "t1",
      confirm: true,
    });
  });
});
