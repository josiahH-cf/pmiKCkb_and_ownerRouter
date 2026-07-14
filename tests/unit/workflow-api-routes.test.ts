import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GET as GET_DEFINITIONS,
  POST as POST_DEFINITION,
} from "@/app/api/process-definitions/route";
import {
  GET as GET_DEFINITION,
  PATCH as PATCH_DEFINITION,
} from "@/app/api/process-definitions/[definitionId]/route";
import { POST as POST_ACTIVATE } from "@/app/api/process-definitions/[definitionId]/activate/route";
import { POST as POST_SUBMIT } from "@/app/api/process-definitions/[definitionId]/submit/route";
import { POST as POST_TEST_RUN } from "@/app/api/process-definitions/[definitionId]/test-runs/route";
import {
  GET as GET_RUN,
  PATCH as PATCH_RUN,
} from "@/app/api/workflow-runs/[runId]/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  activateProcessDefinition,
  createProcessDefinition,
  getProcessDefinition,
  getWorkflowRun,
  listProcessDefinitions,
  listWorkflowRunTimeline,
  listWorkflowRuns,
  startWorkflowTestRun,
  submitProcessDefinitionForApproval,
  updateProcessDefinition,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";
import type {
  ProcessDefinitionRecord,
  WorkflowRunRecord,
  WorkflowRunTimelineRecord,
} from "@/lib/firestore/types";

vi.mock("@/lib/firestore/workflows", () => ({
  activateProcessDefinition: vi.fn(),
  createProcessDefinition: vi.fn(),
  getProcessDefinition: vi.fn(),
  getWorkflowRun: vi.fn(),
  listProcessDefinitions: vi.fn(),
  listWorkflowRunTimeline: vi.fn(),
  listWorkflowRuns: vi.fn(),
  startWorkflowTestRun: vi.fn(),
  submitProcessDefinitionForApproval: vi.fn(),
  updateProcessDefinition: vi.fn(),
  updateWorkflowRunOutcome: vi.fn(),
}));

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(activateProcessDefinition).mockReset();
  vi.mocked(createProcessDefinition).mockReset();
  vi.mocked(getProcessDefinition).mockReset();
  vi.mocked(getWorkflowRun).mockReset();
  vi.mocked(listProcessDefinitions).mockReset();
  vi.mocked(listWorkflowRunTimeline).mockReset();
  vi.mocked(listWorkflowRuns).mockReset();
  vi.mocked(startWorkflowTestRun).mockReset();
  vi.mocked(submitProcessDefinitionForApproval).mockReset();
  vi.mocked(updateProcessDefinition).mockReset();
  vi.mocked(updateWorkflowRunOutcome).mockReset();
});

