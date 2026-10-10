import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { MaintenanceVendorRoster } from "@/components/maintenance/MaintenanceVendorRoster";
export default async function MaintenanceVendorsPage() {
  await requirePageSpaceAccess("maintenance");
  const actor = await requirePageCapability("read");
  return (
    <AppShell user={actor}>
      <main className="content">
        <Link href="/maintenance">Back to maintenance</Link>
        <h1>Maintenance vendors</h1>
        <Suspense fallback={<p role="status">Loading vendor controls…</p>}>
          <MaintenanceVendorRoster
            actorUid={actor.uid}
            canManage={actor.role === "Admin"}
          />
        </Suspense>
        <p>
          Account invitations, setup, assignment and recovery use the existing{" "}
          <Link href="/admin">Admin vendor lifecycle controls</Link>.
        </p>
      </main>
    </AppShell>
  );
}
