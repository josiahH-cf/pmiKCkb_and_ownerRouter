// The per-lease Renewal Workspace. S82: a clickable six-phase rail, one `Do this next` card, and
// one selected phase replace the always-on operational evidence engine. The process projection —
// not a click — still determines progress; selecting a phase never verifies, advances, or writes.
// Server component; the tenant-channel switch uses the client Tabs primitive.

import Link from "next/link";
import type { ReactNode } from "react";

import {
  Card,
  Disclosure,
  EmptyState,
  ModeChip,
  PageHeader,
  SourceTag,
  StatusPill,
  Tabs,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import { RenewalTenantOutcomeControl } from "@/components/lease-renewal/RenewalTenantOutcomeControl";
import { RenewalFollowUpStatus } from "@/components/lease-renewal/RenewalFollowUpStatus";
import { RenewalFollowUpThreadControl } from "@/components/lease-renewal/RenewalFollowUpThreadControl";
import { RenewalFollowUpAttentionControl } from "@/components/lease-renewal/RenewalFollowUpAttentionControl";
import { PacketTruthPanel } from "@/components/lease-renewal/PacketTruthPanel";
import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";
import { RentSuggestionApproval } from "@/components/lease-renewal/RentSuggestionApproval";
import { DRAFT_BANNER } from "@/lib/constants";
import { can, type Role } from "@/lib/auth/roles";
import type { ExternalDeskDestination } from "@/lib/lease-renewal/desk-destinations";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";
import { buildWorkspaceHref } from "@/lib/lease-renewal/desk-view-continuation";
import type { ReadinessStatus } from "@/lib/lease-renewal/renewal-readiness";
import type {
  DeskReconItem,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import type {
  RenewalProcessStepId,
  RenewalStepProjection,
} from "@/lib/lease-renewal/renewal-process";
import type { ChannelMessage } from "@/lib/lease-renewal/tenant-draft";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";

const READINESS_STATUS_LABEL: Record<ReadinessStatus, string> = {
  ok: "OK",
  flag: "Flag",
  needs_input: "Needs input",
};

// Data-check pill per agreement. A conflict needs a human; an agreement reads clear; a single source or a
// missing field reads as caution ("One source" / "Needs input") so an unconfirmed field is never dressed
// up as a verified pass.
const RECON_PILL: Record<DeskReconItem["agreement"], { value: string; label: string }> = {
  conflict: { value: "Action Required", label: "Needs your decision" },
  agree: { value: "Low", label: "Agrees" },
  single_source: { value: "Needs Verification", label: "One source" },
  missing: { value: "Needs Verification", label: "Needs input" },
};

export function renewalStepTargetId(stepId: string): string {
  return `renewal-step-${stepId}`;
}

function resolveSelectedStep(
  workspace: RenewalLeaseWorkspace,
  requested: string | undefined,
): RenewalProcessStepId {
  const ids = workspace.process.steps.map((step) => step.id);
  if (requested && (ids as string[]).includes(requested)) {
    return requested as RenewalProcessStepId;
  }
  return workspace.process.steps[workspace.process.currentStepIndex]?.id ?? ids[0];
}

export function RenewalWorkspace({
  compScreenshotExecutable = false,
  packetSnapshot = null,
  role = "Editor",
  workspace,
  selectedStepId,
  deskView = null,
  discrepancyPanel = null,
  rentvineUpdatesPanel = null,
  operatingSheetPanel = null,
  sheetDestination = null,
}: Readonly<{
  compScreenshotExecutable?: boolean;
  packetSnapshot?: RenewalPacketSnapshot | null;
  role?: Role;
  workspace: RenewalLeaseWorkspace;
  /** Raw `step` URL value; invalid/empty falls back to the process-current phase without error. */
  selectedStepId?: string;
  /** Canonical desk continuation; phase links preserve it so Back to renewals restores the view. */
  deskView?: string | null;
  /** The page-supplied discrepancy resolution panel, rendered inside the verify phase. */
  discrepancyPanel?: ReactNode;
  /** S97: the page-supplied RentVine update proposal/review panel, phase-independent. */
  rentvineUpdatesPanel?: ReactNode;
  /** S98: the page-supplied operating-Sheet proposal/review panel, phase-independent. */
  operatingSheetPanel?: ReactNode;
  /** Server-validated operating-Sheet link for the verify phase's source evidence. */
  sheetDestination?: ExternalDeskDestination | null;
}>) {
  const { summary } = workspace;
  const process = workspace.process;
  const currentStep = process.steps[process.currentStepIndex];
  const selected = resolveSelectedStep(workspace, selectedStepId);
  const selectedStep = process.steps.find((step) => step.id === selected) ?? currentStep;
  const dataExpired = workspace.dataCurrency?.state === "expired";

  return (
    <div className="ui-stack">
      <PageHeader
        actions={<ModeChip tone="live">Live data</ModeChip>}
        subtitle={`${summary.tenantNameLabel}${summary.endDateIso ? ` · ends ${summary.endDateIso}` : ""}`}
        title={summary.addressLabel}
      />

      <PhaseRail
        currentIndex={process.currentStepIndex}
        deskView={deskView}
        leaseId={summary.id}
        selectedId={selectedStep.id}
        steps={process.steps}
      />

      <DoThisNext deskView={deskView} leaseId={summary.id} workspace={workspace} />

      {dataExpired ? (
        <Card>
          <div role="status">
            <h2 className="ui-card-title">Data too old to act on</h2>
            <p className="muted">
              This lease data is past the freshness limit, so recording a decision and
              composing drafts are paused. Open the Renewals desk and refresh the data,
              then come back to this lease.
            </p>
          </div>
        </Card>
      ) : null}

      <SelectedPhase
        compScreenshotExecutable={compScreenshotExecutable}
        currentStep={currentStep}
        dataExpired={dataExpired}
        deskView={deskView}
        discrepancyPanel={discrepancyPanel}
        packetSnapshot={packetSnapshot}
        role={role}
        selectedStep={selectedStep}
        sheetDestination={sheetDestination}
        workspace={workspace}
      />

      {rentvineUpdatesPanel}

      {operatingSheetPanel}
    </div>
  );
}

function PhaseRail({
  steps,
  currentIndex,
  selectedId,
  leaseId,
  deskView,
}: Readonly<{
  steps: readonly RenewalStepProjection[];
  currentIndex: number;
  selectedId: string;
  leaseId: string;
  deskView: string | null;
}>) {
  return (
    <nav aria-label="Renewal phases" className="renewal-phase-rail">
      <ol>
        {steps.map((step, index) => {
          const stateLabel =
            step.state === "complete"
              ? "Complete"
              : index === currentIndex
                ? "Current"
                : step.state === "blocked"
                  ? "Blocked"
                  : "Upcoming";
          return (
            <li
              data-current={index === currentIndex || undefined}
              data-selected={step.id === selectedId || undefined}
              data-state={step.state}
              key={step.id}
            >
              <Link
                aria-current={step.id === selectedId ? "true" : undefined}
                className="renewal-phase-link"
                href={buildWorkspaceHref({ leaseId, step: step.id, deskView })}
              >
                <span className="renewal-phase-index">{index + 1}</span>
                <span className="renewal-phase-copy">
                  <span className="renewal-phase-label">{step.shortLabel}</span>
                  <span className="renewal-phase-state">{stateLabel}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DoThisNext({
  workspace,
  leaseId,
  deskView,
}: Readonly<{
  workspace: RenewalLeaseWorkspace;
  leaseId: string;
  deskView: string | null;
}>) {
  const process = workspace.process;
  const currentStep = process.steps[process.currentStepIndex];
  if (process.status === "complete") {
    return (
      <Card title="Renewal complete">
        <p className="muted">
          Every required phase has exact completion evidence. Open Compliance close for
          the recorded result.
        </p>
      </Card>
    );
  }
  if (process.status === "waiting") {
    return (
      <Card title="Waiting on the tenant">
        <p className="muted">
          The offer is with the tenant. Record the outcome in Tenant decision when a
          source-backed response exists; nothing else is required right now.
        </p>
      </Card>
    );
  }
  const nextSubstep = currentStep?.substeps.find(
    (substep) =>
      substep.applicable && substep.requiredForStep && substep.state !== "complete",
  );
  if (!currentStep || !nextSubstep) {
    return (
      <Card title="Do this next">
        <p className="muted">Open the current phase for the next required action.</p>
      </Card>
    );
  }
  return (
    <Card title="Do this next">
      <p>{nextSubstep.nextAction}</p>
      {nextSubstep.blockers.length > 0 ? (
        <ul className="renewal-blocker-list">
          {nextSubstep.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}
      <p>
        <Link
          className="text-link"
          href={buildWorkspaceHref({ leaseId, step: currentStep.id, deskView })}
        >
          Go to {currentStep.shortLabel}
        </Link>
      </p>
    </Card>
  );
}

function SelectedPhase({
  workspace,
  selectedStep,
  currentStep,
  role,
  dataExpired,
  compScreenshotExecutable,
  packetSnapshot,
  discrepancyPanel,
  sheetDestination,
  leaseId,
  deskView,
}: Readonly<{
  workspace: RenewalLeaseWorkspace;
  selectedStep: RenewalStepProjection;
  currentStep: RenewalStepProjection | undefined;
  role: Role;
  dataExpired: boolean;
  compScreenshotExecutable: boolean;
  packetSnapshot: RenewalPacketSnapshot | null;
  discrepancyPanel: ReactNode;
  sheetDestination: ExternalDeskDestination | null;
  leaseId?: string;
  deskView: string | null;
}>) {
  const process = workspace.process;
  const selectedIndex = process.steps.findIndex((step) => step.id === selectedStep.id);
  const isCurrent = selectedIndex === process.currentStepIndex;
  const isCompleted = selectedStep.state === "complete";
  const isUpcoming =
    !isCurrent && !isCompleted && selectedIndex > process.currentStepIndex;

  return (
    <section
      aria-label={`Selected phase: ${selectedStep.shortLabel}`}
      className="ui-stack"
      id={renewalStepTargetId(selectedStep.id)}
    >
      <div className="ui-spread">
        <h2 className="section-subtitle">{selectedStep.shortLabel}</h2>
        <StatusPill
          value={
            isCompleted
              ? "Low"
              : selectedStep.state === "blocked"
                ? "Action Required"
                : "Needs Verification"
          }
        >
          {isCompleted
            ? "Complete"
            : isCurrent
              ? "Current phase"
              : isUpcoming
                ? "Upcoming"
                : "Selected"}
        </StatusPill>
      </div>

      {isCompleted && !isCurrent ? (
        <CompletedPhaseSummary step={selectedStep} />
      ) : isUpcoming ? (
        <UpcomingPhaseSummary
          currentStep={currentStep}
          deskView={deskView}
          leaseId={workspace.summary.id}
          step={selectedStep}
        />
      ) : (
        <>
          {isCurrent && selectedStep.state === "blocked" ? (
            <Card title="Current blockers">
              <ul className="renewal-blocker-list">
                {[
                  ...new Set(
                    selectedStep.substeps
                      .filter((substep) => substep.applicable && substep.requiredForStep)
                      .flatMap((substep) => substep.blockers),
                  ),
                ].map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          <PhaseContent
            compScreenshotExecutable={compScreenshotExecutable}
            dataExpired={dataExpired}
            discrepancyPanel={discrepancyPanel}
            packetSnapshot={packetSnapshot}
            role={role}
            sheetDestination={sheetDestination}
            stepId={selectedStep.id}
            workspace={workspace}
          />
        </>
      )}
    </section>
  );
}

function CompletedPhaseSummary({ step }: Readonly<{ step: RenewalStepProjection }>) {
  return (
    <Card>
      <ul className="ui-rows">
        {step.substeps
          .filter((substep) => substep.applicable)
          .map((substep) => (
            <li className="ui-spread" key={substep.id}>
              <span>{substep.label}</span>
              <span aria-hidden="true" className="renewal-phase-check">
                <Icon name="check" size={16} />
              </span>
              <span className="sr-only">Complete with verified evidence.</span>
            </li>
          ))}
      </ul>
    </Card>
  );
}

function UpcomingPhaseSummary({
  step,
  currentStep,
  leaseId,
  deskView,
}: Readonly<{
  step: RenewalStepProjection;
  currentStep: RenewalStepProjection | undefined;
  leaseId: string;
  deskView: string | null;
}>) {
  const unmet = step.substeps.find(
    (substep) =>
      substep.applicable && substep.requiredForStep && substep.state !== "complete",
  );
  return (
    <Card>
      <p className="muted">
        {unmet
          ? `Earliest unmet prerequisite: ${unmet.label}.`
          : "This phase has no unmet prerequisite recorded yet."}
      </p>
      {currentStep ? (
        <p>
          <Link
            className="text-link"
            href={buildWorkspaceHref({ leaseId, step: currentStep.id, deskView })}
          >
            Go to current phase
          </Link>
        </p>
      ) : null}
    </Card>
  );
}

function PhaseContent({
  stepId,
  workspace,
  role,
  dataExpired,
  compScreenshotExecutable,
  packetSnapshot,
  discrepancyPanel,
  sheetDestination,
}: Readonly<{
  stepId: RenewalProcessStepId;
  workspace: RenewalLeaseWorkspace;
  role: Role;
  dataExpired: boolean;
  compScreenshotExecutable: boolean;
  packetSnapshot: RenewalPacketSnapshot | null;
  discrepancyPanel: ReactNode;
  sheetDestination: ExternalDeskDestination | null;
}>) {
  const { summary, ownerDraft, tenantDraft, readiness, dataCheck } = workspace;
  const openItems = readiness.flags.length + readiness.needsInput.length;

  switch (stepId) {
    case "verify-renewal":
      return (
        <>
          <Card title="Data check">
            <ul className="ui-rows">
              {dataCheck.map((item) => (
                <li className="ui-stack-tight" key={item.fieldKey}>
                  <div className="ui-spread">
                    <strong>{item.fieldLabel}</strong>
                    <StatusPill value={RECON_PILL[item.agreement].value}>
                      {RECON_PILL[item.agreement].label}
                    </StatusPill>
                  </div>
                  <div className="ui-row">
                    {item.candidates.map((candidate, index) => (
                      <span key={`${candidate.source}-${index}`}>
                        <strong>{candidate.value}</strong>{" "}
                        <SourceTag
                          confidence={candidate.confidence}
                          source={candidate.sourceSystem}
                        />
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {sheetDestination ? (
              <p>
                <a
                  className="text-link"
                  href={sheetDestination.href}
                  rel={EXTERNAL_LINK_REL}
                  target={EXTERNAL_LINK_TARGET}
                >
                  Open the operating renewal Sheet
                </a>{" "}
                <span className="muted">{sheetDestination.label}</span>
              </p>
            ) : null}
          </Card>
          {discrepancyPanel}
        </>
      );
    case "owner-decision":
      return (
        <Card title="Owner decision">
          {workspace.live && !dataExpired ? (
            <div className="ui-stack">
              <p className="muted">
                Record the owner’s rent decision to unlock the tenant offer.
              </p>
              <OwnerDecisionForm
                address={summary.addressLabel}
                compScreenshotExecutable={compScreenshotExecutable}
                current={workspace.live.ownerDecision}
                currentRent={workspace.currentRent}
                leaseId={workspace.live.leaseId}
              />
              <RentSuggestionApproval leaseId={workspace.live.leaseId} />
            </div>
          ) : null}
          {workspace.live && dataExpired ? (
            <p className="muted">
              Recording is paused while the lease data is past the freshness limit.
              Refresh the desk data first.
            </p>
          ) : null}
          <p className="muted">{DRAFT_BANNER}</p>
          <ul className="ui-rows">
            {ownerDraft.facts.map((fact) => (
              <li className="ui-spread" key={fact.key}>
                <span>
                  {fact.label}: <strong>{fact.value}</strong>
                </span>
                <SourceTag confidence={fact.confidence} source={fact.source} />
              </li>
            ))}
          </ul>
          {ownerDraft.missingInputs.length > 0 ? (
            <p className="muted">
              Needs verification before sending: {ownerDraft.missingInputs.join(", ")}.
            </p>
          ) : null}
          <Disclosure summary="Preview the owner email">
            <p>
              <strong>{ownerDraft.subject}</strong>
            </p>
            <div className="draft-box">{ownerDraft.body}</div>
          </Disclosure>
        </Card>
      );
    case "tenant-decision":
      return (
        <>
          {workspace.followUp ? (
            <Card title="Waiting and follow-up truth">
              <RenewalFollowUpStatus projection={workspace.followUp} />
              {!can(role, "edit") ? (
                <p className="muted">
                  Updating renewal follow-up state requires Editor access in Renewals.{" "}
                  <RequestAccessLink surface="renewal_workspace.edit" />
                </p>
              ) : null}
              <RenewalFollowUpAttentionControl
                canEdit={can(role, "edit")}
                projection={workspace.followUp}
              />
              <RenewalFollowUpThreadControl
                canEdit={can(role, "edit")}
                leaseId={summary.id}
                projection={workspace.followUp}
              />
            </Card>
          ) : null}
          <Card title="Tenant offer">
            {tenantDraft ? (
              <div className="ui-stack">
                <p className="muted">{DRAFT_BANNER} · not sent</p>
                <Tabs
                  ariaLabel="Tenant offer channel"
                  tabs={[
                    {
                      id: "email",
                      label: "Email",
                      content: <ChannelView message={tenantDraft.channels.email} />,
                    },
                    {
                      id: "portal",
                      label: "Portal chat",
                      content: <ChannelView message={tenantDraft.channels.portal_chat} />,
                    },
                    {
                      id: "text",
                      label: "Text",
                      content: <ChannelView message={tenantDraft.channels.text} />,
                    },
                  ]}
                />
              </div>
            ) : (
              <EmptyState
                description="Compose the tenant offer from this lease's live RentVine record in the renewal-notice draft below."
                title="Compose the tenant offer below"
              />
            )}
            {workspace.live?.ownerDecisionCurrent &&
            workspace.live.tenantOfferDraftId &&
            !dataExpired ? (
              <RenewalTenantOutcomeControl
                current={workspace.live.tenantOutcome}
                leaseId={workspace.live.leaseId}
              />
            ) : null}
          </Card>
          {/* Resolves the real RentVine lease by id and drafts an UNSENT Gmail draft through the
              gated route; a human presses Send in Gmail. */}
          <Card title="Renewal-notice draft">
            {dataExpired ? (
              <p className="muted">
                Composing is paused while the lease data is past the freshness limit.
                Refresh the desk data first.
              </p>
            ) : (
              <RenewalNoticeDraftComposer
                initialOffer={
                  workspace.live?.ownerDecisionCurrent && workspace.live.ownerDecision
                    ? {
                        decision: workspace.live.ownerDecision.decision,
                        offeredRent: workspace.live.ownerDecision.offeredRent,
                      }
                    : null
                }
                leaseId={summary.id}
              />
            )}
          </Card>
        </>
      );
    case "document-packet":
      return (
        <Card title="Build docs readiness">
          <PacketTruthPanel
            initialSnapshot={packetSnapshot}
            leaseId={summary.id}
            transactionId={summary.id}
          />
          <p className="muted">
            {readiness.allClear
              ? "Existing build-out checks clear. Packet truth above still governs document readiness."
              : `${openItems} existing check item${openItems === 1 ? "" : "s"} to resolve; packet truth above still governs document readiness.`}
          </p>
          <ul className="ui-rows">
            {readiness.checks.map((check) => (
              <li className="ui-spread" key={check.id}>
                <span className="ui-stack-tight">
                  <strong>{check.label}</strong>
                  <span className="muted">{check.detail}</span>
                </span>
                <StatusPill value={check.severity}>
                  {READINESS_STATUS_LABEL[check.status]}
                </StatusPill>
              </li>
            ))}
          </ul>
        </Card>
      );
    case "signatures-follow-up":
      return (
        <>
          {workspace.followUp ? (
            <Card title="Waiting and follow-up truth">
              <RenewalFollowUpStatus projection={workspace.followUp} />
              {!can(role, "edit") ? (
                <p className="muted">
                  Updating renewal follow-up state requires Editor access in Renewals.{" "}
                  <RequestAccessLink surface="renewal_workspace.edit" />
                </p>
              ) : null}
              <RenewalFollowUpAttentionControl
                canEdit={can(role, "edit")}
                projection={workspace.followUp}
              />
              <RenewalFollowUpThreadControl
                canEdit={can(role, "edit")}
                leaseId={summary.id}
                projection={workspace.followUp}
              />
            </Card>
          ) : null}
          {workspace.notice ? (
            <Card title="Notice timing">
              <p className="muted">{workspace.notice.statusLabel}</p>
              <ul className="ui-rows">
                {workspace.notice.lines.map((line) => (
                  <li className="ui-spread" key={line.label}>
                    <span>
                      {line.label}: <strong>{line.value}</strong>{" "}
                      <span className="muted">({line.provenance})</span>
                    </span>
                    {line.needsVerification ? (
                      <StatusPill value="Needs Verification">
                        Needs Verification
                      </StatusPill>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      );
    case "compliance-close":
      return (
        <Card title="Compliance close">
          {workspace.live?.complete ? (
            <p className="muted">
              The legacy workspace completion marker is recorded. It is not authenticated
              document execution proof and cannot unlock an owner acknowledgment.
            </p>
          ) : (
            <p className="muted">
              Document completion can be established only by authenticated S34 provider
              readback for the exact packet hash, not by an app-local checkbox.
            </p>
          )}
        </Card>
      );
  }
}

function ChannelView({ message }: Readonly<{ message: ChannelMessage }>) {
  return (
    <div className="ui-stack">
      {message.subject ? (
        <p>
          <strong>Subject:</strong> {message.subject}
        </p>
      ) : null}
      <div className="draft-box">{message.body}</div>
    </div>
  );
}
