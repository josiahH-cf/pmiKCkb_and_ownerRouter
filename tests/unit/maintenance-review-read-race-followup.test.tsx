// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MaintenanceReviews } from "@/components/maintenance/MaintenanceReviews";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("a delayed automatic context refresh cannot replace the acknowledgement of a recorded staff review", async () => {
  let ticket: MaintenanceTicketRecord = {
    id: "local-race-case",
    record_version: 3,
    data_mode: "live",
    status: "Open",
    priority: "Normal",
    priority_provenance: "auto-inferred",
    summary: "Local synthetic issue",
    description: "Local actual reviewed fixture facts",
    unit: null,
    photo_refs: [],
    reporter: { kind: "staff", uid: "fixture-staff" },
    labels: [],
    space_id: "maintenance",
    created_at: "2026-10-09T12:00:00.000Z",
    updated_at: "2026-10-09T12:00:00.000Z",
  };
  const unset = { state: "unset", policy: null, detail: "No approved policy" };
  let resolveRefresh!: (response: Response) => void;
  const refresh = new Promise<Response>((resolve) => {
    resolveRefresh = resolve;
  });
  const response = () =>
    Response.json({
      ticket,
      emergency: unset,
      chargeback: unset,
      urgencyNeedsReview: false,
      responsibilityNeedsReview: false,
      approvedGuidance: null,
      guidanceHold: "Actual guidance unavailable",
    });
  let reads = 0;
  const fetch = vi.fn(async () => (++reads === 2 ? refresh : response()));
  vi.stubGlobal("fetch", fetch);
  const apply = vi.fn(async () => {
    ticket = { ...ticket, record_version: 4 };
    view.rerender(element());
    return true;
  });
  const element = () => (
    <MaintenanceReviews
      ticket={ticket}
      canEdit
      blocked={false}
      onApply={apply}
      onReadCurrent={async () => {}}
    />
  );
  const view = render(element());
  fireEvent.click(screen.getByText("Urgency and responsibility review", { exact: true }));
  await screen.findByText("Actual guidance unavailable");
  fireEvent.change(screen.getByLabelText("Responsibility review reason"), {
    target: { value: "Local actual disputed concern needs review" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save staff responsibility review" }),
  );
  await screen.findByText(/Staff responsibility review recorded\. Proposed amounts/);
  await waitFor(() => expect(reads).toBe(2));
  await act(async () => {
    resolveRefresh(response());
    await refresh;
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Read current review context" }),
    ).toBeEnabled(),
  );
  expect(
    screen.getByText(/Staff responsibility review recorded\. Proposed amounts/),
  ).toBeVisible();
  expect(apply).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Read current review context" }));
  await screen.findByText(
    "Current policy and review context read. Your entered facts are kept.",
  );
  expect(apply).toHaveBeenCalledTimes(1);
});
