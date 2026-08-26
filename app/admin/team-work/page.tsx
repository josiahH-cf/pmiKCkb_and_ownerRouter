import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { WorkAccountabilityBoard } from "@/components/work/WorkAccountabilityBoard";
import { requirePageCapability } from "@/lib/auth/page-guards";
import {
  allowsMutation,
  resolveEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { launchSpaces } from "@/lib/spaces";

export default async function TeamWorkPage() {
  const user = await requirePageCapability("manageAdmin");
  const descriptor = resolveEnvironmentDescriptor();
  const mutationAllowed = descriptor.ok && allowsMutation(descriptor.descriptor);
  const spaces = launchSpaces
    .filter((space) => space.showInDirectory !== false && !space.readOnly)
    .map(({ id, name }) => ({ id, name }));

  return (
    <AppShell user={user}>
      <main className="content ui-stack">
        <div>
          <p>
            <Link href="/admin">← Admin</Link>
          </p>
          <p className="eyebrow">Factual internal records</p>
          <h1 className="section-title">Team work</h1>
          <p className="muted">
            Assign bounded tasks, inspect explicit session records, manage expectation
            versions, and correct or retain records. These facts do not automate
            employment decisions.
          </p>
        </div>
        <WorkAccountabilityBoard
          mode="team"
          mutationAllowed={mutationAllowed}
          spaces={spaces}
        />
      </main>
    </AppShell>
  );
}
