// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkAccountabilityBoard } from "@/components/work/WorkAccountabilityBoard";
import {
  WORK_RETENTION_POLICY_VERSION,
  type WorkAccountabilitySnapshot,
  type WorkTaskRecord,
} from "@/lib/work-accountability/types";

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "request-id-1" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("My work and Team work surfaces", () => {
  it("renders factual task states, current session, and correction-needed copy", async () => {
    const snapshot = snapshotWithCurrentSession();
    snapshot.tasks[0] = taskRecord({
      state: "Completed",
      completed_at: "2026-08-11T12:10:00.000Z",
      retention_expires_at: "2027-08-11T12:10:00.000Z",
    });
    vi.stubGlobal("fetch", snapshotFetch(snapshot));
    render(
      <WorkAccountabilityBoard
        mode="mine"
        mutationAllowed={false}
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Review renewal record" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Needs review: connection ended/)).toHaveLength(2);
    expect(screen.getByText("Session history (1)").closest("details")).toHaveAttribute(
      "open",
    );
    expect(screen.getByText("Expected 30–45 min · v1")).toBeInTheDocument();
    expect(screen.getByText("10 recorded min")).toBeInTheDocument();
    expect(screen.getByText(/Retained until/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open linked renewal lease/ }),
    ).toHaveAttribute("href", "/lease-renewal/live/desk/lease/lease-1");
  });

  it("shows the exact own and team empty states", async () => {
    vi.stubGlobal("fetch", snapshotFetch(emptySnapshot()));
    const { rerender } = render(
      <WorkAccountabilityBoard
        mode="mine"
        mutationAllowed={false}
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );
    expect(await screen.findByText("No tasks assigned")).toBeInTheDocument();

    rerender(
      <WorkAccountabilityBoard
        mode="team"
        mutationAllowed={false}
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );
    expect(
      await screen.findByText("No team tasks match these filters"),
    ).toBeInTheDocument();
  });

  it("keeps reassigned session context visible without leaving task controls active", async () => {
    const snapshot = snapshotWithCurrentSession();
    snapshot.editable_task_ids = [];
    vi.stubGlobal("fetch", snapshotFetch(snapshot));
    render(
      <WorkAccountabilityBoard
        mode="mine"
        mutationAllowed
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );
    expect(await screen.findByText(/Historical task context/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume work" })).not.toBeInTheDocument();
    expect(screen.getByText("Correct session")).toBeInTheDocument();
  });

  it("filters Team work by staff and state without hiding the factual totals contract", async () => {
    const snapshot = snapshotWithCurrentSession();
    snapshot.current_session = undefined;
    snapshot.tasks.push(
      taskRecord({
        id: "task-2",
        title: "Prepare follow-up",
        state: "Completed",
        assignee_uid: "editor-2",
      }),
    );
    snapshot.editable_task_ids.push("task-2");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          snapshot,
          roster: [
            { uid: "editor-1", email: "editor-1@pmikcmetro.com", role: "Editor" },
            { uid: "editor-2", email: "editor-2@pmikcmetro.com", role: "Editor" },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    render(
      <WorkAccountabilityBoard
        mode="team"
        mutationAllowed={false}
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );
    await screen.findByRole("heading", { name: "Review renewal record" });
    const filterPanel = screen
      .getByRole("heading", { name: "Filter team records" })
      .closest("section")!;
    await user.selectOptions(within(filterPanel).getByLabelText("Staff"), "editor-2");

    expect(
      screen.queryByRole("heading", { name: "Review renewal record" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Prepare follow-up" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Factual work totals")).toHaveTextContent("Completed");
  });

  it("preserves create-task input after a failed mutation and gives a refresh warning", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { action: string };
        if (body.action === "reconcile") return jsonResponse({ session: null });
        return jsonResponse({ error: "Task version changed." }, 409);
      }
      return jsonResponse({ snapshot: emptySnapshot() });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <WorkAccountabilityBoard
        mode="mine"
        mutationAllowed
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );
    await screen.findByText("No tasks assigned");
    await user.click(screen.getByText("Create my task"));
    await user.type(screen.getByLabelText("Task type"), "review");
    await user.type(screen.getByLabelText("Title"), "Preserved task title");
    await user.type(screen.getByLabelText("Next action"), "Open the workspace");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Refresh to confirm server state",
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Preserved task title");
  });

  it("announces a task switch and restores focus to the newly started task", async () => {
    const first = taskRecord({ state: "In progress", record_version: 2 });
    const second = taskRecord({
      id: "task-2",
      title: "Prepare follow-up",
      state: "Paused",
      record_version: 3,
    });
    const active: WorkAccountabilitySnapshot["sessions"][number] = {
      id: "active-session",
      task_id: first.id,
      original_task_id: first.id,
      staff_uid: "editor-1",
      state: "Active",
      original_start_at: "2026-08-11T12:15:00.000Z",
      last_acknowledged_activity_at: "2026-08-11T12:20:00.000Z",
      effective_start_at: "2026-08-11T12:15:00.000Z",
      effective_minutes: 0,
      correction_state: "none",
      idempotency_key: "hash",
      record_version: 1,
      created_at: "2026-08-11T12:15:00.000Z",
      updated_at: "2026-08-11T12:20:00.000Z",
      retention_policy_version: WORK_RETENTION_POLICY_VERSION,
      legal_hold: false,
    };
    const snapshot: WorkAccountabilitySnapshot = {
      ...emptySnapshot(),
      tasks: [first, second],
      editable_task_ids: [first.id, second.id],
      sessions: [active],
      current_session: active,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as { action?: string })
        : undefined;
      if (body?.action === "start_session") {
        return jsonResponse({ session: { ...active, task_id: second.id } });
      }
      return jsonResponse({ snapshot });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const user = userEvent.setup();
    render(
      <WorkAccountabilityBoard
        mode="mine"
        mutationAllowed
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );
    await screen.findByRole("heading", { name: "Prepare follow-up" });
    await user.click(screen.getByRole("button", { name: "Resume work" }));

    expect(
      await screen.findByText("Paused Review renewal record; started Prepare follow-up."),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById("work-task-task-2"));
  });
});

function snapshotFetch(snapshot: WorkAccountabilitySnapshot) {
  return vi.fn(async () => jsonResponse({ snapshot }));
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptySnapshot(): WorkAccountabilitySnapshot {
  return {
    tasks: [],
    editable_task_ids: [],
    sessions: [],
    expectations: [],
    mappings: [],
    server_now: "2026-08-11T12:20:00.000Z",
    record_limit: 500,
    may_be_truncated: false,
  };
}

function snapshotWithCurrentSession(): WorkAccountabilitySnapshot {
  const task = taskRecord();
  return {
    tasks: [task],
    editable_task_ids: [task.id],
    sessions: [
      {
        id: "session-1",
        task_id: task.id,
        original_task_id: task.id,
        staff_uid: "editor-1",
        state: "Ended",
        original_start_at: "2026-08-11T12:00:00.000Z",
        original_end_at: "2026-08-11T12:10:00.000Z",
        end_reason: "disconnect_review",
        last_acknowledged_activity_at: "2026-08-11T11:55:00.000Z",
        effective_start_at: "2026-08-11T12:00:00.000Z",
        effective_end_at: "2026-08-11T12:10:00.000Z",
        effective_minutes: 10,
        correction_state: "needs_review",
        idempotency_key: "hash",
        record_version: 2,
        created_at: "2026-08-11T12:00:00.000Z",
        updated_at: "2026-08-11T12:10:00.000Z",
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        retention_expires_at: "2027-08-11T12:10:00.000Z",
        legal_hold: false,
      },
    ],
    current_session: undefined,
    expectations: [],
    mappings: [],
    server_now: "2026-08-11T12:20:00.000Z",
    record_limit: 500,
    may_be_truncated: false,
  };
}

function taskRecord(overrides: Partial<WorkTaskRecord> = {}): WorkTaskRecord {
  return {
    id: "task-1",
    space_id: "lease-renewals",
    source: {
      type: "renewal_lease",
      id: "lease-1",
      link: "/lease-renewal/live/desk/lease/lease-1",
      version: "source-v1",
      status: "verified",
    },
    task_type: "review",
    title: "Review renewal record",
    assignee_uid: "editor-1",
    creator_uid: "admin-1",
    assigner_uid: "admin-1",
    state: "Paused",
    next_action: "Open the renewal workspace",
    expectation_snapshot: {
      expectation_id: "expect-1",
      expectation_key: "lease-renewals:review",
      version: 1,
      minimum_minutes: 30,
      maximum_minutes: 45,
      effective_at: "2026-08-01T12:00:00.000Z",
    },
    created_at: "2026-08-11T11:00:00.000Z",
    updated_at: "2026-08-11T12:10:00.000Z",
    record_version: 3,
    retention_policy_version: WORK_RETENTION_POLICY_VERSION,
    legal_hold: false,
    ...overrides,
  };
}
