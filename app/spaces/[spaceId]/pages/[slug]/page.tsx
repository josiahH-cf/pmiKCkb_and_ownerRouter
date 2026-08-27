import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { OperationalPageRenderer } from "@/components/operational-pages/OperationalPageRenderer";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readPublishedOperationalPage } from "@/lib/firestore/operational-pages";

export default async function OperationalProcessPage({
  params,
}: Readonly<{ params: Promise<{ spaceId: string; slug: string }> }>) {
  const actor = await requirePageCapability("read");
  const { spaceId, slug } = await params;
  const version = await readPublishedOperationalPage(actor, spaceId, slug);
  if (!version) notFound();

  return (
    <AppShell user={actor}>
      <section className="content ui-stack">
        <Link className="back-link" href={`/spaces/${spaceId}`}>
          Back to Space
        </Link>
        <OperationalPageRenderer definition={version.definition} />
        <p className="muted">
          Published read-only page · version {version.versionNumber} · no actions or
          external effects
        </p>
      </section>
    </AppShell>
  );
}
