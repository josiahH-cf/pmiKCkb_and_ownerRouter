import { AppShell } from "@/components/layout/AppShell";
import { ApprovalQueueDemo } from "@/components/approval/ApprovalQueueDemo";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { demoLeaseRenewals } from "@/lib/demo/data";

export default async function ApprovalQueuePage() {
  const user = await requirePageCapability("read");
  const items = [
    ...demoLeaseRenewals.sops.map((sop) => ({
      id: sop.id,
      kind: "SOP" as const,
      status: sop.status,
      title: sop.title,
    })),
    ...demoLeaseRenewals.templates.map((template) => ({
      id: template.id,
      kind: "Template" as const,
      status: template.status,
      title: template.name,
    })),
    ...demoLeaseRenewals.placeholders.map((placeholder) => ({
      id: placeholder.id,
      kind: "Placeholder" as const,
      status: placeholder.status,
      title: placeholder.missing_detail,
    })),
  ];

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Approval Queue</h1>
        <ApprovalQueueDemo canApprove={can(user.role, "approve")} items={items} />
      </section>
    </AppShell>
  );
}
