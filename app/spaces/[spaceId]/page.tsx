import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SpaceDetailClient } from "@/components/spaces/SpaceDetailClient";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";
import { demoSeedsBySpaceId } from "@/lib/demo/data";
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
  const demoSeed = demoSeedsBySpaceId[space.id];

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

        {demoSeed ? (
          <SpaceDetailClient
            canApprove={can(user.role, "approve")}
            canEdit={can(user.role, "edit")}
            readOnly={space.readOnly}
            seed={demoSeed}
            spaceId={space.id}
            spaceName={space.name}
          />
        ) : (
          <div className="panel">
            <h2>Space scaffold</h2>
            <p className="muted">
              This Space is listed for launch planning. The current editable demo slices
              are Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit
              Disposition, and Owner Onboarding.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
