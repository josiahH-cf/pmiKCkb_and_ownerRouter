import Link from "next/link";
import { ConsoleApproveButton } from "@/components/console/ConsoleApproveButton";
import type {
  NeedsDecisionInbox,
  NeedsDecisionRow,
} from "@/lib/approval/needs-decision-inbox";

// Value-free unified inbox body (S13 B1 + S14 B5). One attention-ordered list of everything that
// needs a decision — open renewal flags, write-backs awaiting approval, and live approval-queue items —
// each deep-linking to the authenticated surface where the real value and full controls live. The one
// inline action is app-plane approval on an upstream-authorized safe queue-item row; renewal flags and
// write-backs remain deep-link-only.

const KIND_LABEL: Record<NeedsDecisionRow["kind"], string> = {
  writeback: "Write-back",
  renewal_flag: "Renewal flag",
  queue_item: "Approval",
};

export function NeedsDecisionInboxPanel({
  inbox,
}: Readonly<{ inbox?: NeedsDecisionInbox }>) {
  if (!inbox || inbox.counts.total === 0) {
    return (
      <section className="panel" aria-label="Needs your decision">
        <p className="muted">Nothing needs your decision right now.</p>
      </section>
    );
  }

  const { counts } = inbox;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="ui-stack needs-decision-inbox" aria-label="Needs your decision">
      <p className="muted">
        {plural(counts.total, "thing needs", "things need")} your decision, most urgent
        first. {plural(counts.renewalFlags, "renewal flag", "renewal flags")} ·{" "}
        {plural(counts.writebacksAwaiting, "write-back", "write-backs")} ·{" "}
        {plural(counts.queueItems, "queue item", "queue items")}. Open each to decide.
        Safe queue approvals can be recorded here; values and all other controls live on
        their pages.
      </p>
      <ul className="ui-rows">
        {inbox.rows.map((row) => (
          <li className="ui-spread" key={row.key}>
            <Link className="text-link" href={row.href}>
              <span className="ui-tag">{KIND_LABEL[row.kind]}</span>{" "}
              <strong>{row.label}</strong>
              <span className="muted"> · {row.detail}</span>
            </Link>
            <span className="queue-pill" data-value={row.severity}>
              {row.severity}
            </span>
            {row.kind === "queue_item" && row.canApproveInline && row.itemId ? (
              <ConsoleApproveButton itemId={row.itemId} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
