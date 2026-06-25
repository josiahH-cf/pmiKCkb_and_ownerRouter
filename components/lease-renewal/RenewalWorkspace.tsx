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
import { DRAFT_BANNER } from "@/lib/constants";
import type { ReadinessStatus } from "@/lib/lease-renewal/renewal-readiness";
import type { RenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";
import type { ChannelMessage } from "@/lib/lease-renewal/tenant-draft";

const READINESS_STATUS_LABEL: Record<ReadinessStatus, string> = {
  ok: "OK",
  flag: "Flag",
  needs_input: "Needs input",
};

export function RenewalWorkspace({
  workspace,
}: Readonly<{ workspace: RenewalLeaseWorkspace }>) {
  const { summary, ownerDraft, tenantDraft, readiness, dataCheck } = workspace;
  const openItems = readiness.flags.length + readiness.needsInput.length;

  return (
    <div className="ui-stack">
      <PageHeader
        actions={<ModeChip>Sample data</ModeChip>}
        subtitle={`${summary.tenantNameLabel}${summary.endDateIso ? ` · ends ${summary.endDateIso}` : ""}`}
        title={summary.addressLabel}
      />

      <Stepper currentIndex={workspace.currentStepIndex} steps={workspace.steps} />

      <Card title="Data check">
        <ul className="ui-rows">
          {dataCheck.map((item) => (
            <li className="ui-stack-tight" key={item.fieldKey}>
              <div className="ui-spread">
                <strong>{item.fieldLabel}</strong>
                {item.agreement === "conflict" ? (
                  <StatusPill value="Action Required">Needs your decision</StatusPill>
                ) : (
                  <StatusPill value="Low">Agrees</StatusPill>
                )}
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
            description="The tenant offer drafts unlock once the owner records a rent decision."
            title="Available after the owner decides"
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
