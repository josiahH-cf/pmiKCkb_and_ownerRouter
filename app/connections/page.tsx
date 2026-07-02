import { AppShell } from "@/components/layout/AppShell";
import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";
import { buildConnectionView } from "@/lib/connections/connection-status";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import {
  getVerifiedConnectorIds,
  LIVE_VERIFIABLE_CONNECTOR_IDS,
} from "@/lib/connections/verification";

// The Connection Center. Status combines configuration PRESENCE (never values) with the cached
// read-only live checks (S13 D1), so a working connector finally shows "Connected". Every role can
// SEE the truth; only Admins get the setup wizard and the fresh-verify button (decision 6 / D5).
export default async function ConnectionsPage() {
  const user = await requirePageCapability("read");
  const verifiedIds = await getVerifiedConnectorIds();
  const view = buildConnectionView(readConnectorPresence(), verifiedIds);

  return (
    <AppShell user={user}>
      <section className="content">
        <ConnectionCenter
          canManage={can(user.role, "manageAdmin")}
          verifiableIds={LIVE_VERIFIABLE_CONNECTOR_IDS}
          view={view}
        />
      </section>
    </AppShell>
  );
}
