import { AppShell } from "@/components/layout/AppShell";
import { ApprovalQueueDemo } from "@/components/approval/ApprovalQueueDemo";
import { loadApprovalQueue } from "@/lib/approval/queue";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";

export default async function ApprovalQueuePage() {
  const user = await requirePageCapability("read");
  const { apiBacked, items } = await loadApprovalQueue(user);

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Approval Queue</h1>
        <ApprovalQueueDemo
          actorUid={user.uid}
          apiBacked={apiBacked}
          canApprove={can(user.role, "approve")}
          items={items}
        />
      </section>
    </AppShell>
  );
}
