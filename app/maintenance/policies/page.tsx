import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { MaintenanceOperatingPolicies } from "@/components/maintenance/MaintenanceOperatingPolicies";
export default async function MaintenancePoliciesPage() {
  await requirePageSpaceAccess("maintenance");
  const actor = await requirePageCapability("read");
  return (
    <AppShell user={actor}>
      <main className="content content--workspace">
        <MaintenanceOperatingPolicies
          actorUid={actor.uid}
          canManage={actor.role === "Admin"}
        />
      </main>
    </AppShell>
  );
}
