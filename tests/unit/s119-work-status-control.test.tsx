// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  OVERALL_STATUS_LABEL,
  RenewalDeskTable,
} from "@/components/lease-renewal/RenewalDeskTable";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { RenewalWorkStatusControl } from "@/components/lease-renewal/RenewalWorkStatusControl";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_WORK_STATUS_LABELS,
  projectRenewalWorkStatus,
  type RenewalWorkStatusActivity,
  type RenewalWorkStatusRecord,
} from "@/lib/lease-renewal/work-status";
import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
} from "@/tests/helpers/sample-desk";

// S119: the staff work status control saves only on Save status, reports the actual result,
// re-reads on conflict or a lost response, and never claims durability for a selection.

const PARTY_FILTER_KEY = Buffer.alloc(32, 7).toString("base64url");
const LEASE = "lease-318-cedar-7";
const RECORDED_AT = "2026-09-16T23:10:00.000Z";

function savedRecord(
  overrides: Partial<RenewalWorkStatusRecord> = {},
): RenewalWorkStatusRecord {
  return {
    schemaVersion: "renewal-work-status/v1",
    leaseId: LEASE,
    revision: 1,
    status: "waiting_on_owner_response",
    recordedAt: RECORDED_AT,
    recordedByUid: "op-1",
    recordedByLabel: "op1@pmikcmetro.com",
    cycleId: null,
    eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
    ...overrides,
  };
}

function activity(
  record: RenewalWorkStatusRecord,
  previousStatus: RenewalWorkStatusActivity["previousStatus"] = null,
): RenewalWorkStatusActivity {
  return {
    id: record.eventId,
    leaseId: record.leaseId,
    revision: record.revision,
    previousStatus,
    status: record.status,
    recordedAt: record.recordedAt,
    recordedByUid: record.recordedByUid,
    recordedByLabel: record.recordedByLabel,
    cycleId: record.cycleId,
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.RENEWAL_DESK_PARTY_FILTER_KEY = PARTY_FILTER_KEY;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete process.env.RENEWAL_DESK_PARTY_FILTER_KEY;
});

function workspace() {
  const value = getRenewalLeaseWorkspace(LEASE);
  if (!value) throw new Error("sample lease missing");
  return value;
}

function openInformation() {
  fireEvent.click(screen.getByRole("button", { name: "Lease information" }));
  return screen.getByRole("complementary", { name: "Lease information" });
}

function postedBody(call: unknown[]) {
  const init = call[1] as { method?: string; body?: string };
  return {
    method: init.method,
    body: JSON.parse(init.body ?? "{}") as Record<string, unknown>,
  };
}

