// S147 compact Dashboard attention queue. A projection of the existing needs-decision eligibility,
// dedup keys and inline-approve rule, gathered per feed so a failed read is reported as unavailable
// or partial instead of the all-clear the old Dashboard card fell back to. It covers the signed-in
// user's actual scopes: approval-queue items reach every reader they are addressed to (the same
// recipient rule Notifications uses), and renewal flags and write-backs need the Renewals Space.
// Read-only and value-free: labels, PII-free detail, severity and an in-app link only.
//
// S280: the queue also lists the renewal work that follows from the viewer's own messages
// (R-S280-1, one source keyed by lease, audience and kind), names the lease on every difference row
// (R-S280-3), and keeps its last renewal rows with their read time when the renewal read is older
// than its freshness limit (R-S280-4). A retained row is information until the existing current
// read; nothing here decides, sends or writes.

import { queueActionAvailability } from "@/lib/approval/queue";
import type { AttentionFollowThroughRow } from "@/lib/attention/renewal-follow-through";
import {
  readOwnRenewalFollowThrough,
  type OwnFollowThroughRead,
} from "@/lib/attention/renewal-follow-through-read";
import {
  buildNeedsDecisionInbox,
  type NeedsDecisionKind,
} from "@/lib/approval/needs-decision-inbox";
import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildWritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { listApprovalQueue } from "@/lib/firestore/approval-queue";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import {
  revalidateStaleLiveLeaseSnapshot,
  settleLiveLeaseRefresh,
} from "@/lib/lease-renewal/live-lease-cache";
import { loadRenewalRunViews } from "@/lib/lease-renewal/renewal-review-board";
import type { Severity } from "@/lib/lease-renewal/severity";
import {
  RenewalReviewUnavailableError,
  type RenewalReviewReadIssue,
} from "@/lib/lease-renewal/review-readiness";

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
  /**
   * S280 ARCH-S280-3: a renewal row kept from a read older than its freshness limit. Information
   * until the existing current read; its review surface still requires that read to decide.
   */
  readonly retained?: true;
}

/** S280 ARCH-S280-3: whether the renewal rows are current or kept from an older read. */
export interface AttentionRenewalRead {
  readonly state: "current" | "retained";
  /** When the renewal read behind the rows was made; null when unknown. */
  readonly readAtIso: string | null;
}

export interface AttentionQueue {
  readonly state: AttentionQueueState;
  readonly rows: readonly AttentionQueueRow[];
  /** Feeds that did not answer, by stable key. */
  readonly unavailableFeeds: readonly AttentionQueueFeed[];
  /** The full approval list this user can open. */
  readonly seeAllHref: string;
  readonly checkedAtIso: string;
  /** Fixed reason for a renewal-feed hold; never a raw provider error. */
  readonly renewalReviewIssue?: RenewalReviewReadIssue;
  /** S280 R-S280-1: the renewal work that follows from the viewer's own messages. */
  readonly followThrough?: readonly AttentionFollowThroughRow[];
  /** S280: "unavailable" when the viewer's own renewal messages could not be read. */
  readonly followThroughState?: "ok" | "unavailable";
  readonly followThroughIncomplete?: true;
  /** S280 R-S280-4: present when renewal rows were read; says whether they are retained. */
  readonly renewalRead?: AttentionRenewalRead;
}

export interface AttentionQueueDependencies {
  readonly listQueue: (user: AuthenticatedUser) => Promise<ApprovalQueueItemRecord[]>;
  readonly loadRunViews: typeof loadRenewalRunViews;
  readonly now: () => Date;
  /** Starts a stale lease revalidation without notice admission; see gatherAttentionQueue. */
  readonly revalidateLeaseSource?: (nowMs: number) => void;
  /** Waits, bounded, for a lease read already in flight; resolves whether one settled. */
  readonly settleLeaseRefresh?: (maxWaitMs: number) => Promise<boolean>;
  /** S280 R-S280-1: the viewer's own renewal follow-through; omitted means not gathered. */
  readonly loadFollowThrough?: (
    user: AuthenticatedUser,
    nowMs: number,
  ) => Promise<OwnFollowThroughRead>;
}

export interface AttentionQueueOptions {
  /**
   * Set only for a person's explicit re-read (Try again, or the refresh after an inline Approve):
   * wait at most this long for a lease read already in flight, such as the stale revalidation the
   * gather starts, before the review read, so the answer reflects the refreshed source instead of
   * the same stale one. The Dashboard's first render never waits.
   */
  readonly awaitLeaseRefreshMs?: number;
}

/** How long a re-read waits for an in-flight lease read; well inside the browser's 60 s wait. */
export const ATTENTION_REREAD_LEASE_WAIT_MS = 30_000;

