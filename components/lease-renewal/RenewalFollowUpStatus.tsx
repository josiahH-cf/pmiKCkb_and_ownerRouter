import { StatusPill } from "@/components/ui";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";

const PARTY_LABELS = {
  team: "team",
  owner: "owner",
  tenant: "tenant",
  document_coordinator: "document coordinator",
  unresolved_source: "an unresolved source",
} as const;

/** Shared accessible rendering for the exact projection carried by desk and workspace. */
export function RenewalFollowUpStatus({
  projection,
  compact = false,
}: Readonly<{ projection: RenewalFollowUpProjection; compact?: boolean }>) {
  const waiting =
    projection.waiting.state === "needs_verification"
      ? "Waiting state needs verification"
      : projection.waiting.state === "not_waiting" || !projection.waiting.party
        ? "No external party is currently waiting"
        : `Waiting on ${PARTY_LABELS[projection.waiting.party]}`;
  const contact =
    projection.lastContact.state === "verified" && projection.lastContact.atIso
      ? `Last verified contact: ${projection.lastContact.atIso}`
      : "Last contact: Needs Verification";
  const policy =
    (projection.policy.state === "confirmed" || projection.policy.state === "disabled") &&
    projection.policy.version !== null &&
    projection.policy.effectiveScope
      ? `Policy version ${projection.policy.version} · ${projection.policy.effectiveScope} rule`
      : "Timing policy not confirmed";
  const due = dueLabel(projection);

  return (
    <div className={compact ? "ui-stack-tight" : "ui-stack"}>
      <div className="ui-row">
        <strong>{waiting}</strong>
        {projection.waiting.state === "needs_verification" ? (
          <StatusPill value="Needs Verification">Needs Verification</StatusPill>
        ) : null}
      </div>
      <span className="muted">{contact}</span>
      <span className="muted">{policy}</span>
      <span className="muted">{due}</span>
      {projection.attentionState === "dismissed" ? (
        <span className="muted">In-app due attention: Dismissed with audit evidence</span>
      ) : null}
      {!compact ? <span className="muted">Next: {projection.nextAction}</span> : null}
    </div>
  );
}

function dueLabel(projection: RenewalFollowUpProjection): string {
  switch (projection.due.state) {
    case "due":
      return `Follow-up due: ${projection.due.atIso}`;
    case "not_due":
      return `Next follow-up review: ${projection.due.atIso}`;
    case "needs_verification":
      return "Follow-up due state: Needs Verification";
    case "disabled":
      return "Follow-up timing is disabled by confirmed policy";
    case "unset":
      return "No due date until timing policy is confirmed";
    case "not_applicable":
      return "No external follow-up is due from the current waiting state";
  }
}
