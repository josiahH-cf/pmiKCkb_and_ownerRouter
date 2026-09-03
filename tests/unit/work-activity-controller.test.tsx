// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkActivityController } from "@/components/work/WorkActivityController";
import {
  WORK_RETENTION_POLICY_VERSION,
  type WorkSessionRecord,
} from "@/lib/work-accountability/types";

const onChanged = vi.fn(async () => undefined);
const onError = vi.fn();

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-11T12:13:00.000Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ session: activeSession() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  onChanged.mockClear();
  onError.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("explicit work activity controller", () => {
  it("shows the accessible 13-minute warning with both explicit outcomes", () => {
    renderController();

    expect(screen.getByRole("alert")).toHaveTextContent("Still working?");
    expect(screen.getByText(/pauses in 2:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause now" })).toBeInTheDocument();
  });

  it("reduces an allowlisted interaction to a session/version heartbeat only", async () => {
    renderController();
    fireEvent.keyDown(document, { key: "Never persisted typed value" });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      action: "heartbeat",
      session_id: "session-1",
      expected_version: 1,
    });
    expect(String(request.body)).not.toContain("Never persisted typed value");
  });

  it("does not let generic activity swallow the explicit pause action", async () => {
    const user = userEvent.setup();
    renderController();

    await user.click(screen.getByRole("button", { name: "Pause now" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      action: "transition_task",
      task_id: "task-1",
      expected_version: 2,
      next_state: "Paused",
    });
    expect(body.action).not.toBe("heartbeat");
  });

  it("queues pause behind an already pending heartbeat instead of dropping it", async () => {
    let resolveHeartbeat!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveHeartbeat = resolve;
          }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: activeSession() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderController();

    fireEvent.keyDown(document, { key: "ArrowDown" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Pause now" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveHeartbeat(
      new Response(JSON.stringify({ session: activeSession() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(secondRequest.body))).toMatchObject({
      action: "transition_task",
      task_id: "task-1",
      expected_version: 2,
      next_state: "Paused",
    });
  });

  it("sends no activity heartbeat while the document is hidden", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    renderController();
    fireEvent.pointerDown(document, { clientX: 123, clientY: 456 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not treat browser scroll restoration as user activity", () => {
    renderController();

    fireEvent.scroll(document);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not turn reaching the 15-minute cutoff into an automatic write", () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-08-11T12:15:00.000Z"));
    renderController("2026-08-11T12:15:00.000Z");

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reconcile session" })).toBeVisible();
  });

  it("waits for an explicit reconciliation action at cutoff", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-08-11T12:15:00.000Z"));
    const user = userEvent.setup();
    renderController("2026-08-11T12:15:00.000Z");

    expect(fetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reconcile session" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      action: "reconcile",
    });
  });

  it("attaches no activity collection in a read-only environment", () => {
    renderController("2026-08-11T12:13:00.000Z", false);
    fireEvent.scroll(document);
    fireEvent.touchStart(document);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("read-only");
  });
});

function renderController(
  serverNow = "2026-08-11T12:13:00.000Z",
  mutationAllowed = true,
) {
  return render(
    <WorkActivityController
      session={activeSession()}
      taskId="task-1"
      taskVersion={2}
      serverNow={serverNow}
      mutationAllowed={mutationAllowed}
      onChanged={onChanged}
      onError={onError}
    />,
  );
}

function activeSession(): WorkSessionRecord {
  return {
    id: "session-1",
    task_id: "task-1",
    original_task_id: "task-1",
    staff_uid: "editor-1",
    state: "Active",
    original_start_at: "2026-08-11T12:00:00.000Z",
    last_acknowledged_activity_at: "2026-08-11T12:00:00.000Z",
    effective_start_at: "2026-08-11T12:00:00.000Z",
    effective_minutes: 0,
    correction_state: "none",
    idempotency_key: "hash",
    record_version: 1,
    created_at: "2026-08-11T12:00:00.000Z",
    updated_at: "2026-08-11T12:00:00.000Z",
    retention_policy_version: WORK_RETENTION_POLICY_VERSION,
    legal_hold: false,
  };
}
