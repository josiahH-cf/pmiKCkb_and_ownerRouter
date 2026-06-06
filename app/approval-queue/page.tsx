import { AppShell } from "@/components/layout/AppShell";
import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import { requirePageCapability } from "@/lib/auth/page-guards";
import {
  listApprovalQueue,
  listApprovalQueueActivity,
} from "@/lib/firestore/approval-queue";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";

export default async function ApprovalQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ item_id?: string }>;
}) {
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

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Approval Queue</h1>
        <ApprovalQueue
          currentUser={{ role: user.role, uid: user.uid }}
          initialActivity={initialActivity}
          initialError={initialError}
          initialItems={items}
          initialSelectedItemId={initialSelectedItemId}
        />
      </section>
    </AppShell>
  );
}
