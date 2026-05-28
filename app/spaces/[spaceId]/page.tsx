import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SpaceDetailClient } from "@/components/spaces/SpaceDetailClient";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";
import { demoLeaseRenewals } from "@/lib/demo/data";
import { launchSpaces } from "@/lib/spaces";

interface SpaceDetailPageProps {
  params: Promise<{ spaceId: string }>;
}

export default async function SpaceDetailPage({ params }: SpaceDetailPageProps) {
  const user = await requirePageCapability("read");
  const { spaceId } = await params;
  const space = launchSpaces.find((candidate) => candidate.id === spaceId);

  if (!space) {
    notFound();
  }

  const config = readServerConfig();
  const isLeaseRenewals = space.id === "lease-renewals";

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/spaces">
          Back to Spaces
        </Link>
        <div className="section-heading-row">
          <div>
            <h1 className="section-title">{space.name}</h1>
            <p className="muted">
              {space.processCategory}
              {space.readOnly ? " - Read-only" : " - KB-owned process"}
            </p>
          </div>
          {config.askDemoMode ? <span className="review-pill">Local demo</span> : null}
        </div>

        {isLeaseRenewals ? (
          <SpaceDetailClient
            canApprove={can(user.role, "approve")}
            readOnly={space.readOnly}
            seed={demoLeaseRenewals}
          />
        ) : (
          <div className="panel">
            <h2>Space scaffold</h2>
            <p className="muted">
              This Space is listed for launch planning. The first working demo slice is
              Lease Renewals.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
