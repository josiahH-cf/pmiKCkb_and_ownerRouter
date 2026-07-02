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
import type { ConnectorDef } from "@/lib/connections/connector-catalog";
import type {
  ProcessDefinitionRecord,
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
  /** The latest simulation run, if one has been started. */
  run: WorkflowRunRecord | null;
  stepChecks: readonly WorkflowRunStepCheckRecord[];
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
  canEdit = false,
  domainSlot,
}: Readonly<SpaceDeskProps>) {
  const header = (
    <PageHeader
      actions={<ModeChip>Draft process</ModeChip>}
      subtitle={processCategory}
      title={spaceName}
    />
  );

  if (!definition) {
    return (
      <div className="ui-stack">
        {header}
        <Card title="Process">
          <p className="muted">
            This Space has a process, but its definition has not been seeded yet. Once the
            seed runs it will show its workflow here.
          </p>
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

  const nextAction = run ? run.next_action : "Start a run to begin the checklist.";

  return (
    <div className="ui-stack">
      {header}

      <Card title="Workflow">
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
        initialChecks={stepChecks}
        run={run}
        steps={definition.steps}
      />
    </div>
  );
}
