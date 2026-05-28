import { AppShell } from "@/components/layout/AppShell";
import { requirePageRole } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";

export default async function AdminPage() {
  const user = await requirePageRole("Admin");
  const config = readServerConfig();

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Admin</h1>
        <div className="grid three">
          <article className="panel">
            <h2>Domain</h2>
            <p>{config.allowedHostedDomain}</p>
          </article>
          <article className="panel">
            <h2>Approval Label</h2>
            <p>{config.kbApprovalLabel}</p>
          </article>
          <article className="panel">
            <h2>Indexing</h2>
            <p className="muted">
              {config.askDemoMode
                ? "Demo retrieval mode is active."
                : "Live retrieval mode expects configured Vertex data stores."}
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
