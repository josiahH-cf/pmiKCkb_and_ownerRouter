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

  it("omits a legacy Test ticket and its draft controls", () => {
    render(
      <MaintenanceQueue
        canEdit
        initialTickets={[ticket({ data_mode: "test", summary: "TEST — leak" })]}
      />,
    );
    expect(screen.queryByText("TEST — leak")).toBeNull();
    expect(screen.queryByText("Owner notice: draft")).toBeNull();
  });

  // S139: the composer used to post confirm as a boolean, which the strict route schema refuses
  // with a 400, so no preview or draft could ever be made. It now confirms the exact prepared
  // execution and preview hash, with the exact reviewed wording.
  const PREVIEW = {
    status: "preview",
    recipient: { to: "owner@cedar-holdings.com" },
    subject: "Maintenance request for 512 Rosewood Ct",
    body: "Draft banner\n\nHello Cedar Holdings,\n\nWe received a request.",
    editableBody: "Hello Cedar Holdings,\n\nWe received a request.",
    standardBody: "Hello Cedar Holdings,\n\nWe received a request.",
    earlierDraftExists: false,
    executionId: `exec_${"a".repeat(40)}`,
    previewHash: "b".repeat(64),
  };

  function routeCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/api/maintenance/owner-notice-draft"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  }

  it("previews, then creates by confirming the exact prepared execution and wording", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { confirm?: unknown };
      return {
        ok: true,
        json: async () =>
          body.confirm
            ? {
                status: "created",
                recipient: { to: "owner@cedar-holdings.com" },
                subject: PREVIEW.subject,
                draftId: "draft-123",
                executionId: PREVIEW.executionId,
              }
            : PREVIEW,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Email wording")).toHaveValue(PREVIEW.editableBody),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Gmail draft" }));
    await waitFor(() =>
      expect(screen.getByText(/Unsent Gmail draft created/)).toBeInTheDocument(),
    );

    expect(routeCalls(fetchMock)).toEqual([
      { ticketRef: "t1" },
      {
        ticketRef: "t1",
        body: PREVIEW.editableBody,
        confirm: { executionId: PREVIEW.executionId, previewHash: PREVIEW.previewHash },
      },
    ]);
    // S140: one optional hint in the drafted state, outside any email text.
    expect(
      screen.getAllByText(
        "Draft ready. For another wording pass, try Gemini in Gmail, where available.",
      ),
    ).toHaveLength(1);
    expect(screen.queryByLabelText("Email wording")).toBeNull();
  });

  it("needs a fresh preview after the wording changes and discloses an earlier draft", async () => {
    const edited = "Hello Cedar Holdings,\n\nWe received a kitchen leak request.";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { body?: string };
      return {
        ok: true,
        json: async () =>
          body.body
            ? {
                ...PREVIEW,
                editableBody: body.body,
                earlierDraftExists: true,
                executionId: `exec_${"c".repeat(40)}`,
              }
            : PREVIEW,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    const wording = await screen.findByLabelText("Email wording");
    fireEvent.change(wording, { target: { value: edited } });
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();
    expect(screen.getByText(/wording changed after the preview/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview this wording" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeEnabled(),
    );
    expect(routeCalls(fetchMock).at(-1)).toEqual({ ticketRef: "t1", body: edited });
    expect(screen.getByRole("note")).toHaveTextContent(/adds a second, separate draft/);
    fireEvent.click(
      screen.getByRole("button", { name: "Return to the standard wording" }),
    );
    expect(screen.getByLabelText("Email wording")).toHaveValue(PREVIEW.standardBody);
  });

  it("applies a refined wording to the draft editor without creating anything", async () => {
    const refined =
      "Hello Cedar Holdings,\n\nA repair request came in for your property.";
    const fetchMock = vi.fn<
      (
        url: string,
        init?: RequestInit,
      ) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
    >(async (url) => ({
      ok: true,
      json: async () =>
        String(url).includes("/api/email-refinement")
          ? { status: "revised", body: refined, requestedValues: [], removedValues: [] }
          : PREVIEW,
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MaintenanceQueue canEdit initialTickets={[ticket()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await screen.findByLabelText("Email wording");
    fireEvent.change(screen.getByLabelText("Refine with AI"), {
      target: { value: "Make it warmer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refine wording" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use this revision" }));

    expect(screen.getByLabelText("Email wording")).toHaveValue(refined);
    const refineCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/email-refinement"),
    );
    expect(JSON.parse(String(refineCall![1]?.body))).toEqual({
      surface: "maintenance_owner_notice",
      ticketRef: "t1",
      currentBody: PREVIEW.editableBody,
      instruction: "Make it warmer",
    });
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo the last refinement" }));
    expect(screen.getByLabelText("Email wording")).toHaveValue(PREVIEW.editableBody);
  });
});
