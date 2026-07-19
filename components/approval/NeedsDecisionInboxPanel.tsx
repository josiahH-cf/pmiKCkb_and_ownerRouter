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
  // AQ-9/AQ-10: reconcile the count against what is actionable HERE, replacing the aggregate
  // flag/write-back/queue-item metadata (which read as a different number from Bulk Actions).
  // inlineApprovable matches the safe queue approvals a user can record on this surface; everything
  // else deep-links to its own page for the full decision.
  const inlineApprovable = inbox.rows.filter(
    (row) => row.kind === "queue_item" && row.canApproveInline && Boolean(row.itemId),
  ).length;
  const elsewhere = counts.total - inlineApprovable;

  return (
    <div className="ui-stack needs-decision-inbox" aria-label="Needs your decision">
      <p className="muted">
        {plural(counts.total, "thing needs", "things need")} your decision, most urgent
        first.{" "}
        {inlineApprovable > 0
          ? elsewhere > 0
            ? `${inlineApprovable} can be approved right here; the rest open on their own pages for the full decision.`
            : "You can approve them right here."
          : "Open each on its own page to decide."}
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
