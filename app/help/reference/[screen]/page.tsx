import { redirect } from "next/navigation";

import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpPrintButton } from "@/components/help/HelpPrintButton";
import { HelpPrintFooter, HelpScreenBody } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { helpScreen } from "@/lib/help";
import { HELP_REFERENCE_HREF, helpScreenHref } from "@/lib/help/links";
import { helpServingCommit } from "@/lib/help/serving-release";

// S243 R-S243-2: one screen reference. An unknown screen id lands on the reference index with the
// "This guide moved" line.
export default async function HelpScreenRoute({
  params,
}: Readonly<{ params: Promise<{ screen: string }> }>) {
  const user = await requirePageCapability("read");
  const { screen: screenId } = await params;
  const screen = helpScreen(screenId);
  if (!screen) redirect(`${HELP_REFERENCE_HREF}?moved=1`);
  return (
    <AppShell user={user}>
      <HelpFrame currentGroup="reference" currentHref={helpScreenHref(screen.id)}>
        <HelpPrintFooter title={screen.title} />
        <div className="help-page-actions help-print-hide">
          <HelpPrintButton label="Print this guide" />
        </div>
        <HelpScreenBody screen={screen} servingCommit={helpServingCommit()} />
      </HelpFrame>
    </AppShell>
  );
}
