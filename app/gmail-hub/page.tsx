import { AppShell } from "@/components/layout/AppShell";
import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";

// /gmail-hub — a self-mailbox live workspace built to the S19 gates, with the S15 pasted-text and
// browser simulator retained as an explicitly labeled fallback. Firebase auth identifies the app user;
// server-side DWD authorization independently determines whether the live Gmail connection succeeds.
export default async function GmailHubPage() {
  const user = await requirePageCapability("read");
  return (
    <AppShell user={user}>
      <GmailHubHome
        authenticatedEmail={user.email}
        canCompose={can(user.role, "edit")}
        canSend={can(user.role, "sendEmail")}
        canLabel={can(user.role, "edit")}
      />
    </AppShell>
  );
}
