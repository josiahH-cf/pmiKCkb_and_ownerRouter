import { AppShell } from "@/components/layout/AppShell";
import { requirePageRole } from "@/lib/auth/page-guards";
import { ALLOWED_HD_DEFAULT, KB_APPROVAL_LABEL } from "@/lib/constants";

export default async function AdminPage() {
  const user = await requirePageRole("Admin");

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Admin</h1>
        <div className="grid three">
          <article className="panel">
            <h2>Domain</h2>
            <p>{process.env.ALLOWED_HD ?? ALLOWED_HD_DEFAULT}</p>
          </article>
          <article className="panel">
            <h2>Approval Label</h2>
            <p>{process.env.KB_APPROVAL_LABEL ?? KB_APPROVAL_LABEL}</p>
          </article>
          <article className="panel">
            <h2>Indexing</h2>
            <p className="muted">
              External integrations are deferred until the integration milestone.
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
