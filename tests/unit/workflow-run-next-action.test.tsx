// @vitest-environment jsdom
// Litmus 2026-11-04 (outside S242–S244): a run stores its first step's title as next_action when
// it starts and never updates it, so a completed run still showed Next Action Gather facts. Every
// surface now derives the Next Action: None for a closed run, otherwise the first open step.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { SpaceDesk } from "@/components/desk/SpaceDesk";
import { ProcessSummaryPanel } from "@/components/spaces/ProcessSummaryPanel";
import { WorkflowRunClient } from "@/components/workflows/WorkflowRunClient";
import type {
  ProcessDefinitionRecord,
  WorkflowRunRecord,
  WorkflowRunStatus,
  WorkflowRunStepCheckRecord,
} from "@/lib/firestore/types";
import { projectProcessRead } from "@/lib/operational-context/projections";
import {
  WORKFLOW_RUN_COMPLETE_NEXT_ACTION,
  WORKFLOW_RUN_NO_NEXT_ACTION,
  workflowRunNextAction,
} from "@/lib/processes/run-next-action";

const STEPS = [
  { id: "step-1", title: "Gather facts" },
  { id: "step-2", title: "Draft owner message" },
  { id: "step-3", title: "Record the answer" },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function definition(): ProcessDefinitionRecord {
  return {
    action_references: [],
    created_at: "2026-11-01T00:00:00.000Z",
    created_by_uid: "editor-1",
    default_approver_uid: "admin-1",
    id: "def-1",
    name: "Owner Renewal Outreach",
    owner_uid: "editor-1",
    required_starting_inputs: [],
    short_outcome: "Reach the owner.",
    source_links: [],
    status: "Active",
    active_version_id: "v-1",
    steps: STEPS,
    success_condition: "Owner answered.",
    trigger: "Manual start.",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

function run(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    created_at: "2026-11-01T00:00:00.000Z",
    definition_id: "def-1",
    definition_version_id: "v-1",
    due_date: "2026-11-10",
    id: "run-1",
    data_mode: "live",
    next_action: "Gather facts",
    owner_uid: "admin-1",
    process_name: "Owner Renewal Outreach",
    started_by_uid: "editor-1",
    status: "In Progress",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function check(
  stepId: string,
  status: WorkflowRunStepCheckRecord["status"],
): WorkflowRunStepCheckRecord {
  return {
    created_at: "2026-11-02T00:00:00.000Z",
    definition_id: "def-1",
    id: `run-1_${stepId}`,
    run_id: "run-1",
    status,
    step_id: stepId,
    step_title: STEPS.find((step) => step.id === stepId)!.title,
    updated_at: "2026-11-02T00:00:00.000Z",
    ...(status === "Skipped" ? { reason: "Not needed." } : {}),
  };
}

const ALL_DONE = [
  check("step-1", "Checked"),
  check("step-2", "Skipped"),
  check("step-3", "Checked"),
];

function nextActionField() {
  const label = screen.getByText("Next Action");
  return label.parentElement!.querySelector("strong")!;
}

describe("workflowRunNextAction", () => {
  it.each<WorkflowRunStatus>(["Completed", "Cancelled", "Failed"])(
    "a %s run has no next action, whatever it stored at start",
    (status) => {
      expect(workflowRunNextAction(run({ status }), { steps: STEPS, checks: [] })).toBe(
        WORKFLOW_RUN_NO_NEXT_ACTION,
      );
      expect(workflowRunNextAction(run({ status }))).toBe("None");
    },
  );

  it("an open run names its first step that is not Checked or Skipped", () => {
    expect(workflowRunNextAction(run(), { steps: STEPS, checks: [] })).toBe(
      "Gather facts",
    );
    expect(
      workflowRunNextAction(run(), {
        steps: STEPS,
        checks: [check("step-1", "Checked"), check("step-2", "Unchecked")],
      }),
    ).toBe("Draft owner message");
    expect(
      workflowRunNextAction(run(), {
        steps: STEPS,
        checks: [check("step-1", "Skipped"), check("step-2", "Checked")],
      }),
    ).toBe("Record the answer");
  });

  it("an open run with every step resolved asks for the run to be completed", () => {
    expect(workflowRunNextAction(run(), { steps: STEPS, checks: ALL_DONE })).toBe(
      WORKFLOW_RUN_COMPLETE_NEXT_ACTION,
    );
  });

  it("an open run without its checklist keeps its stored value", () => {
    expect(workflowRunNextAction(run({ next_action: "Review workflow run." }))).toBe(
      "Review workflow run.",
    );
    expect(
      workflowRunNextAction(run({ next_action: "Gather facts" }), {
        steps: [],
        checks: [],
      }),
    ).toBe("Gather facts");
  });
});

describe("Workflow Run page", () => {
  it("a completed run shows Next Action None, not the first step it stored at start", () => {
    render(
      <WorkflowRunClient
        canEdit
        initialChecks={ALL_DONE}
        initialRun={run({ status: "Completed", outcome_notes: "Owner answered." })}
        initialSteps={STEPS}
        initialTimeline={[]}
      />,
    );
    expect(nextActionField()).toHaveTextContent(/^None$/);
    expect(nextActionField()).not.toHaveTextContent("Gather facts");
  });

  it("an open run follows its checklist", () => {
    render(
      <WorkflowRunClient
        canEdit
        initialChecks={[check("step-1", "Checked")]}
        initialRun={run()}
        initialSteps={STEPS}
        initialTimeline={[]}
      />,
    );
    expect(nextActionField()).toHaveTextContent(/^Draft owner message$/);
  });

  it("Complete run turns the Next Action to None", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ run: run({ status: "Completed" }), timeline: [] }),
      ),
    );
    render(
      <WorkflowRunClient
        canEdit
        initialChecks={ALL_DONE}
        initialRun={run()}
        initialSteps={STEPS}
        initialTimeline={[]}
      />,
    );
    expect(nextActionField()).toHaveTextContent(/^Complete the run$/);
    await user.click(screen.getByRole("button", { name: "Complete run" }));
    await waitFor(() => expect(nextActionField()).toHaveTextContent(/^None$/));
  });
});

