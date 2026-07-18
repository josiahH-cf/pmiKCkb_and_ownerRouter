// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessDefinitionDetailClient } from "@/components/workflows/ProcessDefinitionDetailClient";
import { ProcessDefinitionListClient } from "@/components/workflows/ProcessDefinitionListClient";
import { WorkflowRunClient } from "@/components/workflows/WorkflowRunClient";
import type {
  ProcessDefinitionRecord,
  WorkflowRunRecord,
  WorkflowRunStepCheckRecord,
  WorkflowRunTimelineRecord,
} from "@/lib/firestore/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workflow components", () => {
  it("publishes validated process definitions without an approval detour", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/publish")) {
        return jsonResponse({
          definition: definition({
            active_version_id: "version-1",
            status: "Active",
          }),
          publicationVersion: { id: "version-1", versionNumber: 1 },
          runs: [],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProcessDefinitionDetailClient
        canEdit
        canManageAdmin
        initialDefinition={definition()}
        initialRuns={[]}
      />,
    );

    await user.type(screen.getByLabelText("Publication note"), "Ready to publish.");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(
        screen.getByText("Validated process version published and active."),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/process-definitions/def-1/publish",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.queryByText(/Approval Queue/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("marks workflow runs as simulation-only and updates test outcomes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/workflow-runs/run-1");
      expect(JSON.parse(String(init?.body))).toEqual({
        action: "complete_test",
        notes: "All simulated steps passed.",
      });

      return jsonResponse({
        run: workflowRun({
          outcome_notes: "All simulated steps passed.",
          status: "Completed",
        }),
        timeline: [
          timelineEntry(),
          timelineEntry({
            event_type: "completed",
            id: "timeline-2",
            new_status: "Completed",
            summary: "All simulated steps passed.",
          }),
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WorkflowRunClient
        canEdit
        initialChecks={[workflowCheck()]}
        initialRun={workflowRun()}
        initialSteps={definition().steps}
        initialTimeline={[timelineEntry()]}
      />,
    );

    expect(screen.getByText(/Test run only/)).toBeInTheDocument();
    expect(screen.getByText("Not pinned (draft)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Notes"), "All simulated steps passed.");
    await user.click(screen.getByRole("button", { name: "Complete Test" }));

    await waitFor(() =>
      expect(screen.getByText("Test run completed.")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("All simulated steps passed.")).toHaveLength(2);
  });

  it("keeps Test completion disabled until every definition step is checked or skipped", () => {
    render(
      <WorkflowRunClient
        canEdit
        initialChecks={[]}
        initialRun={workflowRun()}
        initialSteps={definition().steps}
        initialTimeline={[timelineEntry()]}
      />,
    );

    expect(screen.getByRole("button", { name: "Complete Test" })).toBeDisabled();
    expect(screen.getByText(/Incomplete: Gather facts/)).toBeInTheDocument();
  });

  it("shows both immutable pins on a publication-continued Test run", () => {
    render(
      <WorkflowRunClient
        canEdit
        initialChecks={[]}
        initialRun={workflowRun({
          definition_version_id: "process-version-1",
          source_publication_pin: {
            data_mode: "test",
            resource_id: "source:audit-test-publication-v1",
            version_id: "publication-version-1",
            test_fixture_key: "audit:trusted-publication:v1",
          },
        })}
        initialSteps={definition().steps}
        initialTimeline={[timelineEntry()]}
      />,
    );

    expect(screen.getByText("process-version-1")).toBeInTheDocument();
    expect(screen.getByText("publication-version-1")).toBeInTheDocument();
    expect(screen.getByText("source:audit-test-publication-v1")).toBeInTheDocument();
    expect(screen.getByText("TEST · never Live evidence")).toBeInTheDocument();
  });

  it("shows a read-only recent simulation-run index", () => {
    render(
      <ProcessDefinitionListClient
        canEdit
        currentUserUid="editor-1"
        initialDefinitions={[definition()]}
        initialRecentRuns={[workflowRun({ id: "run-2", status: "Failed" })]}
      />,
    );

    expect(screen.getByText("Recent test runs")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Lease Renewal Test Process" })
        .some((link) => link.getAttribute("href") === "/workflow-runs/run-2"),
    ).toBe(true);
    expect(screen.getByText("Test run")).toBeInTheDocument();
    expect(
      screen.getByText("Test run. No production metrics or external actions."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("shows a safe empty state when recent simulation runs are unavailable", () => {
    render(
      <ProcessDefinitionListClient
        canEdit={false}
        currentUserUid="editor-1"
        initialDefinitions={[]}
        initialRecentRuns={[]}
        initialRunsError="Recent test runs are unavailable."
      />,
    );

    expect(screen.getByText("Recent test runs are unavailable.")).toBeInTheDocument();
    expect(screen.getByText("No test runs yet.")).toBeInTheDocument();
  });
});

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
    source_links: [{ label: "Workflow notes", url: "https://example.com/source" }],
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

function workflowCheck(): WorkflowRunStepCheckRecord {
  return {
    checked_at: "2026-06-06T00:00:00.000Z",
    checked_by_uid: "editor-1",
    created_at: "2026-06-06T00:00:00.000Z",
    definition_id: "def-1",
    id: "run-1_step-1",
    run_id: "run-1",
    status: "Checked",
    step_id: "step-1",
    step_title: "Gather facts",
    updated_at: "2026-06-06T00:00:00.000Z",
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
