import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalCompPreparation } from "@/components/lease-renewal/RenewalCompPreparation";
import type {
  RenewalWorkspaceState,
  RenewalCycleBasis,
} from "@/lib/lease-renewal/workspace-state";
// S113 mounts the full lease dashboard. Historical process evidence remains distinct from
// staff-recorded work; navigating or expanding a section never advances either lane.
// Server component; the tenant-channel switch uses the client Tabs primitive.

import Link from "next/link";
import type { ReactNode } from "react";

import { RenewalAttemptSummaryCard } from "@/components/lease-renewal/RenewalAttemptSummaryCard";
import type { RenewalAttemptSummary } from "@/lib/lease-renewal/execution/attempt-continuation";

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
import { RenewalDeskRefresh } from "@/components/lease-renewal/RenewalDeskRefresh";
import { LEASE_EXPORT_TTL_MS } from "@/lib/lease-renewal/live-lease-cache";
import { RenewalDashboardNavigation } from "@/components/lease-renewal/RenewalDashboardNavigation";
import {
  RENEWAL_DASHBOARD_SECTIONS,
  renewalDashboardTarget,
} from "@/lib/lease-renewal/dashboard-sections";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import { RenewalOwnerOutcomeControl } from "@/components/lease-renewal/RenewalOwnerOutcomeControl";
import { RenewalTenantOutcomeControl } from "@/components/lease-renewal/RenewalTenantOutcomeControl";
import { RenewalFollowUpStatus } from "@/components/lease-renewal/RenewalFollowUpStatus";
import { RenewalFollowUpThreadControl } from "@/components/lease-renewal/RenewalFollowUpThreadControl";
import { RenewalFollowUpAttentionControl } from "@/components/lease-renewal/RenewalFollowUpAttentionControl";
import { RenewalDocumentHandoff } from "@/components/lease-renewal/RenewalDocumentHandoff";
import { PacketTruthPanel } from "@/components/lease-renewal/PacketTruthPanel";
import {
  RenewalAuxiliaryNotice,
  type RenewalAuxiliaryFailure,
} from "@/components/lease-renewal/RenewalAuxiliaryNotice";
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
import { LEASE_TERM_LABELS } from "@/lib/lease-renewal/lease-term";
import type { ReadinessStatus } from "@/lib/lease-renewal/renewal-readiness";
import type {
  DeskReconItem,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";
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
  resolved: { value: "Low", label: "Resolved" },
  dismissed: { value: "Low", label: "Disposition recorded" },
  single_source: { value: "Needs Verification", label: "One source" },
  missing: { value: "Needs Verification", label: "Needs input" },
};

export function renewalStepTargetId(stepId: string): string {
  return `renewal-step-${stepId}`;
}

function formatCurrencyReference(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
}