describe("Space and process summaries", () => {
  it("the Space Workflow card names the first open step and None once the run closes", () => {
    const props = {
      connectors: [],
      definition: definition(),
      definitionId: "def-1",
      presence: {},
      processCategory: "Owner outreach",
      runSteps: STEPS,
      spaceId: "owner-renewal-outreach",
      spaceName: "Owner Renewal Outreach",
    };
    const { unmount } = render(
      <SpaceDesk {...props} run={run()} stepChecks={[check("step-1", "Checked")]} />,
    );
    expect(screen.getByText("Next: Draft owner message")).toBeInTheDocument();
    unmount();
    render(
      <SpaceDesk {...props} run={run({ status: "Completed" })} stepChecks={ALL_DONE} />,
    );
    expect(screen.getByText("Next: None")).toBeInTheDocument();
    expect(screen.queryByText("Next: Gather facts")).toBeNull();
  });

  // PR #182 review: a draft edited after the run started must not choose the run's Next Action.
  it("the Space Workflow card follows the run's pinned steps, not a later draft", () => {
    const draft: ProcessDefinitionRecord = {
      ...definition(),
      steps: [
        { id: "step-new", title: "A step added to the draft later" },
        { id: "step-1", title: "Gather facts" },
      ],
    };
    const props = {
      connectors: [],
      definition: draft,
      definitionId: "def-1",
      presence: {},
      processCategory: "Owner outreach",
      spaceId: "owner-renewal-outreach",
      spaceName: "Owner Renewal Outreach",
    };
    const { unmount } = render(
      <SpaceDesk
        {...props}
        run={run()}
        runSteps={STEPS}
        stepChecks={[check("step-1", "Checked")]}
      />,
    );
    expect(screen.getByText("Next: Draft owner message")).toBeInTheDocument();
    expect(screen.queryByText("Next: A step added to the draft later")).toBeNull();
    unmount();
    // Every pinned step resolved: the draft's extra step does not hold the run open.
    const { unmount: unmountDone } = render(
      <SpaceDesk {...props} run={run()} runSteps={STEPS} stepChecks={ALL_DONE} />,
    );
    expect(
      screen.getByText(`Next: ${WORKFLOW_RUN_COMPLETE_NEXT_ACTION}`),
    ).toBeInTheDocument();
    unmountDone();
    // Without the pinned steps the card keeps the value the run stored, never the draft's.
    const { unmount: unmountUnread } = render(
      <SpaceDesk
        {...props}
        run={run()}
        runSteps={null}
        stepChecks={[check("step-1", "Checked")]}
      />,
    );
    expect(screen.getByText("Next: Gather facts")).toBeInTheDocument();
    unmountUnread();
    render(
      <SpaceDesk
        {...props}
        run={run({ status: "Completed" })}
        runSteps={null}
        stepChecks={ALL_DONE}
      />,
    );
    expect(screen.getByText("Next: None")).toBeInTheDocument();
  });

  it("the Space process summary lists a completed run with no next action", () => {
    render(
      <ProcessSummaryPanel
        definition={definition()}
        definitionId="def-1"
        runs={[run({ status: "Completed" }), run({ id: "run-2" })]}
      />,
    );
    const runs = screen.getByRole("heading", { name: "Recent runs" })
      .nextElementSibling as HTMLElement;
    const rows = within(runs).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/^Completed: None · Definition version: v-1$/);
    expect(rows[1]).toHaveTextContent(
      /^In Progress: Gather facts · Definition version: v-1$/,
    );
  });

  it("the shared operational context names no next action for a closed run", () => {
    const read = projectProcessRead({
      definitions: [],
      runs: [run({ status: "Completed" }), run({ id: "run-2" })],
      runsFailed: false,
      asOf: "2026-11-05T12:00:00.000Z",
    });
    const details = read.records.map((record) => record.detail);
    expect(details[0]).toBe("Run · Completed · due 11/10/2026");
    expect(details[1]).toBe("Run · In Progress · Next: Gather facts · due 11/10/2026");
  });
});
