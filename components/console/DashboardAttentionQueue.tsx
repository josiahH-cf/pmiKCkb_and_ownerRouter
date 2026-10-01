"use client";

// S147 compact attention queue: the one standing non-AI panel on the Dashboard, secondary to the
// AI workspace. It lists the signed-in user's pending approval and attention items from the
// existing eligibility and dedup rules, keeps empty, partial and unavailable distinct (a failed
// read never shows a count), and refreshes after the existing inline Approve. Value-free rows only;
// every decision happens on the item's own review surface or through the unchanged item PATCH.

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { ConsoleApproveButton } from "@/components/console/ConsoleApproveButton";
import type { AttentionAuthority, AttentionQueue } from "@/lib/attention/attention-queue";

const PREVIEW_ROWS = 5;

const AUTHORITY_NOTE: Record<AttentionAuthority, string | null> = {
  approve_inline: null,
  approve: "Review to decide",
  view: "Waiting on an approver",
  review: null,
};

export function DashboardAttentionQueue({
  initial,
  canApprove,
}: Readonly<{ initial: Promise<AttentionQueue>; canApprove: boolean }>) {
  return (
    <Suspense fallback={<AttentionQueueLoading />}>
      <AttentionQueueBody canApprove={canApprove} initial={initial} />
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
}: Readonly<{ initial: Promise<AttentionQueue>; canApprove: boolean }>) {
  const first = use(initial);
  const [queue, setQueue] = useState<AttentionQueue>(first);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const response = await fetch("/api/dashboard/attention", { cache: "no-store" });
      if (!response.ok) throw new Error("refresh_failed");
      setQueue((await response.json()) as AttentionQueue);
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  }

  const preview = queue.rows.slice(0, PREVIEW_ROWS);
  const showsApprovalNote =
    !canApprove && queue.rows.some((row) => row.kind === "queue_item");

  return (
    <section aria-label="Waiting on you" className="panel dashboard-attention">
      <div className="dashboard-attention-head">
        <h2>Waiting on you</h2>
        {queue.state === "ok" && queue.rows.length > 0 ? (
          <span className="console-deck-count" data-testid="attention-count">
            {queue.rows.length}
          </span>
        ) : null}
      </div>
      {queue.state === "unavailable" ? (
        <p className="muted" data-queue-state="unavailable">
          What is waiting on you could not be loaded just now. You can still ask a
          question.
        </p>
      ) : queue.rows.length === 0 ? (
        <p className="muted" data-queue-state={queue.state}>
          {queue.state === "partial"
            ? "Nothing found in the sources that answered. Some sources could not be read just now."
            : "Nothing is waiting on you right now."}
        </p>
      ) : (
        <>
          {queue.state === "partial" ? (
            <p className="muted" data-queue-state="partial">
              Some sources could not be read just now, so this list may be incomplete.
            </p>
          ) : null}
          <ul className="dashboard-attention-list">
            {preview.map((row) => (
              <li data-authority={row.authority} key={row.key}>
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
          <Link className="text-link" href={queue.seeAllHref}>
            {queue.state === "ok" && queue.rows.length > preview.length
              ? `See all ${queue.rows.length}`
              : "Open the full list"}
          </Link>
        </>
      )}
      {showsApprovalNote ? (
        <p className="muted">
          Approving eligible app work requires Approver access.{" "}
          <RequestAccessLink surface="console.approve" />
        </p>
      ) : null}
      {queue.state !== "ok" || refreshFailed ? (
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
