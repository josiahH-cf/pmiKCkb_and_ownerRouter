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
import { PrepareOwnerEmailButton } from "@/components/lease-renewal/PrepareOwnerEmailButton";
import { PrepareTenantEmailButton } from "@/components/lease-renewal/PrepareTenantEmailButton";
import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import {
  OwnerDecisionForm,
  RenewalCompleteButton,
} from "@/components/lease-renewal/RenewalProgressControls";
import { DRAFT_BANNER } from "@/lib/constants";
import type { ReadinessStatus } from "@/lib/lease-renewal/renewal-readiness";
import type {
  DeskReconItem,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/sample-desk";
import type { ChannelMessage } from "@/lib/lease-renewal/tenant-draft";

const READINESS_STATUS_LABEL: Record<ReadinessStatus, string> = {
  ok: "OK",
  flag: "Flag",
  needs_input: "Needs input",
};

type WorkspaceMode = "sample" | "live";

// Data-check pill per agreement. A conflict needs a human; an agreement reads clear; a single source or a
// missing field reads as caution ("One source" / "Needs input") so an unconfirmed field is never dressed
// up as a verified pass. Sample data only ever produces agree/conflict, so live adds the last two.
const RECON_PILL: Record<DeskReconItem["agreement"], { value: string; label: string }> = {
  conflict: { value: "Action Required", label: "Needs your decision" },
  agree: { value: "Low", label: "Agrees" },
  single_source: { value: "Needs Verification", label: "One source" },
  missing: { value: "Needs Verification", label: "Needs input" },
};

export function RenewalWorkspace({
  workspace,
  mode = "sample",
}: Readonly<{ workspace: RenewalLeaseWorkspace; mode?: WorkspaceMode }>) {
  const { summary, ownerDraft, tenantDraft, readiness, dataCheck } = workspace;
  const openItems = readiness.flags.length + readiness.needsInput.length;
  const isLive = mode === "live";

  return (
    <div className="ui-stack">
      <PageHeader
        actions={
          isLive ? (
            <ModeChip tone="live">Live data</ModeChip>
          ) : (
            <ModeChip>Sample data</ModeChip>
          )
        }
        subtitle={`${summary.tenantNameLabel}${summary.endDateIso ? ` · ends ${summary.endDateIso}` : ""}`}
        title={summary.addressLabel}
      />

      <Stepper currentIndex={workspace.currentStepIndex} steps={workspace.steps} />

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
        {isLive && workspace.live ? (
          <div className="ui-stack">
            <p className="muted">
              Record the owner’s rent decision to unlock the tenant offer.
            </p>
            <OwnerDecisionForm
              current={workspace.live.ownerDecision}
              leaseId={workspace.live.leaseId}
            />
          </div>
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
        {isLive ? null : <PrepareOwnerEmailButton leaseId={summary.id} />}
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
            {isLive ? null : <PrepareTenantEmailButton leaseId={summary.id} />}
          </div>
        ) : (
          <EmptyState
            description={
              isLive
                ? "Compose the tenant offer from this lease's live RentVine record in the renewal-notice draft below."
                : "The tenant offer drafts unlock once the owner records a rent decision."
            }
            title={
              isLive
                ? "Compose the tenant offer below"
                : "Available after the owner decides"
            }
          />
        )}
      </Card>

      {/* The email step. In live mode this resolves the real RentVine lease by id and drafts an UNSENT
          Gmail draft through the gated route; a human presses Send in Gmail. The sample workspace has no
          real lease to resolve, so it points to the live notices desk instead of a control that fails. */}
      <Card title="Renewal-notice draft">
        {isLive ? (
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
        ) : (
          <EmptyState
            description="Create renewal-notice Gmail drafts from real RentVine leases on the live notices desk."
            title="Create renewal drafts on the live notices desk"
          />
        )}
      </Card>

      <Card title="Build docs readiness">
        <p className="muted">
          {readiness.allClear
            ? "All checks clear."
            : `${openItems} item${openItems === 1 ? "" : "s"} to resolve before build-out.`}
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
        {isLive && workspace.live ? (
          <RenewalCompleteButton
            complete={workspace.live.complete}
            leaseId={workspace.live.leaseId}
          />
        ) : null}
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
