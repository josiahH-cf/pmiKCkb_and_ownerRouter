import { AppShell } from "@/components/layout/AppShell";
import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { hasSpaceAccess } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { loadTestOperationalHandoffs } from "@/lib/operations/test-handoff-loader";

// Compatibility route for workflow-linked Gmail attention. Firebase auth identifies the app user;
// server-side DWD authorization independently determines whether the Gmail connection succeeds.
export default async function GmailHubPage() {
  const user = await requirePageCapability("read");
  const testHandoffs = await loadTestOperationalHandoffs(user, {
    lease: hasSpaceAccess(user, "renewals"),
    maintenance: hasSpaceAccess(user, "maintenance"),
    limitPerKind: 5,
  });
  return (
    <AppShell user={user}>
      <GmailHubHome
        authenticatedEmail={user.email}
        canManageAdmin={can(user.role, "manageAdmin")}
        operationalHandoffs={testHandoffs}
      />
    </AppShell>
  );
}
