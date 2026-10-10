import { AppShell } from "@/components/layout/AppShell";
import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";
import { requirePageCapability } from "@/lib/auth/page-guards";

// Compatibility route for workflow-linked Gmail attention. Firebase auth identifies the app user;
// server-side DWD authorization independently determines whether the Gmail connection succeeds.
export default async function GmailHubPage() {
  const user = await requirePageCapability("read");
  return (
    <AppShell user={user}>
      <GmailHubHome authenticatedEmail={user.email} />
    </AppShell>
  );
}
