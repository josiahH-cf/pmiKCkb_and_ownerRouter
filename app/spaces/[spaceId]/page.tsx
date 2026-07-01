import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProcessSummaryPanel } from "@/components/spaces/ProcessSummaryPanel";
import { SpaceDetailClient } from "@/components/spaces/SpaceDetailClient";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";
import { getProcessDefinition, listWorkflowRuns } from "@/lib/firestore/workflows";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";
import {
  launchEditableSeedsBySpaceId,
  ownerEmailReadOnlySources,
} from "@/lib/launch/content";
import { launchSpaces } from "@/lib/spaces";

interface SpaceDetailPageProps {
  params: Promise<{ spaceId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}

export default async function SpaceDetailPage({
  params,
  searchParams,
}: SpaceDetailPageProps) {
  const user = await requirePageCapability("read");
  const { spaceId } = await params;
  const space = launchSpaces.find((candidate) => candidate.id === spaceId);

  if (!space) {
    notFound();
  }

  const config = readServerConfig();
  const editableSeed = launchEditableSeedsBySpaceId[space.id];

  // Spaces ⊇ Processes: a Space that carries a process gets a Process sub-tab beside its Overview.
  // The Overview stays the default so the existing content (and smoke coverage) is unchanged.
  const hasProcess = Boolean(space.processDefinitionId);
  const requestedTab = (await searchParams)?.tab;
  const activeTab = hasProcess && requestedTab === "process" ? "process" : "overview";

  let processDefinition: ProcessDefinitionRecord | null = null;
  let processRuns: WorkflowRunRecord[] = [];
  if (activeTab === "process" && space.processDefinitionId) {
    try {
      processDefinition = await getProcessDefinition(user, space.processDefinitionId);
    } catch {
      processDefinition = null;
    }
    try {
      processRuns = await listWorkflowRuns(user, {
        definitionId: space.processDefinitionId,
        simulationOnly: true,
        limit: 5,
      });
    } catch {
      processRuns = [];
    }
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/spaces">
          Back to Spaces
        </Link>
        <div className="section-heading-row">
          <div>
            <h1 className="section-title">{space.name}</h1>
            <p className="muted">
              {space.processCategory}
              {space.readOnly ? " - Read-only" : " - Process space"}
            </p>
          </div>
          {config.askDemoMode ? <span className="review-pill">Local demo</span> : null}
        </div>

        {hasProcess ? (
          <nav className="subtabs" aria-label="Space views">
            <Link
              className={activeTab === "overview" ? "subtab active" : "subtab"}
              href={`/spaces/${space.id}`}
            >
              Overview
            </Link>
            <Link
              className={activeTab === "process" ? "subtab active" : "subtab"}
              href={`/spaces/${space.id}?tab=process`}
            >
              Process
            </Link>
          </nav>
        ) : null}

        {activeTab === "process" && space.processDefinitionId ? (
          <ProcessSummaryPanel
            definitionId={space.processDefinitionId}
            definition={processDefinition}
            runs={processRuns}
          />
        ) : space.readOnly ? (
          <div className="panel">
            <h2>Read-only Gmail Inbox 0 sources</h2>
            <p className="muted">
              Owner Email is sourced from the Gmail Inbox 0 source package. The KB can
              index and cite those files after read-only retrieval is configured, but it
              must not edit Gmail Inbox 0 sources or live Gmail.
            </p>
            <ul className="compact-list">
              {ownerEmailReadOnlySources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </div>
        ) : editableSeed ? (
          <SpaceDetailClient
            canApprove={can(user.role, "approve")}
            canEdit={can(user.role, "edit")}
            readOnly={space.readOnly}
            seed={editableSeed}
            spaceId={space.id}
            spaceName={space.name}
          />
        ) : (
          <div className="panel">
            <h2>Space scaffold</h2>
            <p className="muted">
              This Space is listed for launch planning. Add approved sources before
              treating its placeholder content as final operating procedure.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
