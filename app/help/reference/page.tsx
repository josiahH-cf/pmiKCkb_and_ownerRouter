import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpReferenceIndex } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { HELP_REFERENCE_HREF } from "@/lib/help/links";

// S243 R-S243-2: the index of screen references.
export default async function HelpReferenceRoute({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const user = await requirePageCapability("read");
  const search = (await searchParams) ?? {};
  return (
    <AppShell user={user}>
      <HelpFrame currentGroup="reference" currentHref={HELP_REFERENCE_HREF}>
        <HelpReferenceIndex moved={search.moved !== undefined} />
      </HelpFrame>
    </AppShell>
  );
}
