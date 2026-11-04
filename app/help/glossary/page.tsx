import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpGlossaryBody, HelpPrintFooter } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { HELP_GLOSSARY_HREF } from "@/lib/help/links";

// S243 R-S243-3: every term a new staff member meets, in plain words.
export default async function HelpGlossaryRoute() {
  const user = await requirePageCapability("read");
  return (
    <AppShell user={user}>
      <HelpFrame currentHref={HELP_GLOSSARY_HREF}>
        <HelpPrintFooter title="Glossary" />
        <HelpGlossaryBody />
      </HelpFrame>
    </AppShell>
  );
}