export function RenewalWorkspace({
  compScreenshotExecutable = false,
  packetSnapshot = null,
  role = "Editor",
  workspace,
  selectedStepId,
  deskView = null,
  attemptSummary = null,
  discrepancyPanel = null,
  correctionPanel = null,
  rentvineUpdatesPanel = null,
  operatingSheetPanel = null,
  termReviewPanel = null,
  sheetDestination = null,
  sheetFieldDestinations = {},
  resourceLocationsPanel = null,
  manualState,
  manualReadUnavailable = false,
  manualCycleBasis = null,
  auxiliaryFailures = [],
  resolutionDestinations = [],
}: Readonly<{
  compScreenshotExecutable?: boolean;
  packetSnapshot?: RenewalPacketSnapshot | null;
  role?: Role;
  workspace: RenewalLeaseWorkspace;
  /** Raw `step` URL value; invalid/empty falls back to the process-current phase without error. */
  selectedStepId?: string;
  /** Canonical desk continuation; phase links preserve it so Back to renewals restores the view. */
  deskView?: string | null;
  resourceLocationsPanel?: ReactNode;
  manualState?: RenewalWorkspaceState | null;
  manualReadUnavailable?: boolean;
  manualCycleBasis?: RenewalCycleBasis | null;
  /** S107: this lease's consolidated confirmed-effect summary; null when nothing was confirmed. */
  attemptSummary?: RenewalAttemptSummary | null;
  /** The page-supplied discrepancy resolution panel, rendered inside the verify phase. */
  discrepancyPanel?: ReactNode;
  correctionPanel?: ReactNode;
  /** S97: the page-supplied RentVine update proposal/review panel, shown only in verification. */
  rentvineUpdatesPanel?: ReactNode;
  /** S98: the page-supplied operating-Sheet proposal/review panel, shown only in verification. */
  operatingSheetPanel?: ReactNode;
  /**
   * S103: the page-supplied lease term review control, shown in verification for every openable
   * lease: including an inspection-only month-to-month row, where recording the anchor is the
   * whole point of the visit.
   */
  termReviewPanel?: ReactNode;
  /** Server-validated operating-Sheet link for the verify phase's source evidence. */
  sheetDestination?: ExternalDeskDestination | null;
  sheetFieldDestinations?: Record<string, string>;
  /** Symbolic supporting-read failures. Values/errors never enter this client-safe projection. */
  auxiliaryFailures?: readonly RenewalAuxiliaryFailure[];
  /** Exact Live-review anchors for unresolved source items in this lease. */
  resolutionDestinations?: readonly {
    fieldKey: string;
    href: string;
  }[];
}>) {
  const { summary } = workspace;
  const dataExpired = workspace.dataCurrency?.state === "expired";
  const unavailableKeys = new Set(auxiliaryFailures.map((failure) => failure.key));
  const progressStateAvailable = !unavailableKeys.has("progress");

  return (
    <div className="ui-stack">
      <PageHeader
        actions={
          <>
            <ModeChip tone="live">Live data</ModeChip>
            {workspace.dataCurrency ? (
              <RenewalDeskRefresh
                readAtMs={Date.parse(workspace.dataCurrency.readAtIso)}
                ttlMs={LEASE_EXPORT_TTL_MS}
              />
            ) : null}
          </>
        }
        subtitle={`${summary.tenantNameLabel}${summary.endDateIso ? ` · ends ${summary.endDateIso}` : ""}`}
        title={summary.addressLabel}
      />

      <RenewalAuxiliaryNotice failures={auxiliaryFailures} />

      {!workspace.workflowAvailable ? (
        <>
          <Card title="Inspection only">
            <p className="muted" role="status">
              {summary.reasonLabel}. This lease is available for source inspection, but
              renewal progress, decisions, drafts, and source updates are unavailable
              here.
            </p>
          </Card>
          <section aria-label="Source facts" className="ui-stack">
            <PhaseContent
              compScreenshotExecutable={false}
              dataExpired={dataExpired}
              discrepancyPanel={null}
              followUpControlsAvailable={false}
              packetSnapshot={null}
              packetStateAvailable={false}
              progressStateAvailable={false}
              rentSuggestionAvailable={false}
              rentvineUpdatesPanel={null}
              resolutionDestinations={[]}
              role={role}
              sheetProposalPanel={null}
              sheetDestination={sheetDestination}
              sheetFieldDestinations={sheetFieldDestinations}
              stepId="verify-renewal"
              termReviewPanel={termReviewPanel}
              workspace={workspace}
            />
          </section>
        </>
      ) : (
        <RenewalManualProvider
          unavailable={manualReadUnavailable}
          leaseId={summary.id}
          initialState={manualState}
          cycleBasis={manualCycleBasis}
        >
          <RenewalDashboardNavigation selectedStepId={selectedStepId} />

          <DoThisNext
            deskView={deskView}
            leaseId={summary.id}
            progressStateAvailable={progressStateAvailable}
            workspace={workspace}
          />

          {attemptSummary ? <RenewalAttemptSummaryCard summary={attemptSummary} /> : null}

          {dataExpired ? (
            <Card>
              <div role="status">
                <h2 className="ui-card-title">Data too old to act on</h2>
                <p className="muted">
                  This lease data is past the freshness limit, so recording a decision and
                  composing drafts are paused. Use Refresh data above to reread the
                  sources on this lease.
                </p>
              </div>
            </Card>
          ) : null}

          {RENEWAL_DASHBOARD_SECTIONS.map((section) => (
            <section
              aria-label={section.label}
              data-progress-state={progressStateAvailable ? "available" : "unavailable"}
              className="ui-stack"
              id={`renewal-section-${section.id}`}
              tabIndex={-1}
              key={section.id}
            >
              <h2>{section.label}</h2>
              {section.id === "comps" ? (
                <RenewalCompPreparation
                  address={summary.addressLabel}
                  currentRent={workspace.currentRent}
                  compScreenshotExecutable={compScreenshotExecutable}
                />
              ) : null}
              {section.id === "owner" ||
              section.id === "tenant" ||
              section.id === "documents" ? (
                <RenewalManualSection section={section.id} />
              ) : null}
              {section.id === "owner" || section.id === "tenant" ? (
                <RenewalMessagePreparation
                  channel={section.id}
                  canEdit={can(role, "edit")}
                />
              ) : null}
              {section.id === "documents" ? resourceLocationsPanel : null}
              {section.steps.map((stepId) => (
                <div
                  className="ui-stack"
                  id={renewalStepTargetId(stepId)}
                  tabIndex={-1}
                  key={stepId}
                >
                  <PhaseContent
                    consolidated={manualState !== undefined || manualReadUnavailable}
                    compScreenshotExecutable={compScreenshotExecutable}
                    dataExpired={dataExpired}
                    discrepancyPanel={
                      <>
                        {correctionPanel}
                        <details>
                          <summary>
                            Discrepancy decision history and advanced disposition
                          </summary>
                          {discrepancyPanel}
                        </details>
                      </>
                    }
                    followUpControlsAvailable={
                      !unavailableKeys.has("communications") &&
                      !unavailableKeys.has("dismissed_attention")
                    }
                    packetSnapshot={packetSnapshot}
                    packetStateAvailable={!unavailableKeys.has("packet")}
                    progressStateAvailable={progressStateAvailable}
                    rentSuggestionAvailable={!unavailableKeys.has("rent_suggestion")}
                    rentvineUpdatesPanel={rentvineUpdatesPanel}
                    resolutionDestinations={resolutionDestinations}
                    role={role}
                    sheetProposalPanel={operatingSheetPanel}
                    sheetDestination={sheetDestination}
                    sheetFieldDestinations={sheetFieldDestinations}
                    stepId={stepId}
                    termReviewPanel={termReviewPanel}
                    workspace={workspace}
                  />
                </div>
              ))}
            </section>
          ))}
        </RenewalManualProvider>
      )}
    </div>
  );
}

