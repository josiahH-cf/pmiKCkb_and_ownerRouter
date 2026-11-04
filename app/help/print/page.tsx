import { HelpWholeManual } from "@/components/help/HelpViews";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { helpServingCommit } from "@/lib/help/serving-release";

// S242 R-S242-6: the whole manual in table-of-contents order as one printable document. Printing
// uses the browser's own dialog; no PDF is generated on the server.
export default async function HelpPrintRoute() {
  const user = await requirePageCapability("read");
  return (
    <AppShell user={user}>
      <main className="content content--reading help-print-root">
        <HelpWholeManual servingCommit={helpServingCommit()} />
      </main>
    </AppShell>
  );
}
