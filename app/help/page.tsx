import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpLanding } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { HELP_ROOT } from "@/lib/help/links";
import { helpServingCommit } from "@/lib/help/serving-release";

// S242 R-S242-1: the Help landing page inside the ordinary signed-in shell. Reading help needs only
// the read capability every staff role has; it writes nothing and calls no provider.
export default async function HelpLandingPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const user = await requirePageCapability("read");
  const search = (await searchParams) ?? {};
  return (
    <AppShell user={user}>
      <HelpFrame currentHref={HELP_ROOT}>
        <HelpLanding
          moved={search.moved !== undefined}
          servingCommit={helpServingCommit()}
        />
      </HelpFrame>
    </AppShell>
  );
}
