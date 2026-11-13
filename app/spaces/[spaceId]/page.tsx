import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { EvidencePacketCard } from "@/components/desk/EvidencePacketCard";
import { NoticeRuleCard } from "@/components/desk/NoticeRuleCard";
import { SpaceDesk } from "@/components/desk/SpaceDesk";
import { WelcomeDraftCard } from "@/components/desk/WelcomeDraftCard";
import { ProcessSummaryPanel } from "@/components/spaces/ProcessSummaryPanel";
import { RenewalProcessGuidance } from "@/components/spaces/RenewalProcessGuidance";
import { SpaceDetailClient } from "@/components/spaces/SpaceDetailClient";
import { TrustedPublicationPanel } from "@/components/spaces/TrustedPublicationPanel";
import { can } from "@/lib/auth/roles";
import { primarySpaceHref, requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";
import { CONNECTORS, type ConnectorDef } from "@/lib/connections/connector-catalog";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { getApprovedTemplate } from "@/lib/firestore/approved-templates";
import {
  listPublishedOperationalPages,
  type OperationalPageHead,
} from "@/lib/firestore/operational-pages";
import {
  getProcessDefinition,
  getWorkflowRunDefinition,
  listWorkflowRuns,
} from "@/lib/firestore/workflows";
import { listStepChecksForRun } from "@/lib/firestore/workflow-run-step-checks";
import type {
  ProcessDefinitionRecord,
  WorkflowRunRecord,
  WorkflowRunStepCheckRecord,
} from "@/lib/firestore/types";
import {
  launchEditableSeedsBySpaceId,
  ownerEmailReadOnlySources,
} from "@/lib/launch/content";
import { buildWelcomeDraft } from "@/lib/move-in/welcome-draft";
import { buildEvidencePacket } from "@/lib/move-out/evidence-packet";
import { isGuidanceOnlySpace } from "@/lib/processes/guidance-only";
import { SPACE_CONNECTOR_IDS } from "@/lib/space-card-state";
import { canAccessLaunchSpace } from "@/lib/space-scope-resources";
import { launchSpaces } from "@/lib/spaces";
import {
  isRetiredMaintenanceWorkflow,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";

/** The domain-specific desk Card(s) for a Space, if any:
 *  Move-In welcome / Move-Out evidence packet; the three Renewals Spaces get the read-only effective
 *  notice-rule card (F2). Renewal values and drafts stay on the Live lease workspace. */
function buildDomainSlot(spaceId: string, welcomeEmailBodyTemplate?: string): ReactNode {
  if (spaceId === "move-in") {
    // F-TMPL-6: render the welcome draft from the Admin-approved store copy when present; the composer
    // falls back to its frozen base copy when nothing is seeded (welcomeEmailBodyTemplate is undefined).
    return (
      <WelcomeDraftCard
        draft={buildWelcomeDraft({}, { emailBodyTemplate: welcomeEmailBodyTemplate })}
      />
    );
  }
  if (spaceId === "move-out-deposit-disposition") {
    return <EvidencePacketCard packet={buildEvidencePacket({ lines: [] })} />;
  }
  if (spaceId === "lease-renewals") {
    return <NoticeRuleCard />;
  }
  if (spaceId === "owner-renewal-outreach") {
    return <NoticeRuleCard />;
  }
  if (spaceId === "tenant-renewal-notice") {
    return <NoticeRuleCard />;
  }
  return null;
}

interface SpaceDetailPageProps {
  params: Promise<{ spaceId: string }>;
  searchParams?: Promise<{ tab?: string; lease?: string }>;
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

  if (!canAccessLaunchSpace(user, space)) {
    redirect(primarySpaceHref());
  }

  const config = readServerConfig();
  const editableSeed = launchEditableSeedsBySpaceId[space.id];

  // F-TMPL-6: resolve the Admin-approved move-in welcome copy from the editable store. A 404 (nothing
  // seeded) resolves to null; a scope denial or read failure is swallowed here so the desk still renders
  // from the composer's frozen base copy instead of erroring.
  let welcomeEmailBodyTemplate: string | undefined;
  if (space.id === "move-in") {
    try {
      const welcomeRecord = await getApprovedTemplate(user, {
        spaceId: "move-in",
        name: "Move-In Welcome Email",
      });
      welcomeEmailBodyTemplate = welcomeRecord?.body;
    } catch {
      welcomeEmailBodyTemplate = undefined;
    }
  }

  // Spaces ⊇ Processes: a Space that carries a process gets a Process sub-tab beside its Overview.
  // The Overview stays the default so the existing content (and smoke coverage) is unchanged.
  const retiredMaintenance = isRetiredMaintenanceWorkflow(
    space.id,
    space.processDefinitionId,
  );
  // S286 R-S286-1: a renewal Space shows its process as guidance on one view. It has no
  // Overview desk, Process tab, run or checklist, and it reads no run.
  const guidanceOnly = isGuidanceOnlySpace(space) && !retiredMaintenance;
  const hasProcess =
    Boolean(space.processDefinitionId) && !retiredMaintenance && !guidanceOnly;
  const requestedTab = (await searchParams)?.tab;
  const activeTab = hasProcess && requestedTab === "process" ? "process" : "overview";

  let processDefinition: ProcessDefinitionRecord | null = null;
  let processRuns: WorkflowRunRecord[] = [];
  let latestRun: WorkflowRunRecord | null = null;
  let deskStepChecks: WorkflowRunStepCheckRecord[] = [];
  let deskRunSteps: ProcessDefinitionRecord["steps"] | null = null;
  let deskPresence: Record<string, boolean> = {};
  let deskConnectors: ConnectorDef[] = [];
  let operationalPages: OperationalPageHead[] = [];
  try {
    operationalPages = await listPublishedOperationalPages(user, space.id);
  } catch {
    operationalPages = [];
  }
  if (guidanceOnly && space.processDefinitionId) {
    // The guidance reads the definition only; a missing or unreadable one shows the desk sentence.
    try {
      processDefinition = await getProcessDefinition(user, space.processDefinitionId);
    } catch {
      processDefinition = null;
    }
  }
  if (hasProcess && space.processDefinitionId) {
    const definitionId = space.processDefinitionId;
    try {
      processDefinition = await getProcessDefinition(user, definitionId);
    } catch {
      processDefinition = null;
    }

    if (activeTab === "process") {
      try {
        processRuns = await listWorkflowRuns(user, {
          definitionId,
          limit: 5,
        });
      } catch {
        processRuns = [];
      }
    } else {
      // Overview desk: connector presence + the latest run and its step checks (bounded reads).
      deskPresence = readConnectorPresence();
      const connectorIds = SPACE_CONNECTOR_IDS[space.id] ?? [];
      deskConnectors = CONNECTORS.filter((connector) =>
        connectorIds.includes(connector.id),
      );
      try {
        const runs = await listWorkflowRuns(user, {
          definitionId,
          limit: 1,
        });
        latestRun = runs[0] ?? null;
      } catch {
        latestRun = null;
      }
      if (latestRun) {
        let checksRead = false;
        try {
          deskStepChecks = await listStepChecksForRun(user, latestRun.id);
          checksRead = true;
        } catch {
          deskStepChecks = [];
        }
        // The Next Action follows the run's own steps from the version it is pinned to, as the
        // Workflow Run page reads them, so a later draft edit cannot change it. Without both
        // reads the card keeps the value the run stored.
        if (checksRead) {
          try {
            deskRunSteps = (await getWorkflowRunDefinition(user, latestRun)).steps;
          } catch {
            deskRunSteps = null;
          }
        }
      }
    }
  }

  const linkedLease = (await searchParams)?.lease;
  const renewalWorkHref =
    typeof linkedLease === "string" && /^[1-9]\d*$/.test(linkedLease)
      ? `/lease-renewal/live/desk/lease/${encodeURIComponent(linkedLease)}`
      : "/lease-renewal/live/desk";
  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/spaces">
          Back to Internal Processes
        </Link>
        <div className="section-heading-row">
          <div>
            <h1 className="section-title">{space.name}</h1>
            <p className="muted">
              {space.processCategory}
              {retiredMaintenance
                ? " - Read-only history"
                : space.readOnly
                  ? " - Read-only"
                  : " - Process space"}
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

        {operationalPages.length > 0 ? (
          <aside className="panel ui-stack-tight" aria-label="Operational pages">
            <h2>Operational pages</h2>
            <ul className="compact-list">
              {operationalPages.map((page) => (
                <li key={page.id}>
                  <Link href={`/spaces/${space.id}/pages/${page.slug}`}>
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        {retiredMaintenance ? (
          <section className="panel">
            <h2>Custom maintenance is retired</h2>
            <p>{MAINTENANCE_RETIREMENT_MESSAGE}</p>
            <p>
              Existing knowledge and publication records retain their original
              permissions.
            </p>
          </section>
        ) : guidanceOnly ? (
          <>
            <RenewalProcessGuidance
              definition={processDefinition}
              definitionId={space.processDefinitionId ?? ""}
              deskHref={renewalWorkHref}
            />
            {buildDomainSlot(space.id)}
          </>
        ) : activeTab === "process" && space.processDefinitionId ? (
          <ProcessSummaryPanel
            definitionId={space.processDefinitionId}
            definition={processDefinition}
            runs={processRuns}
          />
        ) : space.readOnly ? (
          <div className="panel">
            <h2>Workflow communication reference</h2>
            <p className="muted">
              Gmail authorization applies per user, and the app stays scoped to your
              workflows. It reads only deliberately linked renewal threads and keeps no
              copy of their message bodies. Gmail remains the message system of record.
            </p>
            <ul className="compact-list">
              {ownerEmailReadOnlySources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
            <p className="muted">
              Review value-free communication attention in{" "}
              <Link href="/gmail-hub">Workflow Communications</Link>, then open the
              authorized workflow entity for targeted reading or review.
            </p>
          </div>
        ) : hasProcess && space.processDefinitionId ? (
          <SpaceDesk
            canEdit={can(user.role, "edit")}
            connectors={deskConnectors}
            definition={processDefinition}
            definitionId={space.processDefinitionId}
            domainSlot={buildDomainSlot(space.id, welcomeEmailBodyTemplate)}
            presence={deskPresence}
            processCategory={space.processCategory}
            run={latestRun}
            runSteps={deskRunSteps}
            spaceId={space.id}
            spaceName={space.name}
            stepChecks={deskStepChecks}
          />
        ) : editableSeed ? (
          <SpaceDetailClient
            canApprove={can(user.role, "approve")}
            canEdit={can(user.role, "edit")}
            canSoftDelete={can(user.role, "softDelete")}
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
        {!space.readOnly ? (
          <TrustedPublicationPanel canEdit={can(user.role, "edit")} spaceId={space.id} />
        ) : null}
      </section>
    </AppShell>
  );
}
