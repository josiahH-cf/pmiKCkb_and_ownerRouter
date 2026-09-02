// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkOrderChatPanel } from "@/components/maintenance/WorkOrderChatPanel";

const fetchMock = vi.fn();

interface SentRequest {
  url: string;
  body: Record<string, unknown>;
}

const sent: SentRequest[] = [];

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    lane: "message",
    message_id: 501,
    role: "tenant",
    created_at: "2026-09-01T15:04:05.000Z",
    body: "The sink is still leaking.",
    truncated: false,
    mapping_state: "resident_bound",
    attachments: [],
    ...overrides,
  };
}

let thread: Record<string, unknown>;

beforeEach(() => {
  sent.length = 0;
  thread = { status: "ok", work_order_id: "9005", eligible: true, records: [] };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    sent.push({ url, body });
    if (url.endsWith("/work-order-chat")) {
      if (body.operation === "thread") return jsonResponse(thread);
      if (body.operation === "preview_sync") {
        return jsonResponse({
          status: "preview",
          execution_id: "exec_sync_1",
          preview_hash: "a".repeat(64),
          preview: {
            ticket_ref: "ticket-9",
            work_order_id: "9005",
            page: "1",
            page_size: "20",
            marks_read_for_managers: true,
          },
          warning: "RentVine will mark retrieved messages as read for managers.",
        });
      }
      if (body.operation === "confirm_sync") {
        thread = {
          ...thread,
          records: [
            message(),
            message({
              message_id: 504,
              mapping_state: "needs_mapping",
              body: "This is the co-occupant; please call me instead.",
            }),
          ],
        };
        return jsonResponse({
          status: "synced",
          execution_state: "Succeeded",
          counts: {
            new_messages: 2,
            already_synced: 0,
            needs_mapping: 1,
            review: 0,
            rejected: 0,
            truncated: 0,
          },
          next_page: 2,
          read_marker_note:
            "RentVine may have marked the retrieved messages read for managers; that state has no rollback.",
        });
      }
      if (body.operation === "rerun_mapping") {
        return jsonResponse({
          status: "rerun_complete",
          mapping_state: "resident_bound",
        });
      }
    }
    if (url.endsWith("/resident-reply-draft")) {
      if (body.confirm) {
        return jsonResponse({
          status: "created",
          draft_id: "draft-77",
          execution_id: "exec_draft_1",
        });
      }
      return jsonResponse({
        status: "preview",
        execution_id: "exec_draft_1",
        preview_hash: "b".repeat(64),
        from: "editor@pmikcmetro.com",
        to: "resident9@residents-pmikc.net",
        subject: String(body.subject),
        body: `Draft banner\n\n${String(body.body)}`,
        recipient_source_ref: "rentvine:lease:115:lease-tenant:88:vdeadbeefdeadbeef",
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 400);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function loadConversation() {
  fireEvent.click(screen.getByRole("button", { name: "Load conversation" }));
  await waitFor(() => expect(sent.at(-1)?.body.operation).toBe("thread"));
}

describe("S100 WorkOrderChatPanel", () => {
  it("renders with zero fetch calls until a person loads the conversation", () => {
    render(<WorkOrderChatPanel canEdit ticketId="ticket-9" />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Sync resident messages" }),
    ).not.toBeInTheDocument();
  });

  it("hides sync for an unbound ticket and explains the missing binding", async () => {
    thread = { status: "ok", work_order_id: null, eligible: false, records: [] };
    render(<WorkOrderChatPanel canEdit ticketId="ticket-9" />);
    await loadConversation();
    expect(
      screen.getByText(/no receipted RentVine work-order binding/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sync resident messages" }),
    ).not.toBeInTheDocument();
  });

  it("keeps sync, rerun, and drafting away from read-only users", async () => {
    thread = {
      status: "ok",
      work_order_id: "9005",
      eligible: true,
      records: [message({ mapping_state: "needs_mapping" })],
    };
    render(<WorkOrderChatPanel canEdit={false} ticketId="ticket-9" />);
    await loadConversation();
    expect(
      screen.queryByRole("button", { name: "Sync resident messages" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rerun source resolution" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Draft email reply" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Editor actions/)).toBeInTheDocument();
  });

  it("syncs only through the cancel-first exact confirmation and reports counts", async () => {
    render(<WorkOrderChatPanel canEdit ticketId="ticket-9" />);
    await loadConversation();

    fireEvent.click(screen.getByRole("button", { name: "Sync resident messages" }));
    await screen.findByText(
      "RentVine will mark retrieved messages as read for managers.",
    );
    const dialog = screen.getByRole("alertdialog", { name: "Confirm chat sync" });
    const buttons = Array.from(dialog.querySelectorAll("button")).map(
      (button) => button.textContent,
    );
    expect(buttons).toEqual(["Cancel", "Confirm this exact page"]);

    // Cancel performs no provider work: no confirm_sync request is ever sent.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sent.some((entry) => entry.body.operation === "confirm_sync")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Sync resident messages" }));
    await screen.findByRole("alertdialog", { name: "Confirm chat sync" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm this exact page" }));
    await screen.findByText(/2 new, 0 already synced, 1 needing mapping/);
    const confirmRequest = sent.find((entry) => entry.body.operation === "confirm_sync");
    expect(confirmRequest?.body).toMatchObject({
      executionId: "exec_sync_1",
      previewHash: "a".repeat(64),
    });
    expect(screen.getByText(/no rollback/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sync older messages" }),
    ).toBeInTheDocument();
    expect(screen.getByText("The sink is still leaking.")).toBeInTheDocument();
  });

  it("offers rerun on needs-mapping rows and reply only on bound resident rows", async () => {
    thread = {
      status: "ok",
      work_order_id: "9005",
      eligible: true,
      records: [
        message(),
        message({ message_id: 502, role: "manager", mapping_state: "nonresident" }),
        message({ message_id: 504, mapping_state: "needs_mapping" }),
        message({ message_id: 505, truncated: true }),
      ],
    };
    render(<WorkOrderChatPanel canEdit ticketId="ticket-9" />);
    await loadConversation();

    expect(screen.getAllByRole("button", { name: "Draft email reply" })).toHaveLength(2);
    expect(screen.getByText("Message truncated")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rerun source resolution" }));
    await waitFor(() =>
      expect(sent.at(-2)?.body).toMatchObject({
        operation: "rerun_mapping",
        messageId: 504,
      }),
    );
    await screen.findByText(/now mapped/);
  });

  it("drafts one reply through preview and exact confirmation", async () => {
    thread = {
      status: "ok",
      work_order_id: "9005",
      eligible: true,
      records: [message()],
    };
    render(<WorkOrderChatPanel canEdit ticketId="ticket-9" />);
    await loadConversation();

    fireEvent.click(screen.getByRole("button", { name: "Draft email reply" }));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Re: your maintenance request" },
    });
    fireEvent.change(screen.getByLabelText("Reply body"), {
      target: { value: "The plumber arrives Tuesday morning." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await screen.findByText(/server-verified resident resident9@residents-pmikc\.net/);

    fireEvent.click(
      screen.getByRole("button", { name: "Create the unsent Gmail draft" }),
    );
    await screen.findByText(/Unsent draft draft-77 is in your Gmail Drafts/);
    const confirm = sent.find(
      (entry) => entry.url.endsWith("/resident-reply-draft") && entry.body.confirm,
    );
    expect(confirm?.body.confirm).toEqual({
      executionId: "exec_draft_1",
      previewHash: "b".repeat(64),
    });
    expect(screen.getByText(/never sends and never deletes drafts/)).toBeInTheDocument();
  });
});
