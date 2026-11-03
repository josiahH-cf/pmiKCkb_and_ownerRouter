// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoveOutTimingBasisAdminPanel } from "@/components/admin/MoveOutTimingBasisAdminPanel";
import { DOCUMENTED_NOTICE_TIMING_DECISION } from "@/lib/lease-renewal/notice-timing-decision";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const decisionId = "notice-basis/2026-10-02/q2";
const missing = { state: "missing" as const, record: null };
const record = (operationId: string) => ({
  id: "active",
  target_kind: "lease_end",
  counting_rule: "calendar_days_target_minus_notice_v1",
  threshold_days: 30,
  reviewed_note: DOCUMENTED_NOTICE_TIMING_DECISION.note,
  decision_id: decisionId,
  decision_source: DOCUMENTED_NOTICE_TIMING_DECISION.source,
  operation_id: operationId,
  version: 1,
  created_at: "2026-11-03T12:00:00Z",
  updated_at: "2026-11-03T12:00:00Z",
  updated_by_uid: "staff-one",
});

beforeEach(() => {
  router.refresh.mockReset();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("S125 one-selection interaction (BEH-S125-7/8/9/10)", () => {
  it("keeps a real elapsed PATCH wait uncertain and reuses its UUID until owned readback proves the save", async () => {
    vi.useFakeTimers();
    const bodies: Array<{
      operationId: string;
      decisionId: string;
      expectedVersion: number;
    }> = [];
    let operationId = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          const body = JSON.parse(String(options.body));
          bodies.push(body);
          operationId = body.operationId;
          if (bodies.length === 1) return new Promise<Response>(() => undefined);
          return Response.json({
            timingBasis: { state: "saved", record: record(operationId) },
          });
        }
        return Response.json({
          timingBasis: { state: "saved", record: record(operationId) },
          canSelect: true,
          intent:
            bodies.length === 1
              ? { state: "missing" }
              : {
                  state: "recorded",
                  operationId,
                  decisionId,
                  expectedVersion: 0,
                  record: record(operationId),
                },
        });
      }),
    );
    render(<MoveOutTimingBasisAdminPanel initial={missing} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Documented notice basis" }), {
      target: { value: decisionId },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Selection outcome is uncertain");
    expect(screen.queryByText(/^Saved · version/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Could not record|Selection failed/i),
    ).not.toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry same selection" }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(screen.getByText(/^Saved · version 1/)).toBeInTheDocument();
  });
  it("does not write on opening; one complete choice writes once and only independent owned readback shows Saved", async () => {
    let operationId = "";
    const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        operationId = body.operationId;
        expect(body).toEqual({
          decisionId,
          expectedVersion: 0,
          operationId: expect.any(String),
        });
        return Response.json({
          timingBasis: { state: "saved", record: record(operationId) },
        });
      }
      expect(String(_url)).toContain(operationId);
      return Response.json({
        timingBasis: { state: "saved", record: record(operationId) },
        canSelect: true,
        intent: {
          state: "recorded",
          operationId,
          decisionId,
          expectedVersion: 0,
          record: record(operationId),
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<MoveOutTimingBasisAdminPanel initial={missing} />);
    const select = screen.getByRole("combobox", { name: "Documented notice basis" });
    expect(select).toHaveValue("");
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /save|record reviewed|confirm/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: decisionId } });
    await screen.findByText(/^Saved · version 1/);
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH"),
    ).toHaveLength(1);
    expect(router.refresh).toHaveBeenCalledOnce();
    fireEvent.change(select, { target: { value: decisionId } });
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH"),
    ).toHaveLength(1);
  });

  it("keeps response-loss ambiguity honest, and retry reuses exactly the same intent rather than matching tuple alone", async () => {
    const bodies: unknown[] = [];
    let lastOperation = "";
    const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        bodies.push(body);
        lastOperation = body.operationId;
        if (bodies.length === 1) throw new TypeError("response lost");
        return Response.json({
          timingBasis: { state: "saved", record: record(lastOperation) },
        });
      }
      return Response.json({
        canSelect: true,
        timingBasis: { state: "saved", record: record(lastOperation) },
        intent:
          bodies.length === 1
            ? { state: "missing" }
            : {
                state: "recorded",
                operationId: lastOperation,
                decisionId,
                expectedVersion: 0,
                record: record(lastOperation),
              },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<MoveOutTimingBasisAdminPanel initial={missing} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Documented notice basis" }), {
      target: { value: decisionId },
    });
    const retry = await screen.findByRole("button", { name: "Retry same selection" });
    expect(screen.queryByText(/^Saved · version 1/)).not.toBeInTheDocument();
    expect(retry).toBeEnabled();
    cleanup();
    const priorCalls = bodies.length;
    // A reload inspects the retained UUID, but it never dispatches a save by itself.
    render(<MoveOutTimingBasisAdminPanel initial={missing} />);
    const recoveredRetry = await screen.findByRole("button", {
      name: "Retry same selection",
    });
    expect(bodies).toHaveLength(priorCalls);
    fireEvent.click(recoveredRetry);
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual(bodies[0]);
    await screen.findByText(/^Saved · version 1/);
  });

  it("waits for independent readback and does not treat a successful PATCH body as Saved", async () => {
    let resolveRead!: (value: Response) => void;
    let operationId = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          operationId = JSON.parse(String(options.body)).operationId;
          return Response.json({
            timingBasis: { state: "saved", record: record(operationId) },
          });
        }
        return new Promise<Response>((resolve) => {
          resolveRead = resolve;
        });
      }),
    );
    render(<MoveOutTimingBasisAdminPanel initial={missing} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Documented notice basis" }), {
      target: { value: decisionId },
    });
    await waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    expect(screen.queryByText(/^Saved · version/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saving selection");
    resolveRead(
      Response.json({
        timingBasis: { state: "saved", record: record(operationId) },
        canSelect: true,
        intent: {
          state: "recorded",
          operationId,
          decisionId,
          expectedVersion: 0,
          record: record(operationId),
        },
      }),
    );
    await screen.findByText(/^Saved · version 1/);
  });

  it("shows a competing version as a conflict, with no overwrite or success claim", async () => {
    let patches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          patches++;
          return Response.json({ error: "The shared basis changed." }, { status: 409 });
        }
        return Response.json({
          timingBasis: {
            state: "saved",
            record: { ...record("00000000-0000-4000-8000-000000000099"), version: 2 },
          },
          intent: { state: "missing" },
          canSelect: true,
        });
      }),
    );
    render(<MoveOutTimingBasisAdminPanel initial={missing} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Documented notice basis" }), {
      target: { value: decisionId },
    });
    await screen.findByText("The shared basis changed.");
    expect(screen.queryByText(/^Saved · version/)).not.toBeInTheDocument();
    expect(patches).toBe(1);
    expect(screen.getByRole("button", { name: "Reload current basis" })).toBeEnabled();
  });
});