const defaultDependencies: AttentionQueueDependencies = {
  listQueue: (user) => listApprovalQueue(user),
  loadRunViews: loadRenewalRunViews,
  now: () => new Date(),
  revalidateLeaseSource: (nowMs) => {
    const config = buildLiveRenewalConfig();
    if (config.ok) revalidateStaleLiveLeaseSnapshot(config.rentvineClient, nowMs);
  },
  settleLeaseRefresh: settleLiveLeaseRefresh,
  loadFollowThrough: (user, nowMs) => readOwnRenewalFollowThrough(user, nowMs),
};

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

export async function gatherAttentionQueue(
  user: AuthenticatedUser,
  dependencies: AttentionQueueDependencies = defaultDependencies,
  options: AttentionQueueOptions = {},
): Promise<AttentionQueue> {
  const canSeeRenewals = hasSpaceAccess(user, "renewals");
  // Before the admitted review read below: when the shared lease generation is stale, start its
  // revalidation without notice admission, as the Dashboard did before S147. Otherwise the review
  // read's own admitted refresh raises the notice floor and a renewal desk opened alongside the
  // Dashboard waits out the whole provider read.
  if (canSeeRenewals) {
    try {
      dependencies.revalidateLeaseSource?.(dependencies.now().getTime());
    } catch {
      // Best effort: the admitted review read keeps its own refresh behavior.
    }
  }
  const loadViews = async () => {
    if (!canSeeRenewals) return null;
    const waitMs = options.awaitLeaseRefreshMs ?? 0;
    if (waitMs > 0) {
      try {
        await dependencies.settleLeaseRefresh?.(waitMs);
      } catch {
        // Best effort: an unfinished refresh leaves the review read to report the source honestly.
      }
    }
    return dependencies.loadRunViews(user);
  };
  const loadFollowThrough = async (): Promise<OwnFollowThroughRead | null> =>
    canSeeRenewals && dependencies.loadFollowThrough
      ? dependencies.loadFollowThrough(user, dependencies.now().getTime())
      : null;
  const [queueResult, viewsResult, followThroughResult] = await Promise.allSettled([
    dependencies.listQueue(user),
    loadViews(),
    loadFollowThrough(),
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
  let renewalReviewIssue: RenewalReviewReadIssue | undefined;
  let renewalRead: AttentionRenewalRead | undefined;
  if (canSeeRenewals) {
    try {
      if (viewsResult.status !== "fulfilled" || viewsResult.value === null)
        throw viewsResult.status === "rejected" ? viewsResult.reason : new Error();
      renewalBoard = buildRenewalReviewBoard(viewsResult.value);
      writebackQueue = buildWritebackApprovalQueue(viewsResult.value);
      renewalRead = { state: "current", readAtIso: null };
    } catch (error) {
      if (error instanceof RenewalReviewUnavailableError && error.retained) {
        // S280 R-S280-4: the read is older than its freshness limit. Keep its rows, marked
        // retained with their read time; deciding on any of them still needs the current read.
        renewalBoard = buildRenewalReviewBoard(error.retained.views);
        writebackQueue = buildWritebackApprovalQueue(error.retained.views);
        renewalRead = { state: "retained", readAtIso: error.retained.readAtIso };
      } else {
        if (error instanceof RenewalReviewUnavailableError)
          renewalReviewIssue = error.issue;
        unavailableFeeds.push("renewal_reviews");
        console.error(
          `Attention queue renewal review read failed (${errorClass(error)}).`,
        );
      }
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
      ...(renewalRead?.state === "retained" && row.kind !== "queue_item"
        ? { retained: true as const }
        : {}),
    };
  });

  // S280 R-S280-1: the viewer's own follow-through, gathered beside the feeds. A failed read lists
  // nothing and says so; it never changes the decision feeds' state.
  const followThrough =
    followThroughResult.status === "fulfilled" ? followThroughResult.value : null;
  const followThroughFields =
    followThrough && followThrough.state !== "not_eligible"
      ? {
          followThrough: followThrough.rows,
          followThroughState: followThrough.state,
          ...(followThrough.incomplete ? { followThroughIncomplete: true as const } : {}),
        }
      : canSeeRenewals && dependencies.loadFollowThrough && !followThrough
        ? { followThrough: [], followThroughState: "unavailable" as const }
        : {};

  return {
    state,
    rows: state === "unavailable" ? [] : rows,
    unavailableFeeds,
    seeAllHref: canSeeRenewals ? "/approval-queue" : "/notifications",
    checkedAtIso: dependencies.now().toISOString(),
    ...(renewalReviewIssue ? { renewalReviewIssue } : {}),
    ...(renewalRead ? { renewalRead } : {}),
    ...followThroughFields,
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
