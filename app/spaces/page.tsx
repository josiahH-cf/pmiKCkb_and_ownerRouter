import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { launchSpaces, spaceHref } from "@/lib/spaces";

export default async function SpacesPage() {
  const user = await requirePageCapability("read");

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Spaces</h1>
        <div className="grid three">
          {launchSpaces.map((space) => (
            <article className="panel" key={space.id}>
              <h2>{space.name}</h2>
              <p className="muted">{space.processCategory}</p>
              {space.readOnly ? (
                <p className="muted">Reference space (read-only)</p>
              ) : (
                <p className="muted">Process space</p>
              )}
              <Link className="text-link" href={spaceHref(space)}>
                Open Space
              </Link>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
