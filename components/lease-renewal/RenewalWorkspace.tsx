// The per-lease Renewal Workspace — walks one lease through the four-step process (Data check →
// Owner decision → Tenant offer → Build docs), surfacing the four built renewal modules in order.
// Server component; the tenant-channel switch uses the client Tabs primitive.
//
// Governance is visible, not buried: drafts carry DRAFT_BANNER and never offer a send; the data-check
// presents conflicts as plain "needs your decision"; every fact wears a source tag + confidence.

import {
  Card,
  Disclosure,
  EmptyState,
  ModeChip,
  PageHeader,
  SourceTag,
  StatusPill,
  Stepper,
  Tabs,
} from "@/components/ui";
import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import { PacketTruthPanel } from "@/components/lease-renewal/PacketTruthPanel";
import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";
import { RentSuggestionApproval } from "@/components/lease-renewal/RentSuggestionApproval";
import { DRAFT_BANNER } from "@/lib/constants";
import type { ReadinessStatus } from "@/lib/lease-renewal/renewal-readiness";
import type {
  DeskReconItem,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
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

export function RenewalWorkspace({
  compScreenshotExecutable = false,
  packetSnapshot = null,
  workspace,
}: Readonly<{
  compScreenshotExecutable?: boolean;
  packetSnapshot?: RenewalPacketSnapshot | null;
  workspace: RenewalLeaseWorkspace;
}>) {
  const { summary, ownerDraft, tenantDraft, readiness, dataCheck } = workspace;
  const openItems = readiness.flags.length + readiness.needsInput.length;
  // S58: expired lease data pauses composing and recording (the routes refuse server-side too);
  // looking at the workspace stays allowed.
  const dataExpired = workspace.dataCurrency?.state === "expired";

  return (
    <div className="ui-stack">
      <PageHeader
        actions={<ModeChip tone="live">Live data</ModeChip>}
        subtitle={`${summary.tenantNameLabel}${summary.endDateIso ? ` · ends ${summary.endDateIso}` : ""}`}
        title={summary.addressLabel}
      />

      <Stepper currentIndex={workspace.currentStepIndex} steps={workspace.steps} />

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
                  <StatusPill value="Needs Verification">Needs Verification</StatusPill>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

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
      </Card>

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
            {/* S29: the comp-derived suggested rent number, shown beside its comps, with the Admin-only
                per-number approval control. It enters the owner draft only after an Admin approves it. */}
            <RentSuggestionApproval leaseId={workspace.live.leaseId} />
          </div>
        ) : null}
        {workspace.live && dataExpired ? (
          <p className="muted">
            Recording is paused while the lease data is past the freshness limit. Refresh
            the desk data first.
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
      </Card>

      {/* Resolves the real RentVine lease by id and drafts an UNSENT Gmail draft through the gated
          route; a human presses Send in Gmail. */}
      <Card title="Renewal-notice draft">
        {dataExpired ? (
          <p className="muted">
            Composing is paused while the lease data is past the freshness limit. Refresh
            the desk data first.
          </p>
        ) : (
          <RenewalNoticeDraftComposer
            initialOffer={
              workspace.live?.ownerDecision
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
    </div>
  );
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
