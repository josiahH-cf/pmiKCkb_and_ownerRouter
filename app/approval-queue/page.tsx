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

export default async function ApprovalQueuePage() {
  const user = await requirePageCapability("read");
  let initialActivity: ApprovalQueueActivityRecord[] = [];
  let items: ApprovalQueueItemRecord[] = [];
  let initialError: string | undefined;

  try {
    items = await listApprovalQueue(user);
    if (items[0]) {
      initialActivity = await listApprovalQueueActivity(user, items[0].id);
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
        />
      </section>
    </AppShell>
  );
}
