// SpaceDesk — the reusable per-Space desk (S13 Wave 2 / space-teeth E2a). Generalizes the Renewal
// Desk shape (header → workflow steps → connected tools + status → next action) into one Space-
// agnostic server component, driven by the Space's ProcessDefinitionRecord. Move-In / Move-Out inject
// a domain Card via `domainSlot`; Tenant Notice / Owner Outreach pass none and reuse the shell as-is.
//
// Read-only server component: it renders data the page already loaded (definition + connector presence
// + latest run + its step checks). The only interactive piece is the client SpaceDeskRunPanel.

import type { ReactNode } from "react";
import Link from "next/link";

import {
  Card,
  ModeChip,
  PageHeader,
  StatusDot,
  Stepper,
  type StepDescriptor,
} from "@/components/ui";
import { SpaceDeskRunPanel } from "@/components/desk/SpaceDeskRunPanel";
import { classifyConnector } from "@/lib/connections/connection-status";
import { workflowRunNextAction } from "@/lib/processes/run-next-action";
import { SPACE_CARD_STATE_LABEL } from "@/lib/space-card-state";
import type { ConnectorDef } from "@/lib/connections/connector-catalog";
import type {
  ProcessDefinitionRecord,
  ProcessDefinitionStep,
  WorkflowRunRecord,
  WorkflowRunStepCheckRecord,
} from "@/lib/firestore/types";

export interface SpaceDeskProps {
  spaceId: string;
  spaceName: string;
  processCategory: string;
  /** Null when the Space carries a process id but its definition is not seeded yet (pre-E5). */
  definition: ProcessDefinitionRecord | null;
  definitionId: string;
  /** Connector presence keyed by env-var name (from readConnectorPresence) — never values. */
  presence: Record<string, boolean>;
  /** The connectors this Space depends on (CONNECTORS filtered by SPACE_CONNECTOR_IDS[spaceId]). */
  connectors: readonly ConnectorDef[];
  /** The latest ordinary workflow run, if one is attached. */
  run: WorkflowRunRecord | null;
  stepChecks: readonly WorkflowRunStepCheckRecord[];
  /**
   * The latest run's own steps, read from the version it is pinned to (the draft for an unpinned
   * run). Null when there is no run or that read failed; the Next Action then keeps the value the
   * run stored at start.
   */
  runSteps?: readonly Pick<ProcessDefinitionStep, "id" | "title">[] | null;
  canEdit?: boolean;
  /** Domain-specific Card (Move-In welcome / Move-Out evidence packet); omitted for the others. */
  domainSlot?: ReactNode;
}

export function SpaceDesk({
  spaceName,
  processCategory,
  definition,
  definitionId,
  presence,
  connectors,
  run,
  stepChecks,
  runSteps = null,
  canEdit = false,
  domainSlot,
}: Readonly<SpaceDeskProps>) {
  // The chip reads the definition's actual status: a published process is not a draft.
  const processChip = !definition
    ? SPACE_CARD_STATE_LABEL["draft-process"]
    : definition.status === "Retired"
      ? SPACE_CARD_STATE_LABEL["retired-process"]
      : definition.status === "Active" && definition.active_version_id
        ? SPACE_CARD_STATE_LABEL["published-process"]
        : SPACE_CARD_STATE_LABEL["draft-process"];
  const header = (
    <PageHeader
      actions={<ModeChip>{processChip}</ModeChip>}
      subtitle={processCategory}
      title={spaceName}
    />
  );

  if (!definition) {
    return (
      <div className="ui-stack">
        {header}
        <Card title="Process">
          <p className="muted">Process definition unavailable.</p>
          <Link className="text-link" href={`/processes/${definitionId}`}>
            View full process →
          </Link>
        </Card>
      </div>
    );
  }

  const checkByStepId = new Map(stepChecks.map((check) => [check.step_id, check]));
  const steps: StepDescriptor[] = definition.steps.map((step) => {
    const status = checkByStepId.get(step.id)?.status;
    return {
      id: step.id,
      label: step.title,
      meta: status && status !== "Unchecked" ? status : undefined,
    };
  });
  // Current = first step not yet resolved (Checked/Skipped); all resolved → past the end.
  const firstOpen = definition.steps.findIndex((step) => {
    const status = checkByStepId.get(step.id)?.status;
    return status !== "Checked" && status !== "Skipped";
  });
  const currentIndex = firstOpen === -1 ? steps.length : firstOpen;

  // The run's Next Action follows its own pinned steps, never a later draft of the process.
  const nextAction = run
    ? workflowRunNextAction(
        run,
        runSteps ? { steps: runSteps, checks: stepChecks } : undefined,
      )
    : "Start a run to begin the checklist.";

  return (
    <div className="ui-stack">
      {header}

      <Card title="Workflow">
        <p className="muted">
          Immutable definition version: {definition.active_version_id ?? "Not published"}
          {run ? ` · This run: ${run.definition_version_id ?? "Not pinned (draft)"}` : ""}
        </p>
        <Stepper currentIndex={currentIndex} steps={steps} />
        <p className="muted">Next: {nextAction}</p>
      </Card>

      <Card title="Connected tools">
        {connectors.length === 0 ? (
          <p className="muted">This Space has no external connector dependency.</p>
        ) : (
          <ul className="ui-rows">
            {connectors.map((connector) => {
              const status = classifyConnector(connector, presence);
              return (
                <li className="ui-spread" key={connector.id}>
                  <StatusDot label={connector.name} status={status.state} />
                  <span className="muted">{status.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {domainSlot}

      <SpaceDeskRunPanel
        canEdit={canEdit}
        definitionId={definitionId}
        definitionRevision={definition.revision}
        initialChecks={stepChecks}
        run={run}
        steps={definition.steps}
      />
    </div>
  );
}
