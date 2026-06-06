import { AppShell } from "@/components/layout/AppShell";
import { ProcessDefinitionListClient } from "@/components/workflows/ProcessDefinitionListClient";
import { can } from "@/lib/auth/roles";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";

export default async function ProcessesPage() {
  const user = await requirePageCapability("read");
  let definitions: ProcessDefinitionRecord[] = [];
  let initialError: string | undefined;

  try {
    definitions = await listProcessDefinitions(user);
  } catch {
    initialError =
      "Workflow definitions are unavailable. Refresh Google credentials or check Firestore setup.";
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Processes</h1>
        <ProcessDefinitionListClient
          canEdit={can(user.role, "edit")}
          currentUserUid={user.uid}
          initialDefinitions={definitions}
          initialError={initialError}
        />
      </section>
    </AppShell>
  );
}
