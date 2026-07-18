import { AppShell } from "@/components/layout/AppShell";
import { TestOperationalHandoffPanel } from "@/components/operations/TestOperationalHandoffPanel";
import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import { DecisionMetricsCard } from "@/components/approval/DecisionMetricsCard";
import {
  buildRenewalReviewBoard,
  type RenewalReviewBoard,
} from "@/lib/approval/renewal-review";
import {
  buildDecisionMetrics,
  type DecisionMetrics,
} from "@/lib/lease-renewal/decision-metrics";
import { listAllLeaseRenewalResolutions } from "@/lib/firestore/lease-renewal-resolutions";
import { listAllWritebackApprovals } from "@/lib/firestore/lease-renewal-writeback-approvals";
import {
  buildWritebackApprovalQueue,
  type WritebackApprovalQueue,
} from "@/lib/approval/writeback-approval-queue";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import {
  listApprovalQueue,
  listApprovalQueueActivity,
} from "@/lib/firestore/approval-queue";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";
import { loadRenewalRunViews } from "@/lib/lease-renewal/renewal-review-board";
import { loadTestOperationalHandoffs } from "@/lib/operations/test-handoff-loader";

export default async function ApprovalQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ item_id?: string }>;
}) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("read");
  let initialActivity: ApprovalQueueActivityRecord[] = [];
  let items: ApprovalQueueItemRecord[] = [];
  let initialError: string | undefined;
  const requestedItemId = (await searchParams)?.item_id?.trim();
  let initialSelectedItemId: string | undefined;

  try {
    items = await listApprovalQueue(user);
    initialSelectedItemId =
      items.find((item) => item.id === requestedItemId)?.id ?? items[0]?.id;
    if (initialSelectedItemId) {
      initialActivity = await listApprovalQueueActivity(user, initialSelectedItemId);
    }
  } catch {
    initialError =
      "Approval Queue is unavailable. Refresh Google credentials or check Firestore setup.";
  }

  // The renewal review sub-tab (OQ-UI-1) + the cross-run write-back queue (F-WRITEBACK-QUEUE) are
  // deterministic + degrade on their own; keep them independent of the general queue's Firestore health
  // so one failing does not blank the others. Both project from ONE run-views gather — no extra reads.
  let renewalBoard: RenewalReviewBoard | undefined;
  let writebackQueue: WritebackApprovalQueue | undefined;
  try {
    const renewalViews = await loadRenewalRunViews(user);
    renewalBoard = buildRenewalReviewBoard(renewalViews);
    writebackQueue = buildWritebackApprovalQueue(renewalViews);
  } catch {
    renewalBoard = undefined;
    writebackQueue = undefined;
  }

  // Value-free decision metrics (H1): counts only, degrades independently. Reads the KB-owned decision
  // collections directly (small volume) and projects to a value-free shape.
  let decisionMetrics: DecisionMetrics | undefined;
  try {
    const [resolutions, approvals] = await Promise.all([
      listAllLeaseRenewalResolutions(user),
      listAllWritebackApprovals(user),
    ]);
    decisionMetrics = buildDecisionMetrics({ resolutions, approvals });
  } catch {
    decisionMetrics = undefined;
  }

  const testHandoffs = await loadTestOperationalHandoffs(user, {
    lease: true,
    limitPerKind: 5,
  });

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Approval Queue</h1>
        {decisionMetrics ? <DecisionMetricsCard metrics={decisionMetrics} /> : null}
        <ApprovalQueue
          currentUser={{ role: user.role, uid: user.uid }}
          initialActivity={initialActivity}
          initialError={initialError}
          initialItems={items}
          initialSelectedItemId={initialSelectedItemId}
          renewalBoard={renewalBoard}
          writebackQueue={writebackQueue}
        />
        <TestOperationalHandoffPanel
          handoffs={testHandoffs}
          title="Lease Test decision and handoff projections"
        />
      </section>
    </AppShell>
  );
}