describe("workflow API routes", () => {
  it("returns 401 before listing process definitions when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await GET_DEFINITIONS();

    expect(response.status).toBe(401);
    expect(listProcessDefinitions).not.toHaveBeenCalled();
  });

  it("lists and creates process definitions", async () => {
    setEditor();
    vi.mocked(listProcessDefinitions).mockResolvedValue([definition()]);
    vi.mocked(createProcessDefinition).mockResolvedValue(definition({ id: "def-2" }));

    const listResponse = await GET_DEFINITIONS();
    const createResponse = await POST_DEFINITION(jsonRequest(createPayload()));

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      definitions: [{ id: "def-1" }],
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      definition: { id: "def-2" },
    });
    expect(createProcessDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      createPayload(),
    );
  });

  it("rejects invalid create payloads before repository work", async () => {
    setEditor();

    const response = await POST_DEFINITION(jsonRequest({ name: "" }));

    expect(response.status).toBe(400);
    expect(createProcessDefinition).not.toHaveBeenCalled();
  });

  it("returns one process definition with its workflow runs and saves edits", async () => {
    setEditor();
    vi.mocked(getProcessDefinition).mockResolvedValue(definition());
    vi.mocked(listWorkflowRuns).mockResolvedValue([workflowRun()]);
    vi.mocked(updateProcessDefinition).mockResolvedValue(
      definition({ short_outcome: "Updated outcome." }),
    );

    const getResponse = await GET_DEFINITION(
      new Request("http://localhost/api/process-definitions/def-1"),
      definitionContext("def-1"),
    );
    const patchResponse = await PATCH_DEFINITION(
      jsonRequest({ short_outcome: "Updated outcome." }),
      definitionContext("def-1"),
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      definition: { id: "def-1" },
      runs: [{ id: "run-1" }],
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      definition: { short_outcome: "Updated outcome." },
    });
    expect(updateProcessDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "def-1",
      { short_outcome: "Updated outcome." },
    );
  });

  it("retires approval submission while preserving legacy activation and test routes", async () => {
    setAdmin();
    vi.mocked(submitProcessDefinitionForApproval).mockResolvedValue(
      definition({ status: "Pending Approval" }),
    );
    vi.mocked(activateProcessDefinition).mockResolvedValue(
      definition({ status: "Active" }),
    );
    vi.mocked(startWorkflowTestRun).mockResolvedValue(workflowRun());
    vi.mocked(listWorkflowRuns).mockResolvedValue([]);

    const submitResponse = await POST_SUBMIT(
      jsonRequest({ note: "Ready." }),
      definitionContext("def-1"),
    );
    const activateResponse = await POST_ACTIVATE(
      jsonRequest({ override_reason: "Dan approved override." }),
      definitionContext("def-1"),
    );
    const testRunResponse = await POST_TEST_RUN(
      jsonRequest({ due_date: "2026-07-01", note: "Start test." }),
      definitionContext("def-1"),
    );

    expect(submitResponse.status).toBe(409);
    expect(activateResponse.status).toBe(200);
    expect(testRunResponse.status).toBe(201);
    expect(submitProcessDefinitionForApproval).not.toHaveBeenCalled();
    expect(activateProcessDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "def-1",
      { override_reason: "Dan approved override." },
    );
    expect(startWorkflowTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "def-1",
      { due_date: "2026-07-01", note: "Start test." },
    );
  });

  it("blocks non-Admins from activation before repository work", async () => {
    setEditor();

    const response = await POST_ACTIVATE(jsonRequest({}), definitionContext("def-1"));

    expect(response.status).toBe(403);
    expect(activateProcessDefinition).not.toHaveBeenCalled();
  });

  it("returns workflow run detail and updates simulation test outcome", async () => {
    setEditor();
    vi.mocked(getWorkflowRun).mockResolvedValue(workflowRun());
    vi.mocked(listWorkflowRunTimeline).mockResolvedValue([timelineEntry()]);
    vi.mocked(updateWorkflowRunOutcome).mockResolvedValue(
      workflowRun({ status: "Completed" }),
    );

    const getResponse = await GET_RUN(
      new Request("http://localhost/api/workflow-runs/run-1"),
      runContext("run-1"),
    );
    const patchResponse = await PATCH_RUN(
      jsonRequest({ action: "complete_test", notes: "Passed." }),
      runContext("run-1"),
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      run: { id: "run-1" },
      timeline: [{ id: "timeline-1" }],
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      run: { status: "Completed" },
    });
    expect(updateWorkflowRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "run-1",
      { action: "complete_test", notes: "Passed." },
    );
  });

  it("rejects invalid workflow run outcome payloads", async () => {
    setEditor();

    const response = await PATCH_RUN(
      jsonRequest({ action: "fail_test", notes: "" }),
      runContext("run-1"),
    );

    expect(response.status).toBe(400);
    expect(updateWorkflowRunOutcome).not.toHaveBeenCalled();
  });
});

function setAdmin() {
  setAuthResolverForTest(() => ({
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
    uid: "admin-1",
  }));
}

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function createPayload() {
  return {
    action_references: [],
    default_approver_uid: "admin-1",
    name: "Lease Renewal Test Process",
    owner_uid: "editor-1",
    required_starting_inputs: [],
    short_outcome: "Prepare a renewal package.",
    space_id: "lease-renewals",
    source_links: [],
    steps: [{ title: "Gather facts" }],
    success_condition: "Package is ready.",
    trigger: "Manual start.",
  };
}

function definition(
  overrides: Partial<ProcessDefinitionRecord> = {},
): ProcessDefinitionRecord {
  return {
    action_references: [],
    created_at: "2026-06-06T00:00:00.000Z",
    created_by_uid: "editor-1",
    default_approver_uid: "admin-1",
    id: "def-1",
    name: "Lease Renewal Test Process",
    owner_uid: "editor-1",
    required_starting_inputs: [],
    short_outcome: "Prepare a renewal package.",
    source_links: [],
    status: "Draft",
    steps: [{ id: "step-1", title: "Gather facts" }],
    success_condition: "Package is ready.",
    trigger: "Manual start.",
    updated_at: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function workflowRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    created_at: "2026-06-06T00:00:00.000Z",
    definition_id: "def-1",
    due_date: "2026-07-01",
    id: "run-1",
    is_test_run: true,
    next_action: "Gather facts",
    owner_uid: "admin-1",
    process_name: "Lease Renewal Test Process",
    production_metrics_included: false,
    simulation_only: true,
    started_by_uid: "editor-1",
    status: "In Progress",
    updated_at: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function timelineEntry(
  overrides: Partial<WorkflowRunTimelineRecord> = {},
): WorkflowRunTimelineRecord {
  return {
    actor_uid: "editor-1",
    created_at: "2026-06-06T00:00:00.000Z",
    event_type: "started",
    id: "timeline-1",
    new_status: "In Progress",
    run_id: "run-1",
    summary: "Started simulation-only test run.",
    ...overrides,
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/workflows", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function definitionContext(definitionId: string) {
  return { params: Promise.resolve({ definitionId }) };
}

function runContext(runId: string) {
  return { params: Promise.resolve({ runId }) };
}
