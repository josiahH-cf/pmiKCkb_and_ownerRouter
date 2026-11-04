import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpLanding, HelpSectionPage } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { helpSection } from "@/lib/help";
import { HELP_ROOT, helpSectionHref } from "@/lib/help/links";
import { helpServingCommit } from "@/lib/help/serving-release";

// S242 R-S242-5: a section landing. An unknown section falls back to the Help landing with the
// visible "This guide moved" line, never a blank page.
export default async function HelpSectionRoute({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const user = await requirePageCapability("read");
  const { section: sectionId } = await params;
  const search = (await searchParams) ?? {};
  const section = helpSection(sectionId);
  return (
    <AppShell user={user}>
      {section ? (
        <HelpFrame currentGroup={section.id} currentHref={helpSectionHref(section.id)}>
          <HelpSectionPage moved={search.moved !== undefined} section={section} />
        </HelpFrame>
      ) : (
        <HelpFrame currentHref={HELP_ROOT}>
          <HelpLanding moved servingCommit={helpServingCommit()} />
        </HelpFrame>
      )}
    </AppShell>
  );
}
