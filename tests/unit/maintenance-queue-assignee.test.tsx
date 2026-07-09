// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import type { AssignableUser } from "@/lib/maintenance/assignee-model";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const roster: AssignableUser[] = [
  { uid: "u-alice", email: "alice@pmikcmetro.com" },
  { uid: "u-bob", email: "bob@pmikcmetro.com" },
];

function ticket(
  overrides: Partial<MaintenanceTicketRecord> = {},
): MaintenanceTicketRecord {
  return {
    id: "t1",
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

function stubFetchOk() {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ ticket: ticket() }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(init: RequestInit | undefined): unknown {
  return JSON.parse(String(init?.body ?? "{}"));
}

describe("MaintenanceQueue assignee picker", () => {
  it("renders Unassigned + each rostered user's email as options", () => {
    render(
      <MaintenanceQueue
        initialTickets={[ticket()]}
        assignees={roster}
        currentUid="u-alice"
      />,
    );
    const select = screen.getByLabelText("Assignee") as HTMLSelectElement;
    const optionText = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(optionText).toEqual([
      "Unassigned",
      "alice@pmikcmetro.com",
      "bob@pmikcmetro.com",
    ]);
  });

  it("PATCHes op:assign with the chosen uid when an assignee is selected", async () => {
    const fetchMock = stubFetchOk();
    render(
      <MaintenanceQueue
        initialTickets={[ticket()]}
        assignees={roster}
        currentUid="u-alice"
      />,
    );

    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "u-bob" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/maintenance/tickets/t1");
    expect(bodyOf(init)).toEqual({
      op: "assign",
      assigneeUid: "u-bob",
    });
  });

  it("sends assigneeUid:null (not '') to unassign", async () => {
    const fetchMock = stubFetchOk();
    render(
      <MaintenanceQueue
        initialTickets={[ticket({ assignee_uid: "u-bob" })]}
        assignees={roster}
        currentUid="u-alice"
      />,
    );
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock.mock.calls[0][1])).toEqual({
      op: "assign",
      assigneeUid: null,
    });
  });

  it("does not PATCH when re-selecting the current assignee (no-op guard)", async () => {
    const fetchMock = stubFetchOk();
    render(
      <MaintenanceQueue
        initialTickets={[ticket({ assignee_uid: "u-alice" })]}
        assignees={roster}
        currentUid="u-alice"
      />,
    );
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "u-alice" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never renders a raw assignee uid; an off-roster assignee shows a value-free label", () => {
    render(
      <MaintenanceQueue
        initialTickets={[ticket({ assignee_uid: "real-user-xyz" })]}
        assignees={roster}
        currentUid="u-alice"
      />,
    );
    expect(screen.queryByText(/real-user-xyz/)).not.toBeInTheDocument();
    expect(screen.getByText("Assigned (outside roster)")).toBeInTheDocument();
    // The off-roster option must be the SELECTED value (a regression that drops the value attribute
    // would silently render an assigned ticket as "Unassigned").
    expect((screen.getByLabelText("Assignee") as HTMLSelectElement).value).toBe(
      "real-user-xyz",
    );
  });

  it("does not PATCH when unassigning an already-unassigned ticket (null no-op guard)", async () => {
    const fetchMock = stubFetchOk();
    render(
      <MaintenanceQueue
        initialTickets={[ticket()]} // no assignee_uid
        assignees={roster}
        currentUid="u-alice"
      />,
    );
    // (undefined ?? null) === null must hold so selecting "Unassigned" on an unassigned ticket is a no-op.
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the assigned-to-me empty state when the filter hides every ticket", () => {
    render(
      <MaintenanceQueue
        initialTickets={[ticket({ assignee_uid: "u-bob" })]}
        assignees={roster}
        currentUid="u-alice"
      />,
    );
    fireEvent.click(screen.getByLabelText("Assigned to me"));
    expect(screen.getByText("No tickets assigned to you.")).toBeInTheDocument();
    expect(screen.queryByText("Kitchen leak")).not.toBeInTheDocument();
  });

  it("'Assigned to me' filters the queue to the signed-in user's tickets", () => {
    render(
      <MaintenanceQueue
        initialTickets={[
          ticket({ id: "mine", summary: "My ticket", assignee_uid: "u-alice" }),
          ticket({ id: "theirs", summary: "Bob ticket", assignee_uid: "u-bob" }),
        ]}
        assignees={roster}
        currentUid="u-alice"
      />,
    );
    expect(screen.getByText("Bob ticket")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Assigned to me"));

    expect(screen.getByText("My ticket")).toBeInTheDocument();
    expect(screen.queryByText("Bob ticket")).not.toBeInTheDocument();
  });
});
