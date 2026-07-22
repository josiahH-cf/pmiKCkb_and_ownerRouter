import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { EvidencePacketCard } from "@/components/desk/EvidencePacketCard";
import { NoticeRuleCard } from "@/components/desk/NoticeRuleCard";
import {
  OwnerRenewalDraftPreviewCard,
  TenantRenewalDraftPreviewCard,
} from "@/components/desk/RenewalDraftPreviewCard";
import { SpaceDesk } from "@/components/desk/SpaceDesk";
import { WelcomeDraftCard } from "@/components/desk/WelcomeDraftCard";
import { ProcessSummaryPanel } from "@/components/spaces/ProcessSummaryPanel";
import { SpaceDetailClient } from "@/components/spaces/SpaceDetailClient";
import { TrustedPublicationPanel } from "@/components/spaces/TrustedPublicationPanel";
import { TrustedPublicationTestFixturePanel } from "@/components/spaces/TrustedPublicationTestFixturePanel";
import { TestOperationalHandoffPanel } from "@/components/operations/TestOperationalHandoffPanel";
import { can } from "@/lib/auth/roles";
import { primarySpaceHref, requirePageCapability } from "@/lib/auth/page-guards";
import { hasSpaceAccess } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { CONNECTORS, type ConnectorDef } from "@/lib/connections/connector-catalog";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { getApprovedTemplate } from "@/lib/firestore/approved-templates";
import { getProcessDefinition, listWorkflowRuns } from "@/lib/firestore/workflows";
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
import { getRenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";
import { SPACE_CONNECTOR_IDS } from "@/lib/space-card-state";
import { launchSpaces } from "@/lib/spaces";
import { loadTestOperationalHandoffs } from "@/lib/operations/test-handoff-loader";

/** The domain-specific desk Card(s) for a Space, if any:
 *  Move-In welcome / Move-Out evidence packet; the three Renewals Spaces get the read-only effective
 *  notice-rule card (F2) and, for the outreach/notice Spaces, a sample renewal draft (F3). */
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
    const sample = getRenewalLeaseWorkspace("lease-318-cedar-7");
    return (
      <>
        <NoticeRuleCard />
        {sample ? <OwnerRenewalDraftPreviewCard draft={sample.ownerDraft} /> : null}
      </>
    );
  }
  if (spaceId === "tenant-renewal-notice") {
    const sample = getRenewalLeaseWorkspace("lease-318-cedar-7");
    return (
      <>
        <NoticeRuleCard />
        {sample?.tenantDraft ? (
          <TenantRenewalDraftPreviewCard draft={sample.tenantDraft} />
        ) : null}
      </>
    );
  }
  return null;
}

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

  if (
    user.scopes !== undefined &&
    (space.scope === undefined || !hasSpaceAccess(user, space.scope))
  ) {
    redirect(primarySpaceHref(user));
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
  const hasProcess = Boolean(space.processDefinitionId);
  const requestedTab = (await searchParams)?.tab;
  const activeTab = hasProcess && requestedTab === "process" ? "process" : "overview";

  let processDefinition: ProcessDefinitionRecord | null = null;
  let processRuns: WorkflowRunRecord[] = [];
  let latestRun: WorkflowRunRecord | null = null;
  let deskStepChecks: WorkflowRunStepCheckRecord[] = [];
  let deskPresence: Record<string, boolean> = {};
  let deskConnectors: ConnectorDef[] = [];
  const testHandoffs = await loadTestOperationalHandoffs(user, {
    lease: space.id === "lease-renewals",
    maintenance: space.id === "maintenance-work-order-intake",
    limitPerKind: 5,
  });

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
          simulationOnly: true,
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
          simulationOnly: true,
          limit: 1,
        });
        latestRun = runs[0] ?? null;
      } catch {
        latestRun = null;
      }
      if (latestRun) {
        try {
          deskStepChecks = await listStepChecksForRun(user, latestRun.id);
        } catch {
          deskStepChecks = [];
        }
      }
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
            <h2>Workflow communication reference</h2>
            <p className="muted">
              Gmail authorization applies per user, and the app stays scoped to your
              workflows. It reads only deliberately linked renewal or maintenance threads
              and stores only bodyless workflow/audit metadata. Gmail remains the message
              system of record.
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
        {testHandoffs.length > 0 ||
        space.id === "lease-renewals" ||
        space.id === "maintenance-work-order-intake" ? (
          <TestOperationalHandoffPanel
            handoffs={testHandoffs}
            title={`${space.name} Test owning-record handoffs`}
          />
        ) : null}
        {!space.readOnly ? (
          <>
            <TrustedPublicationPanel
              canEdit={can(user.role, "edit")}
              spaceId={space.id}
            />
            {space.id === "lease-renewals" && can(user.role, "manageAdmin") ? (
              <TrustedPublicationTestFixturePanel spaceId={space.id} />
            ) : null}
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
