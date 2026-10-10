// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { it, expect, afterEach, vi } from "vitest";
import { MaintenanceCapture } from "@/components/maintenance/MaintenanceCapture";
import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import {
  MaintenanceTicketProvider,
  useMaintenanceTicketState,
} from "@/components/maintenance/MaintenanceTicketProvider";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
vi.mock("@/components/maintenance/UnitTypeahead", () => ({
  UnitTypeahead: ({
    onSelect,
  }: {
    onSelect: (unit: { unitId: string; label: string } | null) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelect({ unitId: "unit:801", label: "Local 801 fixture" })}
    >
      Choose local verified unit
    </button>
  ),
}));
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
  id: "ticket-created",
  data_mode: "live",
  status: "Open",
  summary: "Local dripping tap",
  description: "Local dripping tap after troubleshooting",
  priority: "Normal",
  priority_provenance: "auto-inferred",
  unit: { unitId: "unit:801", label: "Local 801 fixture" },
  photo_refs: [],
  reporter: { kind: "staff", uid: "editor-one" },
  labels: [],
  space_id: "maintenance-work-order-intake",
  created_at: "2026-10-09T15:00:00Z",
  updated_at: "2026-10-09T15:00:00Z",
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function prepare() {
  fireEvent.change(screen.getByLabelText("Issue", { exact: false }), {
    target: { value: ticket.description },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose local verified unit" }));
  fireEvent.click(screen.getByRole("button", { name: "Review reported issue" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create ticket" })).toBeEnabled(),
  );
}
it("holds an unknown save with exact words/identity, blocks a second POST and checks only the original result", async () => {
  let reject!: () => void,
    readable = false;
  const calls: Array<{ method: string; url: string; body?: { creation_id: string } }> =
    [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("operating-policies")) return Response.json({ policies: [] });
      calls.push({
        method: options?.method ?? "GET",
        url,
        body: options?.body ? JSON.parse(String(options.body)) : undefined,
      });
      if (options?.method === "POST")
        return new Promise<Response>((_, fail) => {
          reject = () => fail(new Error("Lost response after commit"));
        });
      return readable
        ? Response.json({
            state: "created",
            creation_id: new URL(url, "http://local.test").searchParams.get(
              "creation_id",
            ),
            ticket,
          })
        : Response.json({
            state: "not_recorded",
            creation_id: new URL(url, "http://local.test").searchParams.get(
              "creation_id",
            ),
            detail: "No settled result; absence does not prove failure.",
            ticket: null,
          });
    }),
  );
  render(<MaintenanceCapture reporterUid="editor-one" />);
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
  const intent = calls[0].body!.creation_id;
  expect(new URL(location.href).searchParams.get("creation_id")).toBe(intent);
  reject();
  await screen.findByRole("button", { name: "Check creation result" });
  expect(screen.getByLabelText("Issue", { exact: false })).toHaveValue(
    ticket.description,
  );
  expect(screen.getByRole("button", { name: "Needs reconciliation" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check creation result" }));
  await screen.findByText("No settled result; absence does not prove failure.");
  readable = true;
  fireEvent.click(screen.getByRole("button", { name: "Check creation result" }));
  await screen.findByRole("link", { name: "Open created ticket: Local dripping tap" });
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  expect(
    calls
      .filter((c) => c.method === "GET")
      .every(
        (c) =>
          new URL(c.url, "http://local.test").searchParams.get("creation_id") === intent,
      ),
  ).toBe(true);
  expect(new URL(location.href).searchParams.get("ticket_id")).toBe(ticket.id);
});
it("reload restores owned pending work and performs readback only, while another actor cannot restore those private words", async () => {
  const id = "10f3de4b-2f2c-470a-8bd4-524ddbd075ab";
  sessionStorage.setItem(
    "pmi-kc:maintenance-creation:editor-one",
    JSON.stringify({
      uid: "editor-one",
      typedNote: ticket.description,
      transcript: "Original voice words",
      priority: "",
      command: {
        creation_id: id,
        summary: ticket.summary,
        description: ticket.description,
        priority: "Normal",
        unit: { ...ticket.unit, confidence: "Verified" },
      },
    }),
  );
  history.replaceState(null, "", `/?creation_id=${id}`);
  const fetch = vi.fn(async (url: string) =>
    url.includes("operating-policies")
      ? Response.json({ policies: [] })
      : Response.json({
          state: "not_recorded",
          creation_id: id,
          detail: "Unresolved original request",
          ticket: null,
        }),
  );
  vi.stubGlobal("fetch", fetch);
  const one = render(<MaintenanceCapture reporterUid="editor-one" />);
  await screen.findByText("Unresolved original request");
  expect(screen.getByLabelText("Issue", { exact: false })).toHaveValue(
    ticket.description,
  );
  expect(screen.getByText(/Original voice words/)).toBeInTheDocument();
  expect(
    fetch.mock.calls.every(
      (c) =>
        (c as unknown[])[1] === undefined || !((c as unknown[])[1] as RequestInit).method,
    ),
  ).toBe(true);
  one.unmount();
  render(<MaintenanceCapture reporterUid="editor-two" />);
  await screen.findByText("Unresolved original request");
  expect(screen.getByLabelText("Issue", { exact: false })).toHaveValue("");
  expect(screen.queryByText(/Original voice words/)).not.toBeInTheDocument();
});
it("a confirmed created result updates one shared queue and can be revealed without changing chosen filters", async () => {
  function Created() {
    const state = useMaintenanceTicketState();
    return (
      <button onClick={() => state?.recordCreated(ticket)}>Admit confirmed result</button>
    );
  }
  render(
    <MaintenanceTicketProvider initialTickets={[]}>
      <Created />
      <MaintenanceQueue initialTickets={[]} currentUid="editor-one" canEdit />
    </MaintenanceTicketProvider>,
  );
  fireEvent.click(screen.getByLabelText("Assigned to me"));
  fireEvent.click(screen.getByRole("button", { name: "Admit confirmed result" }));
  await screen.findByText(
    "Your created ticket is outside these filters. The chosen filters are kept.",
  );
  expect(screen.getByLabelText("Assigned to me")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Reveal created ticket" }));
  expect(screen.getByRole("heading", { name: "Local dripping tap" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Return to filtered queue" }));
  expect(screen.getByLabelText("Assigned to me")).toBeChecked();
  expect(
    screen.queryByRole("heading", { name: "Local dripping tap" }),
  ).not.toBeInTheDocument();
});

it("a late initial receipt read cannot overwrite a newer confirmed ticket result", async () => {
  const id = "10f3de4b-2f2c-470a-8bd4-524ddbd075ab";
  history.replaceState(null, "", `/?creation_id=${id}`);
  let settle!: (r: Response) => void;
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("operating-policies")) return Response.json({ policies: [] });
      reads++;
      if (reads === 1)
        return new Promise<Response>((r) => {
          settle = r;
        });
      return Response.json({ state: "created", creation_id: id, ticket });
    }),
  );
  render(<MaintenanceCapture reporterUid="editor-one" />);
  await screen.findByRole("button", { name: "Check creation result" });
  fireEvent.click(screen.getByRole("button", { name: "Check creation result" }));
  await screen.findByRole("link", { name: "Open created ticket: Local dripping tap" });
  settle(
    Response.json({
      state: "not_recorded",
      creation_id: id,
      detail: "Late missing receipt",
      ticket: null,
    }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Late missing receipt")).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("link", { name: "Open created ticket: Local dripping tap" }),
  ).toBeInTheDocument();
  expect(new URL(location.href).searchParams.get("ticket_id")).toBe(ticket.id);
});
