// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { SpaceDesk } from "@/components/desk/SpaceDesk";
import { CONNECTORS } from "@/lib/connections/connector-catalog";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";
import { buildMoveInProcessTemplate } from "@/lib/move-in/process-template";

afterEach(() => {
  cleanup();
});

const moveInSteps = buildMoveInProcessTemplate({
  ownerUid: "o",
  approverUid: "a",
}).steps.map((step, index) => ({
  id: `step-${index + 1}`,
  title: step.title,
  description: step.description,
}));

function definition(
  overrides: Partial<ProcessDefinitionRecord> = {},
): ProcessDefinitionRecord {
  return {
    id: "move-in",
    name: "Move-In",
    short_outcome: "Track a tenant move-in.",
    trigger: "Manual start.",
    owner_uid: "o",
    default_approver_uid: "a",
    source_links: [],
    required_starting_inputs: [],
    steps: moveInSteps,
    action_references: [],
    success_condition: "Done.",
    status: "Draft",
    created_by_uid: "o",
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: "run-1",
    definition_id: "move-in",
    process_name: "Move-In",
    status: "In Progress",
    owner_uid: "o",
    next_action: "Work the checklist.",
    due_date: "2026-07-10",
    is_test_run: true,
    simulation_only: true,
    production_metrics_included: false,
    started_by_uid: "editor-1",
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

const rentvine = CONNECTORS.find((connector) => connector.id === "rentvine")!;

describe("SpaceDesk", () => {
  it("renders the process steps as workflow rows, including e-sign and certified funds", () => {
    render(
      <SpaceDesk
        connectors={[]}
        definition={definition()}
        definitionId="move-in"
        presence={{}}
        processCategory="Move-In"
        run={null}
        spaceId="move-in"
        spaceName="Move-In"
        stepChecks={[]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Move-In", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("E-signature")).toBeInTheDocument();
    expect(screen.getByText("Certified funds")).toBeInTheDocument();
    expect(screen.getByText("Disable the listing")).toBeInTheDocument();
  });

  it("treats EVERY step as an ordinary checklist step — no hard gate on e-sign or funds", () => {
    render(
      <SpaceDesk
        canEdit
        connectors={[]}
        definition={definition()}
        definitionId="move-in"
        presence={{}}
        processCategory="Move-In"
        run={run()}
        spaceId="move-in"
        spaceName="Move-In"
        stepChecks={[]}
      />,
    );

    // Uniform model: one "Skip" affordance per step, none blocked/disabled by a gate.
    const skipButtons = screen.getAllByRole("button", { name: "Skip" });
    expect(skipButtons).toHaveLength(moveInSteps.length);
    for (const button of skipButtons) {
      expect(button).not.toBeDisabled();
    }
  });

  it("shows a quiet fallback (no Stepper) when the definition is not seeded yet", () => {
    render(
      <SpaceDesk
        connectors={[]}
        definition={null}
        definitionId="move-in"
        presence={{}}
        processCategory="Move-In"
        run={null}
        spaceId="move-in"
        spaceName="Move-In"
        stepChecks={[]}
      />,
    );

    expect(document.body.textContent).toContain("has not been seeded yet");
    expect(screen.queryByText("E-signature")).not.toBeInTheDocument();
  });

  it("shows connector status by display name and never leaks an env var name or a value", () => {
    render(
      <SpaceDesk
        connectors={[rentvine]}
        definition={definition()}
        definitionId="move-in"
        presence={{
          RENTVINE_API_BASE_URL: true,
          RENTVINE_API_KEY: true,
          RENTVINE_API_SECRET: true,
        }}
        processCategory="Move-In"
        run={null}
        spaceId="move-in"
        spaceName="Move-In"
        stepChecks={[]}
      />,
    );

    expect(screen.getByText("RentVine")).toBeInTheDocument();
    // Value-free: presence keys (env var names) are never rendered, and no dollar value is invented.
    expect(document.body.textContent).not.toContain("RENTVINE_API_KEY");
    expect(document.body.textContent).not.toContain("$");
  });
});