describe("S119 work status control (R119.1, R119.2, R119.4)", () => {
  it("AC-S119-1: a selection is not durable until Save status succeeds; the saved value, recorder, time and history then render", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as { operationId: string };
      const record = savedRecord({ eventId: body.operationId });
      return jsonResponse(200, {
        record,
        history: [activity(record)],
        duplicate: false,
      });
    });
    const view = render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace()}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    expect(screen.getByText("Staff status: Not recorded")).toBeVisible();
    const info = openInformation();
    const select = within(info).getByLabelText("Work status (recorded by staff)");
    expect(select).toHaveValue("");
    expect(within(info).getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Not recorded",
    );
    const save = within(info).getByRole("button", { name: "Save status" });
    expect(save).toBeDisabled();
    // Every bounded status is offered once; nothing else is.
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    for (const label of Object.values(RENEWAL_WORK_STATUS_LABELS)) {
      expect(options.filter((entry) => entry === label)).toHaveLength(1);
    }
    expect(options.some((entry) => /messaged/i.test(entry ?? ""))).toBe(false);

    fireEvent.change(select, { target: { value: "waiting_on_owner_response" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(info).getByText(/not saved yet/i)).toBeVisible();
    expect(screen.getByText("Staff status: Not recorded")).toBeVisible();
    expect(save).toBeEnabled();
    // No reason, recipient, quote or checklist is demanded to save this annotation.
    expect(within(info).queryByLabelText(/reason/i)).toBeNull();

    fireEvent.click(save);
    await within(info).findByText(/^Saved: Waiting on owner response/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/lease-renewal/work-status");
    const { method, body } = postedBody(fetchMock.mock.calls[0]);
    expect(method).toBe("POST");
    expect(body).toEqual({
      leaseId: LEASE,
      status: "waiting_on_owner_response",
      expectedRevision: 0,
      operationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ),
    });
    const saved = within(info).getByTestId("renewal-work-status-saved");
    expect(saved).toHaveTextContent("Waiting on owner response");
    expect(saved).toHaveTextContent("op1@pmikcmetro.com");
    expect(saved.querySelector("time")).toHaveAttribute("dateTime", RECORDED_AT);
    expect(within(info).queryByText(/not saved yet/i)).toBeNull();
    // The compact context and desk row are server projections: the save requests a refresh and
    // the re-rendered page shows the same saved value there.
    expect(router.refresh).toHaveBeenCalledTimes(1);
    const record = savedRecord({
      eventId: String(postedBody(fetchMock.mock.calls[0]).body.operationId),
    });
    view.rerender(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace()}
        workStatus={{
          available: true,
          record,
          history: [activity(record)],
          currentCycleId: null,
        }}
      />,
    );
    expect(screen.getByText("Staff status: Waiting on owner response")).toBeVisible();
    expect(screen.queryByText("Staff status: Not recorded")).toBeNull();
    const history = within(info).getByText("Status history").closest("details");
    expect(history).not.toBeNull();
    fireEvent.click(within(info).getByText("Status history"));
    const entry = within(history as HTMLElement).getByRole("listitem");
    expect(entry).toHaveTextContent("Waiting on owner response");
    expect(entry).toHaveTextContent("Not recorded");
    expect(entry).toHaveTextContent("op1@pmikcmetro.com");
  });

  it("AC-S119-2: the staff status never impersonates derived status or completion, and a previous-cycle value is distinguishable", () => {
    const value = workspace();
    render(
      <RenewalWorkspace
        role="Editor"
        workspace={value}
        workStatus={{
          available: true,
          record: savedRecord({ status: "complete_staff_status", cycleId: "cycle-a" }),
          history: [],
          currentCycleId: "cycle-b",
        }}
      />,
    );
    const info = openInformation();
    const statusRow = within(info).getByText("Status").closest("div");
    expect(statusRow).toHaveTextContent(
      OVERALL_STATUS_LABEL[value.guidance.overallStatus],
    );
    expect(statusRow).not.toHaveTextContent(/staff status/i);
    expect(screen.queryByText("Completed: recorded by staff")).toBeNull();
    const saved = within(info).getByTestId("renewal-work-status-saved");
    expect(saved).toHaveTextContent(RENEWAL_WORK_STATUS_LABELS.complete_staff_status);
    expect(saved).toHaveTextContent(/previous renewal cycle/i);
    expect(
      screen.getByText(
        `Staff status: ${RENEWAL_WORK_STATUS_LABELS.complete_staff_status}`,
      ),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-S119-4: a failed save keeps the last saved value, a conflict reads back the current value, and a lost response resolves by readback", async () => {
    render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace()}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    const info = openInformation();
    const select = within(info).getByLabelText("Work status (recorded by staff)");
    const save = within(info).getByRole("button", { name: "Save status" });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: "The status store did not answer." }),
    );
    fireEvent.change(select, { target: { value: "verifying_lease_and_rent" } });
    fireEvent.click(save);
    await within(info).findByText(/The status store did not answer/);
    expect(within(info).getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Not recorded",
    );
    expect(screen.getByText("Staff status: Not recorded")).toBeVisible();

    // A stale save: another operator's value is read back and named, never overwritten silently.
    const theirs = savedRecord({
      status: "preparing_tenant_offer",
      recordedByUid: "op-2",
      recordedByLabel: "op2@pmikcmetro.com",
      eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000002",
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(409, { error: "Another operator saved this status." }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { record: theirs, history: [activity(theirs)] }),
      );
    fireEvent.click(save);
    await within(info).findByText(/Another operator saved this status/);
    const saved = within(info).getByTestId("renewal-work-status-saved");
    expect(saved).toHaveTextContent("Preparing tenant offer");
    expect(saved).toHaveTextContent("op2@pmikcmetro.com");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "GET" });
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      "/api/lease-renewal/work-status?leaseId=",
    );
    // The server projections are refreshed so the compact context and desk row catch up.
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Staff status: Not recorded")).toBeVisible();

    // A lost response: the saved state is read back; a matching operation id proves the save.
    fetchMock.mockRejectedValueOnce(new Error("network"));
    fetchMock.mockImplementationOnce(async () => {
      const posted = postedBody(fetchMock.mock.calls[3]).body;
      const record = savedRecord({
        status: "verifying_lease_and_rent",
        revision: 2,
        eventId: String(posted.operationId),
      });
      return jsonResponse(200, {
        record,
        history: [activity(theirs), activity(record, "preparing_tenant_offer")],
      });
    });
    fireEvent.click(save);
    await within(info).findByText(/^Saved: Verifying lease and rent/);
    expect(postedBody(fetchMock.mock.calls[3]).body).toMatchObject({
      status: "verifying_lease_and_rent",
      expectedRevision: 1,
    });
    expect(fetchMock.mock.calls[4][1]).toMatchObject({ method: "GET" });
    expect(within(info).getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Verifying lease and rent",
    );
    // Exactly one POST per attempt; no duplicate write was issued to recover the lost response.
    expect(
      fetchMock.mock.calls.filter((call) => postedBody(call).method === "POST"),
    ).toHaveLength(3);
  });

  it("AC-S119-4: an unavailable read is not rendered as Not recorded, and a reader cannot save", () => {
    const { unmount } = render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace()}
        workStatus={{
          available: false,
          record: null,
          history: [],
          currentCycleId: undefined,
        }}
      />,
    );
    expect(screen.queryByText("Staff status: Not recorded")).toBeNull();
    const info = openInformation();
    expect(within(info).getByText(/could not be read/i)).toBeVisible();
    expect(within(info).queryByText("Not recorded")).toBeNull();
    expect(within(info).getByLabelText("Work status (recorded by staff)")).toBeDisabled();
    expect(within(info).getByRole("button", { name: "Save status" })).toBeDisabled();
    unmount();

    // Every current role carries edit; the control still fails closed when authority is absent.
    render(
      <RenewalWorkStatusControl
        canEdit={false}
        leaseId={LEASE}
        read={{
          available: true,
          record: savedRecord(),
          history: [],
          currentCycleId: null,
        }}
      />,
    );
    expect(screen.getByLabelText("Work status (recorded by staff)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save status" })).toBeDisabled();
    expect(screen.getByText(/Editor access/)).toBeVisible();
    expect(screen.getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Waiting on owner response",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("S119 desk table projection and filter (R119.3)", () => {
  function rows(): DeskLeaseRow[] {
    const items = getRenewalDeskView().items;
    const statuses = [
      projectRenewalWorkStatus(
        { available: true, record: savedRecord({ leaseId: items[0].id }) },
        null,
      ),
      { state: "not_recorded" as const },
      { state: "unavailable" as const },
    ];
    return items.slice(0, 3).map((row, index) => ({
      ...withRenewalDeskQueryKeys({ ...row, workStatus: statuses[index] }),
      guidance: row.guidance,
      processState: row.processState,
    }));
  }
  const shortcuts = { available: false, tokenFor: () => null };

  it("AC-S119-3: shows the saved staff status per row and offers the matching filter including Not recorded", () => {
    const [waiting, notRecorded, unavailable] = rows();
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[waiting, notRecorded, unavailable]}
        shortcuts={shortcuts}
        sourceReadOk
        state={DEFAULT_RENEWAL_DESK_QUERY_V2}
      />,
    );
    expect(screen.getByText("Staff status: Waiting on owner response")).toBeVisible();
    expect(screen.getByText("Staff status: Not recorded")).toBeVisible();
    expect(screen.getByText(/Staff status: Not available/)).toBeVisible();
    expect(document.querySelector(`tr[data-lease-id="${waiting.id}"]`)).toHaveAttribute(
      "data-work-status",
      "waiting_on_owner_response",
    );
    expect(
      document.querySelector(`tr[data-lease-id="${notRecorded.id}"]`),
    ).toHaveAttribute("data-work-status", "not_recorded");
    expect(
      document.querySelector(`tr[data-lease-id="${unavailable.id}"]`),
    ).toHaveAttribute("data-work-status", "unavailable");
    const select = document.querySelector<HTMLSelectElement>(
      "#renewal-filter-workStatus",
    );
    expect(select).not.toBeNull();
    expect(screen.getByLabelText("Work status (recorded by staff)")).toBe(select);
    const labels = Array.from(select!.options).map((option) => option.textContent);
    expect(labels).toEqual([
      "All staff statuses",
      "Not recorded",
      ...Object.values(RENEWAL_WORK_STATUS_LABELS),
    ]);
    expect(labels).not.toContain("Not available");
    // The existing overall-status filter keeps its own control and values.
    expect(document.querySelector("#renewal-filter-overallStatus")).not.toBeNull();
  });

  it("AC-S119-3: an active staff-status filter renders as one removable chip that keeps the other filters", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={rows().slice(0, 1)}
        shortcuts={shortcuts}
        sourceReadOk
        state={{
          ...DEFAULT_RENEWAL_DESK_QUERY_V2,
          workStatus: "waiting_on_owner_response",
          term: "fixed_term",
        }}
      />,
    );
    expect(
      screen.getByText("Staff status: Waiting on owner response", {
        selector: ".renewal-filter-chip span",
      }),
    ).toBeVisible();
    const remove = screen.getByRole("link", {
      name: "Remove filter: Staff status: Waiting on owner response",
    });
    expect(remove.getAttribute("href")).toContain("term=fixed_term");
    expect(remove.getAttribute("href")).not.toContain("workStatus");
  });
});
