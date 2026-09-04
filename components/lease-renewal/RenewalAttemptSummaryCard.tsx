import { Card } from "@/components/ui";
import type { RenewalAttemptSummary } from "@/lib/lease-renewal/execution/attempt-continuation";

/**
 * S107: one consolidated view of this lease's confirmed external effects.
 *
 * It replaces per-panel fragments with a single statement of what was last confirmed, when, how it
 * ended, and what the operator does next. An uncertain attempt is named as uncertain; nothing here
 * retries, and no control on this card touches a provider.
 */
const ACTION_LABELS: Record<string, string> = {
  "rentvine.lease.renewal_dates.update": "Update the RentVine lease dates",
  "rentvine.lease.recurring_charge.update": "Update a RentVine recurring charge",
  "rentvine.lease.recurring_charge.create": "Add a RentVine recurring charge",
  "google_sheets.renewal_checklist.row_append": "Add one operating Sheet row",
  "google_sheets.renewal_checklist.field_update": "Update one operating Sheet field",
  "dotloop.loop.create_from_template": "Create the Dotloop loop",
  "dotloop.loop.document.upload": "Upload the packet document to Dotloop",
};

const STATE_LABELS: Record<string, string> = {
  running: "Still finishing",
  succeeded: "Recorded with a receipt",
  ambiguous: "Result uncertain",
  failed: "Did not complete",
  blocked: "Blocked before the provider",
  ready: "Confirmed, not started",
  not_applicable: "Nothing to change",
};

export function RenewalAttemptSummaryCard({
  summary,
}: Readonly<{ summary: RenewalAttemptSummary }>) {
  if (summary.lastAttemptState === null) return null;
  const needsAttention =
    summary.lastAttemptState === "ambiguous" || summary.lastAttemptState === "failed";
  return (
    <Card title="Confirmed external steps">
      <div role={needsAttention ? "status" : undefined}>
        <ul className="ui-rows">
          <li className="ui-spread">
            <span>Last confirmed step</span>
            <span>
              {summary.lastConfirmedStep
                ? (ACTION_LABELS[summary.lastConfirmedStep] ?? summary.lastConfirmedStep)
                : "Needs Verification"}
            </span>
          </li>
          <li className="ui-spread">
            <span>Attempted</span>
            <span>{summary.lastAttemptAtIso ?? "Needs Verification"}</span>
          </li>
          <li className="ui-spread">
            <span>Result</span>
            <span>
              {STATE_LABELS[summary.lastAttemptState] ?? summary.lastAttemptState}
            </span>
          </li>
        </ul>
        {summary.blocker ? <p className="muted">{summary.blocker}</p> : null}
        <p>{summary.nextAction}</p>
      </div>
    </Card>
  );
}
