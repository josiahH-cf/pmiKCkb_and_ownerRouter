import { AppShell } from "@/components/layout/AppShell";
import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import { requirePageRole } from "@/lib/auth/page-guards";
import { buildConnectionView } from "@/lib/connections/connection-status";
import { readConnectorPresence } from "@/lib/connections/connector-presence";

// The Connection Center (Admin-only). Status is derived from configuration PRESENCE only — no live
// call, no secret value ever read into the page.
export default async function ConnectionsPage() {
  const user = await requirePageRole("Admin");
  const view = buildConnectionView(readConnectorPresence());

  return (
    <AppShell user={user}>
      <section className="content">
        <ConnectionCenter view={view} />
      </section>
    </AppShell>
  );
}
