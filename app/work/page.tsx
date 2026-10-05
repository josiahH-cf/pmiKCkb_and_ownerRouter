import { AppShell } from "@/components/layout/AppShell";
import { WorkAccountabilityBoard } from "@/components/work/WorkAccountabilityBoard";
import { requirePageCapability } from "@/lib/auth/page-guards";
import {
  allowsMutation,
  resolveEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { canAccessLaunchSpace } from "@/lib/space-scope-resources";
import { launchSpaces } from "@/lib/spaces";

export default async function MyWorkPage() {
  const user = await requirePageCapability("read");
  const descriptor = resolveEnvironmentDescriptor();
  const mutationAllowed = descriptor.ok && allowsMutation(descriptor.descriptor);
  const spaces = launchSpaces
    .filter(
      (space) =>
        space.showInDirectory !== false &&
        canAccessLaunchSpace(user, space) &&
        !space.readOnly,
    )
    .map(({ id, name }) => ({ id, name }));

  return (
    <AppShell user={user}>
      <main className="content content--workspace ui-stack">
        <div>
          <h1 className="section-title">My work</h1>
          <p className="muted">
            Time is recorded after Start work; pauses and corrections stay visible.
          </p>
        </div>
        <WorkAccountabilityBoard
          mode="mine"
          mutationAllowed={mutationAllowed}
          spaces={spaces}
        />
      </main>
    </AppShell>
  );
}