function DoThisNext({
  workspace,
  leaseId,
  deskView,
  progressStateAvailable,
}: Readonly<{
  workspace: RenewalLeaseWorkspace;
  leaseId: string;
  deskView: string | null;
  progressStateAvailable: boolean;
}>) {
  const process = workspace.process;
  const currentStep = process.steps[process.currentStepIndex];
  if (!progressStateAvailable && !workspace.summary.manualProgress) {
    return (
      <Card title="Saved progress unavailable">
        <p className="muted">
          Saved renewal progress could not be read. Refresh this page before relying on
          the current phase or taking a progress-dependent action.
        </p>
      </Card>
    );
  }
  // S104: this card renders the SAME guidance projection the desk row carries, built once by the
  // loader's shared guidance builder. Status, blockers, and the next action are read from it and
  // never recomputed here, so the table and this workspace cannot disagree.
  const { guidance } = workspace;
  const action = guidance.action;
  const destinationStepId =
    "destination" in action && action.destination.kind === "workspace_phase"
      ? action.destination.stepId
      : currentStep?.id;
  const destinationStep = destinationStepId
    ? process.steps.find((step) => step.id === destinationStepId)
    : undefined;
  const unresolved = workspace.dataCheck.find(
    (item) => !["agree", "resolved", "dismissed"].includes(item.agreement),
  );
  const explicitControlId =
    "destination" in action && action.destination.kind === "workspace_phase"
      ? action.destination.controlId
      : undefined;
  const targetId =
    explicitControlId ??
    (destinationStep?.id === "verify-renewal" && unresolved
      ? `renewal-field-${unresolved.fieldKey}`
      : destinationStep
        ? renewalDashboardTarget(destinationStep.id)
        : "");
  const phaseLink =
    workspace.dataCurrency?.state === "expired" ? (
      <RenewalDeskRefresh
        readAtMs={Date.parse(workspace.dataCurrency.readAtIso)}
        ttlMs={LEASE_EXPORT_TTL_MS}
        id="renewal-refresh-next"
        label="Refresh this lease"
      />
    ) : destinationStep ? (
      <p>
        <Link
          className="text-link renewal-workspace-link"
          href={`${buildWorkspaceHref({ leaseId, step: destinationStep.id, deskView })}#${targetId}`}
        >
          Go to {destinationStep.shortLabel}
        </Link>
      </p>
    ) : null;
  const blockers =
    guidance.blockers.length > 0 ? (
      <ul className="renewal-blocker-list" aria-label="Current blockers">
        {guidance.blockers.map((blocker) => (
          <li key={blocker.id}>
            {blocker.destination.kind === "workspace_phase" ? (
              <Link
                className="text-link renewal-workspace-link"
                href={`${buildWorkspaceHref({ leaseId, step: blocker.destination.stepId, deskView })}#${renewalDashboardTarget(blocker.destination.stepId)}`}
              >
                {blocker.label}
              </Link>
            ) : (
              blocker.label
            )}
          </li>
        ))}
      </ul>
    ) : null;
  if (guidance.overallStatus === "complete") {
    return (
      <Card
        title={
          workspace.summary.manualProgress?.complete
            ? "Completed: recorded by staff"
            : "Verified complete"
        }
      >
        <p className="muted">
          {"label" in action
            ? action.label
            : "Every required phase has exact completion evidence."}
        </p>
        {phaseLink}
      </Card>
    );
  }
  if (guidance.overallStatus === "waiting") {
    return (
      <Card title="Waiting">
        <p className="muted">
          {"label" in action ? action.label : "Nothing else is required right now."}
        </p>
        {phaseLink}
      </Card>
    );
  }
  return (
    <Card title="Do this next">
      {"label" in action ? (
        <p>{action.label}</p>
      ) : (
        <p>Resolve the blockers below before continuing.</p>
      )}
      {blockers}
      {phaseLink}
    </Card>
  );
}

