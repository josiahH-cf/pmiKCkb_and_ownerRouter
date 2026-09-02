// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RentvineWorkOrderPanel } from "@/components/maintenance/RentvineWorkOrderPanel";

const fetchMock = vi.fn();

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return { ok: status < 400, status, json: async () => payload };
}

function readPayload() {
  return {
    status: "ok",
    list: {
      rows: [
        {
          workOrderId: "9005",
          workOrderNumber: "WO-9005",
          workOrderStatusId: "9101",
          primaryWorkOrderStatusId: "2",
          priorityId: "2",
          description: "Kitchen sink drips at the trap.",
          isSharedWithTenant: "0",
          isSharedWithOwner: "0",
        },
      ],
      pages: 1,
      complete: true,
    },
    detail: null,
    statuses: [
      {
        workOrderStatusId: "9101",
        primaryWorkOrderStatusId: "2",
        name: "Open",
        isSystemStatus: "1",
      },
      {
        workOrderStatusId: "9102",
        primaryWorkOrderStatusId: "3",
        name: "Completed",
        isSystemStatus: "1",
      },
    ],
    trades: [{ vendorTradeId: "4", name: "Plumbing" }],
    filters: { propertyId: "84", unitId: "217" },
  };
}

async function checkFirst() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ status: "ok", link: null }));
  fetchMock.mockResolvedValueOnce(jsonResponse(readPayload()));
  fireEvent.click(screen.getByText("Check RentVine"));
  await waitFor(() => {
    expect(screen.getByText(/complete/)).toBeInTheDocument();
  });
}

describe("S99 RentVine work-order panel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers only an explicit bounded read until the staff runs it", () => {
    render(
      <RentvineWorkOrderPanel
        canEdit
        hasVerifiedUnit
        initialLink={null}
        ticketId="ticket-9"
      />,
    );
    expect(screen.getByText("Check RentVine")).toBeInTheDocument();
    expect(screen.getAllByText(/Run Check RentVine first/).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows pagination truth and provider rows after the read", async () => {
    render(
      <RentvineWorkOrderPanel
        canEdit
        hasVerifiedUnit
        initialLink={null}
        ticketId="ticket-9"
      />,
    );
    await checkFirst();
    expect(screen.getAllByText(/WO-9005/).length).toBeGreaterThan(0);
    const readBody = JSON.parse(
      (fetchMock.mock.calls[1] as [string, { body: string }])[1].body,
    );
    expect(readBody).toEqual({ operation: "read", ticketId: "ticket-9" });
  });

  it("requires explicit vacancy before proposing and sends the exact typed body", async () => {
    render(
      <RentvineWorkOrderPanel
        canEdit
        hasVerifiedUnit
        initialLink={null}
        ticketId="ticket-9"
      />,
    );
    await checkFirst();
    fireEvent.change(screen.getByLabelText("Initial status (fresh catalog)"), {
      target: { value: "9101" },
    });
    fireEvent.click(screen.getByText("Save create proposal for approval"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/never inferred/);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText("Unit vacancy (explicit confirmation)"), {
      target: { value: "occupied" },
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "prepared",
        execution_id: "exec_1",
        approval_state: "Awaiting Admin",
        preview: { ticket_ref: "ticket-9" },
        approval_queue_href: "/approval-queue",
      }),
    );
    fireEvent.click(screen.getByText("Save create proposal for approval"));
    await waitFor(() => {
      expect(screen.getByText(/routed to Admin approval/)).toBeInTheDocument();
    });
    const proposeBody = JSON.parse(
      (fetchMock.mock.calls[2] as [string, { body: string }])[1].body,
    );
    expect(proposeBody).toEqual({
      operation: "propose_create",
      ticketId: "ticket-9",
      priorityId: "2",
      workOrderStatusId: "9101",
      isVacant: false,
    });
    expect(screen.getByText("Open the Approval Queue")).toHaveAttribute(
      "href",
      "/approval-queue",
    );
  });

  it("hides the create form when a live link exists and explains the state", () => {
    render(
      <RentvineWorkOrderPanel
        canEdit
        hasVerifiedUnit
        initialLink={{
          state: "succeeded",
          execution_id: "exec_1",
          provider_work_order_id: "9005",
        }}
        ticketId="ticket-9"
      />,
    );
    expect(screen.queryByText("Create in RentVine")).not.toBeInTheDocument();
    expect(screen.getByText(/Linked RentVine work order 9005/)).toBeInTheDocument();
  });

  it("offers only shared-off rows as status targets with fixed-off notification copy", async () => {
    render(
      <RentvineWorkOrderPanel
        canEdit
        hasVerifiedUnit
        initialLink={null}
        ticketId="ticket-9"
      />,
    );
    await checkFirst();
    expect(
      screen.getByText(/vendor notification and completion review stay/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Work order (fresh read)"), {
      target: { value: "9005" },
    });
    fireEvent.change(screen.getByLabelText("Target status (fresh catalog)"), {
      target: { value: "9102" },
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "prepared",
        execution_id: "exec_2",
        approval_state: "Awaiting Admin",
        preview: { work_order_id: "9005" },
        approval_queue_href: "/approval-queue",
      }),
    );
    fireEvent.click(screen.getByText("Save status proposal for approval"));
    await waitFor(() => {
      expect(screen.getByText(/routed to Admin approval/)).toBeInTheDocument();
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[2] as [string, { body: string }])[1].body,
    );
    expect(body).toEqual({
      operation: "propose_status",
      workOrderId: "9005",
      targetStatusId: "9102",
    });
  });

  it("hands non-editors to the access request and exposes no write control", () => {
    render(
      <RentvineWorkOrderPanel
        canEdit={false}
        hasVerifiedUnit
        initialLink={null}
        ticketId="ticket-9"
      />,
    );
    expect(
      screen.getByText(/Proposing a RentVine work-order change is an Editor action/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create in RentVine")).not.toBeInTheDocument();
    expect(screen.queryByText("Update RentVine status")).not.toBeInTheDocument();
    // The bounded read stays available; no vendor/share/delete CONTROL exists anywhere
    // (the descriptive copy may name them only to say they are absent).
    expect(screen.getByText("Check RentVine")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share/i })).not.toBeInTheDocument();
  });
});
