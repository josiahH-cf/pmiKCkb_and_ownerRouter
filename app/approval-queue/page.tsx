import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";

export default async function ApprovalQueuePage() {
  const user = await requirePageCapability("read");

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Approval Queue</h1>
        <div className="panel">
          <p>No in-review items are present in the local scaffold.</p>
        </div>
      </section>
    </AppShell>
  );
}
