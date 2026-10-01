// S147 compact Dashboard attention queue. A projection of the existing needs-decision eligibility,
// dedup keys and inline-approve rule, gathered per feed so a failed read is reported as unavailable
// or partial instead of the all-clear the old Dashboard card fell back to. It covers the signed-in
// user's actual scopes: approval-queue items reach every reader they are addressed to (the same
// recipient rule Notifications uses), and renewal flags and write-backs need the Renewals Space.
// Read-only and value-free: labels, PII-free detail, severity and an in-app link only.

import { queueActionAvailability } from "@/lib/approval/queue";
import {
  buildNeedsDecisionInbox,
  type NeedsDecisionKind,
} from "@/lib/approval/needs-decision-inbox";
import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildWritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { listApprovalQueue } from "@/lib/firestore/approval-queue";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import { loadRenewalRunViews } from "@/lib/lease-renewal/renewal-review-board";
import type { Severity } from "@/lib/lease-renewal/severity";

export const ATTENTION_QUEUE_FEEDS = ["approval_queue", "renewal_reviews"] as const;
export type AttentionQueueFeed = (typeof ATTENTION_QUEUE_FEEDS)[number];

/**
 * `ok`: every feed this user is eligible for answered (possibly with nothing waiting).
 * `partial`: at least one feed answered and at least one did not, so the list may be incomplete.
 * `unavailable`: no eligible feed answered; nothing is known, so no count is shown.
 */
export type AttentionQueueState = "ok" | "partial" | "unavailable";

/**
 * What this user may do with a row. `approve_inline` is the existing inline-approve rule (Low or
 * Medium risk, Ready for Approval, not the actor's own item, approvable now). `approve` means the
 * owning surface lets this user decide, but not inline. `view` means the user can see the item but
 * someone else decides. Renewal flags and write-backs are decided on their review surface.
 */
export type AttentionAuthority = "approve_inline" | "approve" | "view" | "review";

export interface AttentionQueueRow {
  readonly key: string;
  readonly kind: NeedsDecisionKind;
  readonly label: string;
  readonly detail: string;
  readonly severity: Severity;
  readonly href: string;
  readonly authority: AttentionAuthority;
  /** Queue items only: the id the existing inline Approve PATCHes. */
  readonly itemId?: string;
}

export interface AttentionQueue {
  readonly state: AttentionQueueState;
  readonly rows: readonly AttentionQueueRow[];
  /** Feeds that did not answer, by stable key. */
  readonly unavailableFeeds: readonly AttentionQueueFeed[];
  /** The full approval list this user can open. */
  readonly seeAllHref: string;
  readonly checkedAtIso: string;
}

export interface AttentionQueueDependencies {
  readonly listQueue: (user: AuthenticatedUser) => Promise<ApprovalQueueItemRecord[]>;
  readonly loadRunViews: typeof loadRenewalRunViews;
  readonly now: () => Date;
}

const defaultDependencies: AttentionQueueDependencies = {
  listQueue: (user) => listApprovalQueue(user),
  loadRunViews: loadRenewalRunViews,
  now: () => new Date(),
};

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

export async function gatherAttentionQueue(
  user: AuthenticatedUser,
  dependencies: AttentionQueueDependencies = defaultDependencies,
): Promise<AttentionQueue> {
  const canSeeRenewals = hasSpaceAccess(user, "renewals");
  const [queueResult, viewsResult] = await Promise.allSettled([
    dependencies.listQueue(user),
    canSeeRenewals ? dependencies.loadRunViews(user) : Promise.resolve(null),
  ]);

  const unavailableFeeds: AttentionQueueFeed[] = [];
  let queueItems: ApprovalQueueItemRecord[] = [];
  if (queueResult.status === "fulfilled") {
    queueItems = queueResult.value;
  } else {
    unavailableFeeds.push("approval_queue");
    console.error(
      `Attention queue approval read failed (${errorClass(queueResult.reason)}).`,
    );
  }

  let renewalBoard;
  let writebackQueue;
  if (canSeeRenewals) {
    try {
      if (viewsResult.status !== "fulfilled" || viewsResult.value === null)
        throw viewsResult.status === "rejected" ? viewsResult.reason : new Error();
      renewalBoard = buildRenewalReviewBoard(viewsResult.value);
      writebackQueue = buildWritebackApprovalQueue(viewsResult.value);
    } catch (error) {
      unavailableFeeds.push("renewal_reviews");
      console.error(`Attention queue renewal review read failed (${errorClass(error)}).`);
    }
  }

  const eligibleFeeds = canSeeRenewals ? 2 : 1;
  const state: AttentionQueueState =
    unavailableFeeds.length === 0
      ? "ok"
      : unavailableFeeds.length >= eligibleFeeds
        ? "unavailable"
        : "partial";

  const inbox = buildNeedsDecisionInbox(queueItems, renewalBoard, writebackQueue, user);
  const itemsById = new Map(queueItems.map((item) => [item.id, item]));
  const rows: AttentionQueueRow[] = inbox.rows.map((row) => {
    const item = row.itemId ? itemsById.get(row.itemId) : undefined;
    const authority: AttentionAuthority =
      row.kind !== "queue_item"
        ? "review"
        : row.canApproveInline
          ? "approve_inline"
          : item && queueActionAvailability(user, item).approve
            ? "approve"
            : "view";
    return {
      key: row.key,
      kind: row.kind,
      label: row.label,
      detail: row.detail,
      severity: row.severity,
      href: row.href,
      authority,
      ...(row.kind === "queue_item" && row.itemId ? { itemId: row.itemId } : {}),
    };
  });

  return {
    state,
    rows: state === "unavailable" ? [] : rows,
    unavailableFeeds,
    seeAllHref: canSeeRenewals ? "/approval-queue" : "/notifications",
    checkedAtIso: dependencies.now().toISOString(),
  };
}

/** The value the Dashboard renders when the gather itself could not run. Never a count. */
export function unavailableAttentionQueue(now: Date = new Date()): AttentionQueue {
  return {
    state: "unavailable",
    rows: [],
    unavailableFeeds: [...ATTENTION_QUEUE_FEEDS],
    seeAllHref: "/notifications",
    checkedAtIso: now.toISOString(),
  };
}
