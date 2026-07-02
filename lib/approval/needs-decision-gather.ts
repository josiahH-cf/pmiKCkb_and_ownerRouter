// Server gather for the unified "Needs your decision" picture OUTSIDE the Approval Queue page (S13
// B5 — the interlock). The queue page assembles its own feeds; every OTHER surface that answers
// "what is waiting on me?" (the Console approvals answer, the Spaces directory card) calls THIS one
// gather per request and projects from the result, so the same value-free, deduped picture appears
// everywhere and no surface can answer "Nothing" while another shows work waiting.
//
// Read-only and non-fatal by construction: each feed degrades independently to empty on a Firestore
// hiccup, and only value-free fields cross out of the gather (the values stay behind each row's href).

import { canViewApprovalQueueItem } from "@/lib/approval/queue";
import {
  buildNeedsDecisionInbox,
  type NeedsDecisionInbox,
} from "@/lib/approval/needs-decision-inbox";
import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildWritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { listApprovalQueue } from "@/lib/firestore/approval-queue";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import { loadRenewalRunViews } from "@/lib/lease-renewal/renewal-review-board";

/**
 * Build the merged, value-free "Needs your decision" inbox for surfaces outside the Approval Queue
 * page. Queue items are narrowed to what this user may see (`canViewApprovalQueueItem`); the renewal
 * feeds come from the ONE existing run-views gather. Never throws.
 */
export async function gatherNeedsDecisionInbox(
  user: AuthenticatedUser,
): Promise<NeedsDecisionInbox> {
  let queueItems: ApprovalQueueItemRecord[] = [];
  try {
    const items = await listApprovalQueue(user);
    queueItems = items.filter((item) => canViewApprovalQueueItem(user, item));
  } catch {
    queueItems = [];
  }

  let renewalBoard;
  let writebackQueue;
  try {
    const views = await loadRenewalRunViews(user);
    renewalBoard = buildRenewalReviewBoard(views);
    writebackQueue = buildWritebackApprovalQueue(views);
  } catch {
    renewalBoard = undefined;
    writebackQueue = undefined;
  }

  return buildNeedsDecisionInbox(queueItems, renewalBoard, writebackQueue);
}

/**
 * The value-free "N waiting on you" count for the lease-renewal Space card: open renewal flags plus
 * write-backs awaiting approval, deduped by the inbox (a field queued for write-back counts once).
 */
export function renewalWaitingCount(inbox: NeedsDecisionInbox): number {
  return inbox.counts.renewalFlags + inbox.counts.writebacksAwaiting;
}
