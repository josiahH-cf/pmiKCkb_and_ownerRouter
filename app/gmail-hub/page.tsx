import { AppShell } from "@/components/layout/AppShell";
import { GmailHubHome } from "@/components/gmail-hub/GmailHubHome";
import { requirePageCapability } from "@/lib/auth/page-guards";

// /gmail-hub — the Gmail workflow hub, built app-plane TO-THE-GATE. Read-capability page: any signed-in
// operator can draft, template, and summarize over pasted text. Every live-mailbox affordance renders
// "Waiting on Gmail access"; no route it reaches performs a Gmail read or send (owner decision D3).
export default async function GmailHubPage() {
  const user = await requirePageCapability("read");
  return (
    <AppShell user={user}>
      <GmailHubHome />
    </AppShell>
  );
}
