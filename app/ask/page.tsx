import { AppShell } from "@/components/layout/AppShell";
import { ConsoleView } from "@/components/console/ConsoleView";
import { requirePageCapability } from "@/lib/auth/page-guards";

// /ask is preserved (smoke:ask-live / smoke:auth-live assert this URL). It renders the same Console
// as the home route via the shared ConsoleView.
export default async function AskPage() {
  const user = await requirePageCapability("read");

  return (
    <AppShell user={user}>
      <ConsoleView user={user} />
    </AppShell>
  );
}
