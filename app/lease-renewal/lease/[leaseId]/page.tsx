import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { getRenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";

interface LeaseWorkspacePageProps {
  params: Promise<{ leaseId: string }>;
}

// One lease's renewal workspace (read-only / draft-only sample data).
export default async function LeaseRenewalWorkspacePage({
  params,
}: LeaseWorkspacePageProps) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("read");
  const { leaseId } = await params;
  const workspace = getRenewalLeaseWorkspace(leaseId);

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal">
          ← Renewals
        </Link>
        {workspace ? (
          <RenewalWorkspace workspace={workspace} />
        ) : (
          <article className="panel">
            <p className="muted">This renewal is unavailable.</p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
