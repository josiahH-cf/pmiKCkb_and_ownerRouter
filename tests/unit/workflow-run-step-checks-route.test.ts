import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GET as GET_STEP_CHECKS,
  POST as POST_STEP_CHECK,
} from "@/app/api/workflow-runs/[runId]/step-checks/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  listStepChecksForRun,
  setWorkflowRunStepCheck,
} from "@/lib/firestore/workflow-run-step-checks";
import { getWorkflowRun } from "@/lib/firestore/workflows";
import type {
  WorkflowRunRecord,
  WorkflowRunStepCheckRecord,
} from "@/lib/firestore/types";

// Preserve the real Zod schema (the route omits `run_id` from it at module load); mock only the
// service functions so we can assert the path→run_id wiring and the capability gate.
vi.mock("@/lib/firestore/workflow-run-step-checks", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/workflow-run-step-checks")>();
  return {
    ...actual,
    setWorkflowRunStepCheck: vi.fn(),
    listStepChecksForRun: vi.fn(),
  };
});

// The route resolves the run and enforces the S16 space scope before touching step checks; mock the
// run lookup so it does not fan out to Firestore (an unmocked call hangs the route to a timeout).
vi.mock("@/lib/firestore/workflows", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/firestore/workflows")>();
  return {
    ...actual,
    getWorkflowRun: vi.fn(),
  };
});

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(setWorkflowRunStepCheck).mockReset();
  vi.mocked(listStepChecksForRun).mockReset();
  vi.mocked(getWorkflowRun).mockReset();
});

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function check(
  overrides: Partial<WorkflowRunStepCheckRecord> = {},
): WorkflowRunStepCheckRecord {
  return {
    id: "run-1:step-1",
    run_id: "run-1",
    definition_id: "move-in",
    step_id: "step-1",
    step_title: "Intake form / tenant info",
    status: "Checked",
    checked_by_uid: "editor-1",
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function workflowRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return { definition_id: "move-in", ...overrides } as WorkflowRunRecord;
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/workflow-runs/run-1/step-checks", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function runContext(runId: string) {
  return { params: Promise.resolve({ runId }) };
}

describe("workflow-run step-checks API route", () => {
  it("returns 401 before any write when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST_STEP_CHECK(
      jsonRequest({ step_id: "step-1", status: "Checked" }),
      runContext("run-1"),
    );

    expect(response.status).toBe(401);
    expect(setWorkflowRunStepCheck).not.toHaveBeenCalled();
  });

  it("returns 401 before listing when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await GET_STEP_CHECKS(
      new Request("http://localhost/api/workflow-runs/run-1/step-checks"),
      runContext("run-1"),
    );

    expect(response.status).toBe(401);
    expect(listStepChecksForRun).not.toHaveBeenCalled();
  });

  it("sets a step check, wiring run_id from the path into the service call", async () => {
    setEditor();
    vi.mocked(getWorkflowRun).mockResolvedValue(workflowRun());
    vi.mocked(setWorkflowRunStepCheck).mockResolvedValue(check());

    const response = await POST_STEP_CHECK(
      jsonRequest({ step_id: "step-1", status: "Checked" }),
      runContext("run-1"),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      check: { id: "run-1:step-1", status: "Checked" },
    });
    expect(setWorkflowRunStepCheck).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      { step_id: "step-1", status: "Checked", run_id: "run-1" },
    );
  });

  it("rejects an invalid body (missing status) before repository work", async () => {
    setEditor();

    const response = await POST_STEP_CHECK(
      jsonRequest({ step_id: "step-1" }),
      runContext("run-1"),
    );

    expect(response.status).toBe(400);
    expect(setWorkflowRunStepCheck).not.toHaveBeenCalled();
  });

  it("lists step checks for the run", async () => {
    setEditor();
    vi.mocked(getWorkflowRun).mockResolvedValue(workflowRun());
    vi.mocked(listStepChecksForRun).mockResolvedValue([check()]);

    const response = await GET_STEP_CHECKS(
      new Request("http://localhost/api/workflow-runs/run-1/step-checks"),
      runContext("run-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checks: [{ id: "run-1:step-1" }],
    });
    expect(listStepChecksForRun).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "run-1",
    );
  });

  it("denies a scoped maintenance sub-user a run outside its scope (403, no write)", async () => {
    setAuthResolverForTest(() => ({
      email: "maint@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
      uid: "maint-1",
    }));
    vi.mocked(getWorkflowRun).mockResolvedValue(
      workflowRun({ definition_id: "move-in" }),
    );

    const response = await POST_STEP_CHECK(
      jsonRequest({ step_id: "step-1", status: "Checked" }),
      runContext("run-1"),
    );

    expect(response.status).toBe(403);
    expect(setWorkflowRunStepCheck).not.toHaveBeenCalled();
  });
});
