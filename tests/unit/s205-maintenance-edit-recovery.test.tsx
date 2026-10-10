// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { it, expect, afterEach, vi } from "vitest";
import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import { MaintenanceTicketProvider } from "@/components/maintenance/MaintenanceTicketProvider";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
vi.mock("@/components/gmail-hub/WorkflowCommunicationPanel", () => ({
  WorkflowCommunicationPanel: () => null,
}));
vi.mock("@/components/maintenance/RentvineWorkOrderPanel", () => ({
  RentvineWorkOrderPanel: () => null,
}));
vi.mock("@/components/maintenance/WorkOrderChatPanel", () => ({
  WorkOrderChatPanel: () => null,
}));
vi.mock("@/components/maintenance/MaintenanceOwnerNoticeDraftComposer", () => ({
  MaintenanceOwnerNoticeDraftComposer: () => null,
}));
const ticket: MaintenanceTicketRecord = {
  id: "case-one",
  record_version: 1,
  workflow_stage: "assessment",
  data_mode: "live",
  status: "Open",
  summary: "Fixture routine issue",
  description: "Local fixture",
  priority: "Normal",
  priority_provenance: "operator-set",
  unit: { unitId: "unit:801", label: "Fixture unit 801" },
  photo_refs: [],
  reporter: { kind: "staff", uid: "staff-one" },
  labels: [],
  space_id: "maintenance-work-order-intake",
  created_at: "2026-10-06T23:00:00Z",
  updated_at: "2026-10-09T15:00:00Z",
};
const assessed: MaintenanceTicketRecord = {
  ...ticket,
  record_version: 2,
  workflow_stage: "needs_information",
  status: "Waiting on Response",
  assessment: {
    outcome: "needs_information",
    scope: "Keep these actual assessment words",
    evidence_refs: [],
    recorded_by_uid: "staff-one",
    recorded_at: "2026-10-09T15:10:00Z",
    version: 1,
  },
};
function mount(actor = "staff-one") {
  return render(
    <MaintenanceTicketProvider initialTickets={[ticket]}>
      <MaintenanceQueue currentUid={actor} initialTickets={[ticket]} canEdit />
    </MaintenanceTicketProvider>,
  );
}
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("lost edit response preserves assessment words and reconciles the same operation without another PATCH", async () => {
  let operation = "",
    reads = 0;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      operation = JSON.parse(String(options.body)).operationId;
      throw Error("Lost response after app commit");
    }
    reads++;
    expect(new URL(url, "http://local.test").searchParams.get("operation_id")).toBe(
      operation,
    );
    return Response.json({
      state: "committed",
      operation_id: operation,
      committed_version: 2,
      ticket: assessed,
    });
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save assessment" })).toBeDisabled(),
  );
  fireEvent.change(screen.getByLabelText("Issue assessment and proposed work"), {
    target: { value: assessed.assessment!.scope },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save assessment" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save assessment" }));
  await screen.findByRole("button", { name: "Check original edit" });
  expect(screen.getByLabelText("Issue assessment and proposed work")).toHaveValue(
    assessed.assessment!.scope,
  );
  expect(screen.getByRole("button", { name: "Save assessment" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check original edit" }));
  await screen.findByRole("heading", { name: "Awaiting information" });
  expect(fetch.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(1);
  expect(reads).toBe(1);
  expect(new URL(location.href).searchParams.has("maintenance_operation")).toBe(false);
});
it("reload reads the original operation and displays its retained words only for the owning actor", async () => {
  const id = "10f3de4b-2f2c-470a-8bd4-524ddbd075ab";
  sessionStorage.setItem(
    "pmi-kc:maintenance-edit:staff-one",
    JSON.stringify({
      actor: "staff-one",
      ticketId: ticket.id,
      command: {
        op: "assessment",
        scope: "Owned pending assessment words",
        operationId: id,
        expectedVersion: 1,
      },
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        state: "not_recorded",
        operation_id: id,
        detail: "Original request is still unresolved",
        ticket: null,
      }),
    ),
  );
  const one = mount();
  await screen.findByText("Owned pending assessment words");
  expect(screen.getByRole("button", { name: "Save assessment" })).toBeDisabled();
  one.unmount();
  mount("staff-two");
  await waitFor(() =>
    expect(screen.queryByText("Owned pending assessment words")).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: "Check original edit" }),
  ).not.toBeInTheDocument();
});
it("conflict preserves typed work and requires a fresh read before a deliberately new operation", async () => {
  const commands: Array<Record<string, unknown>> = [];
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        const command = JSON.parse(String(options.body));
        commands.push(command);
        if (commands.length === 1)
          return Response.json({ error: "Current ticket changed" }, { status: 409 });
        return Response.json({
          ticket: { ...assessed, record_version: 4 },
          operation_id: command.operationId,
        });
      }
      reads++;
      return Response.json({ ticket: { ...ticket, record_version: 3 } });
    }),
  );
  mount();
  fireEvent.change(screen.getByLabelText("Issue assessment and proposed work"), {
    target: { value: assessed.assessment!.scope },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save assessment" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save assessment" }));
  await screen.findByRole("button", { name: "Read current ticket after conflict" });
  expect(screen.getByLabelText("Issue assessment and proposed work")).toHaveValue(
    assessed.assessment!.scope,
  );
  expect(commands).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Read current ticket after conflict" }),
  );
  await screen.findByText(/Current ticket read/);
  expect(reads).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Save assessment" }));
  await screen.findByRole("heading", { name: "Awaiting information" });
  expect(commands[1]).toMatchObject({
    scope: assessed.assessment!.scope,
    expectedVersion: 3,
  });
  expect(commands[1].operationId).not.toBe(commands[0].operationId);
});
