"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S147 compact attention queue: the one standing non-AI panel on the Dashboard, secondary to the
// AI workspace. It lists the signed-in user's pending approval and attention items from the
// existing eligibility and dedup rules, keeps empty, partial and unavailable distinct (a failed
// read never shows a count), and refreshes after the existing inline Approve. Value-free rows only;
// every decision happens on the item's own review surface or through the unchanged item PATCH.
//
// S280: it leads with the renewal work that follows from the viewer's own messages (R-S280-1), then
// one line pointing to the team's renewal list (R-S280-2). Every difference row names its lease and
// opens its own item; past the row limit one line counts the rest on Live renewal review
// (R-S280-3). When the renewal read is older than its freshness limit the rows stay, marked with
// their read time, and "Refresh" runs the existing bounded re-read (R-S280-4).

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { RenewalTeamLineSlot } from "@/components/attention/RenewalTeamLine";
import { ConsoleApproveButton } from "@/components/console/ConsoleApproveButton";
import type { AttentionAuthority, AttentionQueue } from "@/lib/attention/attention-queue";
import {
  RETAINED_RENEWAL_WORDS,
  keepRetainedRenewalRows,
} from "@/lib/attention/attention-retention";
import { FOLLOW_THROUGH_WORDS } from "@/lib/attention/renewal-follow-through-words";
import type { RenewalTeamLine } from "@/lib/attention/renewal-team-line";
import { formatBusinessTimestamp } from "@/lib/date-display";

const PREVIEW_ROWS = 5;
const LIVE_RENEWAL_REVIEW_HREF = "/lease-renewal/live";

const AUTHORITY_NOTE: Record<AttentionAuthority, string | null> = {
  approve_inline: null,
  approve: "Review to decide",
  view: "Waiting on an approver",
  review: null,
};

export function DashboardAttentionQueue({
  initial,
  canApprove,
  teamLine,
}: Readonly<{
  initial: Promise<AttentionQueue>;
  canApprove: boolean;
  /** S280 R-S280-2: the team line, streamed on its own; omitted or null shows none. */
  teamLine?: Promise<RenewalTeamLine | null> | null;
}>) {
  return (
    <Suspense fallback={<AttentionQueueLoading />}>
      <AttentionQueueBody canApprove={canApprove} initial={initial} teamLine={teamLine} />
    </Suspense>
  );
}

function AttentionQueueLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Waiting on you"
      className="panel dashboard-attention"
    >
      <h2>Waiting on you</h2>
      <p className="muted" role="status">
        Checking what is waiting on you…
      </p>
    </section>
  );
}

