import { RenewalTeamLineSlot } from "@/components/attention/RenewalTeamLine";
import { AppShell } from "@/components/layout/AppShell";
import { WorkAccountabilityBoard } from "@/components/work/WorkAccountabilityBoard";
import { loadRenewalTeamLine } from "@/lib/attention/renewal-team-line-read";
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
  // S280 R-S280-2: My Work's empty state carries the team's renewal line. Started, not awaited, so
  // the task list never waits for it; null for a user without renewals.
  const teamLine = loadRenewalTeamLine(user).catch(() => null);

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
          emptyAside={<RenewalTeamLineSlot line={teamLine} />}
          mode="mine"
          mutationAllowed={mutationAllowed}
          spaces={spaces}
        />
      </main>
    </AppShell>
  );
}
