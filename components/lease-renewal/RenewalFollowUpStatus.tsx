import Link from "next/link";

import {
  formatBusinessTimestamp,
  formatCalendarDateOrTimestamp,
} from "@/lib/date-display";
import { StatusPill } from "@/components/ui";
import {
  NOTICE_RULES_ADMIN_HREF,
  NOTICE_RULES_ADMIN_PLACE,
  NOTICE_RULES_UNCONFIRMED_LABEL,
  NOTICE_RULES_UNCONFIRMED_NEXT,
  type RenewalFollowUpProjection,
} from "@/lib/lease-renewal/follow-up-projection";
import { leaseWaitingPartyWords } from "@/lib/lease-renewal/lease-waiting";

// S279 R-S279-1: the card names who the lease waits on in the same words as the step's waiting
// line, the stage line and the lease status ("the owner", "the PMI KC team"), so every surface
// agrees word for word.
const PARTY_LABELS = {
  team: leaseWaitingPartyWords("team"),
  owner: leaseWaitingPartyWords("owner"),
  tenant: leaseWaitingPartyWords("tenant"),
  document_coordinator: "the document coordinator",
  unresolved_source: "an unresolved source",
} as const;

/**
 * Shared accessible rendering for the exact projection carried by desk and workspace.
 *
 * S279 R-S279-1: the waiting state and last contact come from the lease's own message evidence,
 * the same facts as the step's waiting line. Where the step already shows that line
 * (`stepWaitingShown`), the card shows only what it adds: the next follow-up date and the policy
 * note. S279 R-S279-5: unconfirmed notice rules name their Admin panel; an Admin gets its link.
 */
export function RenewalFollowUpStatus({
  projection,
  compact = false,
  stepWaitingShown = false,
  admin = false,
}: Readonly<{
  projection: RenewalFollowUpProjection;
  compact?: boolean;
  /** The step's waiting line on the same screen already says who, since when and last contact. */
  stepWaitingShown?: boolean;
  /** The viewer is an Admin, who can open the notice rules panel. */
  admin?: boolean;
}>) {
  const waiting =
    projection.waiting.state === "needs_verification"
      ? "Waiting state needs verification"
      : projection.waiting.state === "not_waiting" || !projection.waiting.party
        ? "No external party is currently waiting"
        : `Waiting on ${PARTY_LABELS[projection.waiting.party]}`;
  const contact =
    projection.lastContact.state === "verified" && projection.lastContact.atIso
      ? `Last verified contact: ${formatBusinessTimestamp(projection.lastContact.atIso)}`
      : projection.lastContact.state === "none"
        ? "No contact recorded yet"
        : "Last contact: Needs Verification";
  const unconfirmed =
    projection.policy.state === "unset" || projection.policy.state === "unreadable";
  const policy =
    (projection.policy.state === "confirmed" || projection.policy.state === "disabled") &&
    projection.policy.version !== null &&
    projection.policy.effectiveScope
      ? `Policy version ${projection.policy.version} · ${projection.policy.effectiveScope} rule`
      : NOTICE_RULES_UNCONFIRMED_LABEL;
  const due = dueLabel(projection);

  return (
    <div className={compact ? "ui-stack-tight" : "ui-stack"}>
      {stepWaitingShown ? null : (
        <>
          <div className="ui-row">
            <strong>{waiting}</strong>
            {projection.waiting.state === "needs_verification" ? (
              <StatusPill value="Needs Verification">Needs Verification</StatusPill>
            ) : null}
          </div>
          <span className="muted">{contact}</span>
        </>
      )}
      {unconfirmed ? (
        <span className="muted" data-renewal-field="notice-rules-unconfirmed">
          {NOTICE_RULES_UNCONFIRMED_LABEL}. Next: <NoticeRulesNext admin={admin} />
        </span>
      ) : (
        <span className="muted">{policy}</span>
      )}
      <span className="muted">{due}</span>
      {!stepWaitingShown && projection.attentionState === "dismissed" ? (
        <span className="muted">In-app due attention: Dismissed with audit evidence</span>
      ) : null}
      {!compact && !stepWaitingShown && !unconfirmed ? (
        <span className="muted">Next: {projection.nextAction}</span>
      ) : null}
    </div>
  );
}

/** "an Admin confirms them in Admin, Renewal notice rules.", the place linked for an Admin. */
function NoticeRulesNext({ admin }: Readonly<{ admin: boolean }>) {
  if (!admin) return <>{NOTICE_RULES_UNCONFIRMED_NEXT}</>;
  const [before] = NOTICE_RULES_UNCONFIRMED_NEXT.split(NOTICE_RULES_ADMIN_PLACE);
  return (
    <>
      {before}
      <Link href={NOTICE_RULES_ADMIN_HREF} prefetch={false}>
        {NOTICE_RULES_ADMIN_PLACE}
      </Link>
      .
    </>
  );
}

function dueLabel(projection: RenewalFollowUpProjection): string {
  switch (projection.due.state) {
    case "due":
      return `Follow-up due: ${formatCalendarDateOrTimestamp(projection.due.atIso)}`;
    case "not_due":
      return `Next follow-up review: ${formatCalendarDateOrTimestamp(projection.due.atIso)}`;
    case "needs_verification":
      return "Follow-up due state: Needs Verification";
    case "disabled":
      return "Follow-up timing is disabled by confirmed policy";
    case "unset":
      return "No follow-up date until the renewal notice rules are confirmed";
    case "not_applicable":
      return "No external follow-up is due from the current waiting state";
  }
}