function AttentionQueueBody({
  initial,
  canApprove,
  teamLine,
}: Readonly<{
  initial: Promise<AttentionQueue>;
  canApprove: boolean;
  teamLine?: Promise<RenewalTeamLine | null> | null;
}>) {
  const first = use(initial);
  const [queue, setQueue] = useState<AttentionQueue>(first);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [renewalRefreshFailed, setRenewalRefreshFailed] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setRefreshFailed(false);
    setRenewalRefreshFailed(false);
    try {
      const response = await fetch("/api/dashboard/attention", { cache: "no-store" });
      if (!response.ok) throw new Error("refresh_failed");
      const next = (await response.json()) as AttentionQueue;
      const merged = keepRetainedRenewalRows(queue, next);
      setQueue(merged.queue);
      setRenewalRefreshFailed(merged.renewalFailed);
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  }

  const followThrough = queue.followThrough ?? [];
  const preview = queue.rows.slice(0, PREVIEW_ROWS);
  const hiddenRenewalRows = queue.rows
    .slice(PREVIEW_ROWS)
    .filter((row) => row.kind !== "queue_item").length;
  const total = queue.rows.length + followThrough.length;
  const retained = queue.renewalRead?.state === "retained" ? queue.renewalRead : null;
  const showsApprovalNote =
    !canApprove && queue.rows.some((row) => row.kind === "queue_item");

  return (
    <section aria-label="Waiting on you" className="panel dashboard-attention">
      <div className="dashboard-attention-head">
        <h2>Waiting on you</h2>
        {queue.state === "ok" && total > 0 ? (
          <span className="console-deck-count" data-testid="attention-count">
            {total}
          </span>
        ) : null}
      </div>
      {followThrough.length > 0 ? (
        <ul
          aria-label={FOLLOW_THROUGH_WORDS.heading}
          className="dashboard-attention-list"
          data-testid="attention-follow-through"
        >
          {followThrough.map((row) => (
            <li data-kind={row.kind} key={row.key}>
              <Link href={row.href}>{row.label}</Link>
              <span className="muted"> · {row.basis}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <RenewalTeamLineSlot line={teamLine} />
      {queue.renewalReviewIssue ? (
        <p className="muted" data-testid="renewal-review-issue">
          {queue.renewalReviewIssue.message}
          {queue.renewalReviewIssue.sourceReadAtIso
            ? ` Source last read: ${formatBusinessTimestamp(queue.renewalReviewIssue.sourceReadAtIso)}.`
            : ""}
        </p>
      ) : null}
      {queue.state === "unavailable" ? (
        <p className="muted" data-queue-state="unavailable">
          What is waiting on you could not be loaded just now. You can still ask a
          question.
        </p>
      ) : queue.rows.length === 0 ? (
        followThrough.length > 0 ? null : (
          <p className="muted" data-queue-state={queue.state}>
            {queue.state === "partial"
              ? "Nothing found in the sources that answered. Some sources could not be read just now."
              : "Nothing is waiting on you right now."}
          </p>
        )
      ) : (
        <>
          {queue.state === "partial" ? (
            <p className="muted" data-queue-state="partial">
              Some sources could not be read just now, so this list may be incomplete.
            </p>
          ) : null}
          <ul className="dashboard-attention-list">
            {preview.map((row) => (
              <li
                data-authority={row.authority}
                data-retained={row.retained ? "true" : undefined}
                key={row.key}
              >
                <Link href={row.href}>{row.label}</Link>
                {row.detail ? <span className="muted"> · {row.detail}</span> : null}
                {AUTHORITY_NOTE[row.authority] ? (
                  <span className="muted"> · {AUTHORITY_NOTE[row.authority]}</span>
                ) : null}
                {canApprove && row.authority === "approve_inline" && row.itemId ? (
                  <ConsoleApproveButton
                    itemId={row.itemId}
                    onApproved={() => void refresh()}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {hiddenRenewalRows > 0 ? (
            <Link
              className="text-link"
              data-testid="attention-more-renewal"
              href={LIVE_RENEWAL_REVIEW_HREF}
            >
              {`and ${hiddenRenewalRows} more on Live renewal review`}
            </Link>
          ) : null}{" "}
          <Link className="text-link" href={queue.seeAllHref}>
            {queue.state === "ok" && queue.rows.length > preview.length
              ? `See all ${queue.rows.length}`
              : "Open the full list"}
          </Link>
        </>
      )}
      {retained ? (
        <p className="muted" data-testid="renewal-read-retained">
          {RETAINED_RENEWAL_WORDS.readAt(
            formatBusinessTimestamp(retained.readAtIso ?? queue.checkedAtIso),
          )}{" "}
          <button
            className="link-button"
            disabled={refreshing}
            onClick={() => void refresh()}
            type="button"
          >
            {refreshing ? "Checking…" : RETAINED_RENEWAL_WORDS.refresh}
          </button>
        </p>
      ) : null}
      {renewalRefreshFailed ? (
        <p className="muted" role="status">
          {RETAINED_RENEWAL_WORDS.refreshFailed}
        </p>
      ) : null}
      {queue.followThroughState === "unavailable" ? (
        <p className="muted" data-testid="attention-follow-through-unavailable">
          {FOLLOW_THROUGH_WORDS.unavailable}
        </p>
      ) : null}
      {showsApprovalNote ? (
        <p className="muted">
          Approving eligible app work requires Approver access.{" "}
          <RequestAccessLink surface="console.approve" />
        </p>
      ) : null}
      {(queue.state !== "ok" || refreshFailed) && !retained ? (
        <button
          className="link-button"
          disabled={refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          {refreshing ? "Checking…" : "Try again"}
        </button>
      ) : null}
      {refreshFailed ? (
        <p className="muted" role="status">
          The list could not be refreshed just now. It shows the last result.
        </p>
      ) : null}
    </section>
  );
}
