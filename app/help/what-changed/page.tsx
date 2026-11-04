import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpWhatChanged } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { HELP_WHAT_CHANGED_HREF } from "@/lib/help/links";
import { helpServingCommit } from "@/lib/help/serving-release";

// S242 R-S242-4: help changelog entries, newest first.
export default async function HelpWhatChangedRoute() {
  const user = await requirePageCapability("read");
  return (
    <AppShell user={user}>
      <HelpFrame currentHref={HELP_WHAT_CHANGED_HREF}>
        <HelpWhatChanged servingCommit={helpServingCommit()} />
      </HelpFrame>
    </AppShell>
  );
}
