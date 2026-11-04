import { redirect } from "next/navigation";

import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpGuidePage, HelpLanding } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { helpGuide, helpSection } from "@/lib/help";
import { HELP_ROOT, helpGuideHref, helpSectionHref } from "@/lib/help/links";
import { helpServingCommit } from "@/lib/help/serving-release";

// S242 R-S242-5: `/help/<section>/<guide>#<step-id>`. A guide id this section no longer has lands on
// the section page with the "This guide moved" line; an unknown section lands on the Help landing.
export default async function HelpGuideRoute({
  params,
}: Readonly<{ params: Promise<{ section: string; guide: string }> }>) {
  const user = await requirePageCapability("read");
  const { section: sectionId, guide: guideId } = await params;
  const section = helpSection(sectionId);
  const guide = section ? helpGuide(section.id, guideId) : undefined;
  if (section && !guide) redirect(`${helpSectionHref(section.id)}?moved=1`);
  return (
    <AppShell user={user}>
      {section && guide ? (
        <HelpFrame
          currentGroup={section.id}
          currentHref={helpGuideHref(section.id, guide.id)}
        >
          <HelpGuidePage guide={guide} servingCommit={helpServingCommit()} />
        </HelpFrame>
      ) : (
        <HelpFrame currentHref={HELP_ROOT}>
          <HelpLanding moved servingCommit={helpServingCommit()} />
        </HelpFrame>
      )}
    </AppShell>
  );
}