function PhaseContent({
  consolidated = false,
  stepId,
  workspace,
  role,
  dataExpired,
  compScreenshotExecutable,
  packetSnapshot,
  discrepancyPanel,
  sheetDestination,
  sheetFieldDestinations = {},
  progressStateAvailable,
  packetStateAvailable,
  followUpControlsAvailable,
  rentSuggestionAvailable,
  rentvineUpdatesPanel,
  sheetProposalPanel,
  resolutionDestinations,
  termReviewPanel,
}: Readonly<{
  consolidated?: boolean;
  stepId: RenewalProcessStepId;
  workspace: RenewalLeaseWorkspace;
  role: Role;
  dataExpired: boolean;
  compScreenshotExecutable: boolean;
  packetSnapshot: RenewalPacketSnapshot | null;
  discrepancyPanel: ReactNode;
  sheetDestination: ExternalDeskDestination | null;
  sheetFieldDestinations?: Record<string, string>;
  progressStateAvailable: boolean;
  packetStateAvailable: boolean;
  followUpControlsAvailable: boolean;
  rentSuggestionAvailable: boolean;
  rentvineUpdatesPanel: ReactNode;
  sheetProposalPanel: ReactNode;
  resolutionDestinations: readonly { fieldKey: string; href: string }[];
  termReviewPanel: ReactNode;
}>) {
  const { summary, ownerDraft, tenantDraft, readiness, dataCheck } = workspace;
  const term = summary.leaseTerm;
  const openItems = readiness.flags.length + readiness.needsInput.length;

  switch (stepId) {
    case "verify-renewal":
      return (
        <>
          <Card title="Lease term">
            <ul className="ui-rows">
              <li className="ui-spread">
                <strong>Term</strong>
                <span data-renewal-field="lease-term" data-lease-term={term.term}>
                  {LEASE_TERM_LABELS[term.term]}
                </span>
              </li>
              <li className="ui-spread">
                <span>Lease dates</span>
                <span>
                  {term.startDateIso ?? "Needs Verification"} to{" "}
                  {term.endDateIso ?? "Needs Verification"}
                </span>
              </li>
              {term.term === "month_to_month" ? (
                <>
                  <li className="ui-spread">
                    <span>Month-to-month since</span>
                    <span data-renewal-field="lease-term-anchor">
                      {term.anchorDateIso ?? "Needs Verification"}
                    </span>
                  </li>
                  <li className="ui-spread">
                    <span>Next review</span>
                    <span data-renewal-field="lease-term-next-review">
                      {term.nextReviewIso ?? "Needs review"}
                    </span>
                  </li>
                </>
              ) : null}
            </ul>
            {term.recordedReviewStale ? (
              <p className="muted" role="status">
                A recorded term review exists for a different version of these lease
                facts, so it is not applied. Record the term again against the current
                facts.
              </p>
            ) : null}
            {termReviewPanel}
          </Card>
          <Card title="Rent and charges">
            <dl className="ui-stack-tight">
              <div>
                <dt>Current contractual base rent</dt>
                <dd>
                  {summary.currentRent == null
                    ? "Needs verification"
                    : formatCurrencyReference(summary.currentRent)}
                </dd>
              </div>
              <div>
                <dt>Lease total (RentVine)</dt>
                <dd>
                  {summary.leaseTotalRent == null
                    ? "Unavailable"
                    : formatCurrencyReference(summary.leaseTotalRent)}
                </dd>
              </div>
              <div>
                <dt>Unit listed rent (reference)</dt>
                <dd>
                  {summary.unitListedRent == null
                    ? "Unavailable"
                    : formatCurrencyReference(summary.unitListedRent)}
                </dd>
              </div>
            </dl>
          </Card>
          <Card title="Data check">
            <ul className="ui-rows">
              {dataCheck.map((item) => {
                const resolutionDestination = resolutionDestinations.find(
                  (destination) => destination.fieldKey === item.fieldKey,
                );
                return (
                  <li
                    className="ui-stack-tight"
                    key={item.fieldKey}
                    id={`renewal-field-${item.fieldKey}`}
                    tabIndex={-1}
                  >
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
                          <a
                            className="text-link"
                            aria-label={`${candidate.sourceSystem} source for ${item.fieldLabel}`}
                            href={
                              (/sheet/i.test(candidate.sourceSystem)
                                ? (sheetFieldDestinations[item.fieldKey] ??
                                  sheetDestination?.href)
                                : /rentvine/i.test(candidate.sourceSystem)
                                  ? summary.sourceDestinations?.rentvine?.href
                                  : undefined) ??
                              resolutionDestination?.href ??
                              `#renewal-field-${item.fieldKey}`
                            }
                          >
                            <SourceTag
                              confidence={candidate.confidence}
                              source={candidate.sourceSystem}
                            />
                          </a>
                        </span>
                      ))}
                    </div>
                    {resolutionDestination ? (
                      <Link
                        className="text-link renewal-workspace-link"
                        data-renewal-next-control
                        href={resolutionDestination.href}
                      >
                        Review and resolve this source item
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {typeof workspace.unitListedRent === "number" ? (
              <p className="muted">
                Unit rent (RentVine): {formatCurrencyReference(workspace.unitListedRent)}.
                Reference only; the current base rent above comes from the lease.
              </p>
            ) : null}
            {sheetDestination ? (
              <p>
                <a
                  className="text-link renewal-workspace-link"
                  href={sheetDestination.href}
                  rel={EXTERNAL_LINK_REL}
                  target={EXTERNAL_LINK_TARGET}
                >
                  Open the operating renewal Sheet
                </a>{" "}
                <span className="muted">{sheetDestination.label}</span>
              </p>
            ) : null}
            {summary.sourceDestinations?.rentvine ? (
              <p>
                <a
                  className="text-link renewal-workspace-link"
                  href={summary.sourceDestinations.rentvine.href}
                  rel={EXTERNAL_LINK_REL}
                  target={EXTERNAL_LINK_TARGET}
                >
                  Open this lease in RentVine
                </a>{" "}
                <span className="muted">{summary.sourceDestinations.rentvine.label}</span>
              </p>
            ) : null}
          </Card>
          {discrepancyPanel}
          {rentvineUpdatesPanel}
          {sheetProposalPanel}
        </>
      );
    case "owner-decision":
      if (consolidated)
        return (
          <Disclosure summary="Prior owner decision and provider evidence">
            <p className="muted">
              Historical decision and draft evidence are retained here. Record the current
              cycle&apos;s owner response and exact terms in the controls above.
            </p>
            <ul className="ui-rows">
              {ownerDraft.facts.map((fact) => (
                <li key={fact.key}>
                  {fact.label}: <strong>{fact.value}</strong>{" "}
                  <SourceTag confidence={fact.confidence} source={fact.source} />
                </li>
              ))}
            </ul>
            <p>{ownerDraft.subject}</p>
            <div className="draft-box">{ownerDraft.body}</div>
            {workspace.live && rentSuggestionAvailable ? (
              <RentSuggestionApproval leaseId={workspace.live.leaseId} />
            ) : null}
          </Disclosure>
        );
      return (
        <Card title="Owner decision">
          {workspace.live &&
          workspace.live.ownerResponseRecordable &&
          !dataExpired &&
          progressStateAvailable ? (
            <div className="ui-stack">
              <p className="muted">
                Record what the owner actually answered. Asking for changes reopens the
                owner copy and every preview built from it.
              </p>
              <RenewalOwnerOutcomeControl
                current={workspace.live.ownerOutcome}
                leaseId={workspace.live.leaseId}
              />
            </div>
          ) : null}
          {workspace.live && !dataExpired && progressStateAvailable ? (
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
              {rentSuggestionAvailable ? (
                <RentSuggestionApproval leaseId={workspace.live.leaseId} />
              ) : (
                <RenewalAuxiliaryNotice
                  compact
                  failures={[{ key: "rent_suggestion", status: "failed" }]}
                />
              )}
            </div>
          ) : null}
          {workspace.live && dataExpired ? (
            <p className="muted">
              Recording is paused while the lease data is past the freshness limit.
              Refresh the desk data first.
            </p>
          ) : null}
          {!progressStateAvailable ? (
            <RenewalAuxiliaryNotice
              compact
              failures={[{ key: "progress", status: "failed" }]}
            />
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
                canEdit={can(role, "edit") && followUpControlsAvailable}
                projection={workspace.followUp}
              />
              <RenewalFollowUpThreadControl
                canEdit={can(role, "edit") && followUpControlsAvailable}
                leaseId={summary.id}
                projection={workspace.followUp}
              />
            </Card>
          ) : null}
          <Card title={consolidated ? "Earlier tenant offer evidence" : "Tenant offer"}>
            <Disclosure
              summary={
                consolidated
                  ? "Inspect earlier channel drafts; terms may be superseded"
                  : "Tenant offer channel drafts"
              }
              defaultOpen={!consolidated}
            >
              {consolidated ? (
                <p>
                  Use the current tenant message preparation for this cycle. These
                  retained drafts describe earlier workflow evidence.
                </p>
              ) : null}
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
                        content: (
                          <ChannelView message={tenantDraft.channels.portal_chat} />
                        ),
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
            </Disclosure>
            {!consolidated &&
            workspace.live?.ownerDecisionCurrent &&
            workspace.live.tenantOfferDraftId &&
            progressStateAvailable &&
            !dataExpired ? (
              <RenewalTenantOutcomeControl
                current={workspace.live.tenantOutcome}
                leaseId={workspace.live.leaseId}
              />
            ) : null}
          </Card>
          {/* Resolves the real RentVine lease by id and drafts an UNSENT Gmail draft through the
              gated route; a human presses Send in Gmail. */}
          {!consolidated ? (
            <Card title="Renewal-notice draft">
              {dataExpired ? (
                <p className="muted">
                  Composing is paused while the lease data is past the freshness limit.
                  Refresh the desk data first.
                </p>
              ) : !progressStateAvailable ? (
                <RenewalAuxiliaryNotice
                  compact
                  failures={[{ key: "progress", status: "failed" }]}
                />
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
          ) : null}
        </>
      );
    case "document-packet":
      return (
        <Card title="Build docs readiness">
          {packetStateAvailable ? (
            <>
              <PacketTruthPanel
                initialSnapshot={packetSnapshot}
                leaseId={summary.id}
                transactionId={summary.id}
              />
              <RenewalDocumentHandoff
                canApprove={can(role, "manageAdmin")}
                canRecordReadback={can(role, "approve")}
              />
            </>
          ) : (
            <RenewalAuxiliaryNotice
              compact
              failures={[{ key: "packet", status: "failed" }]}
            />
          )}
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
          {!consolidated && workspace.followUp ? (
            <Card title="Waiting and follow-up truth">
              <RenewalFollowUpStatus projection={workspace.followUp} />
              {!can(role, "edit") ? (
                <p className="muted">
                  Updating renewal follow-up state requires Editor access in Renewals.{" "}
                  <RequestAccessLink surface="renewal_workspace.edit" />
                </p>
              ) : null}
              <RenewalFollowUpAttentionControl
                canEdit={can(role, "edit") && followUpControlsAvailable}
                projection={workspace.followUp}
              />
              <RenewalFollowUpThreadControl
                canEdit={can(role, "edit") && followUpControlsAvailable}
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
