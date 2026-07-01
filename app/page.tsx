import { AppShell } from "@/components/layout/AppShell";
import { ConsoleView } from "@/components/console/ConsoleView";
import { requirePageCapability } from "@/lib/auth/page-guards";

// Home is the Console (the app's front door). The Console also lives at /ask (preserved route);
// both render the same ConsoleView. Spaces (and their processes) are reached from the nav.
export default async function HomePage() {
  const user = await requirePageCapability("read");

  return (
    <AppShell user={user}>
      <ConsoleView user={user} />
    </AppShell>
  );
}
