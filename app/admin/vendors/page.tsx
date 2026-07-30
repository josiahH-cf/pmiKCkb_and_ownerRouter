import Link from "next/link";

import {
  LiveVendorLifecyclePanel,
  type LiveVendorLifecycleAvailability,
} from "@/components/admin/LiveVendorLifecyclePanel";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { isProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import { assertExplicitProductionLive } from "@/lib/vendor/live-lifecycle-service";

export const dynamic = "force-dynamic";

export default async function LiveVendorLifecyclePage() {
  await requirePageSpaceAccess("maintenance");
  const user = await requirePageCapability("manageAdmin");
  let liveControlsAllowed = false;
  try {
    assertExplicitProductionLive(requireEnvironmentDescriptor());
    liveControlsAllowed = true;
  } catch {
    // The page stays reachable for a truthful explanation, but no Live control is
    // rendered outside an explicitly configured Production+Live deployment.
  }
  const [inviteExecutable, assignmentExecutable, disableExecutable] = await Promise.all([
    isProductionRuntimeActionExecutable("vendor.account.invite"),
    isProductionRuntimeActionExecutable("vendor.assignment.change"),
    isProductionRuntimeActionExecutable("vendor.account.disable"),
  ]);
  const availability: LiveVendorLifecycleAvailability = {
    "vendor.account.invite": inviteExecutable,
    "vendor.assignment.change": assignmentExecutable,
    "vendor.account.disable": disableExecutable,
  };

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/admin">
          Back to Admin
        </Link>
        <h1 className="section-title">Live Vendor administration</h1>
        {liveControlsAllowed ? (
          <>
            <p className="muted">
              Each control reflects its exact committed Production gate. Closed actions
              remain visible as unavailable readiness context; an individually opened
              action can prepare one exact preview at a time.
            </p>
            <LiveVendorLifecyclePanel availability={availability} />
          </>
        ) : (
          <article className="panel">
            <h2>Live controls are unavailable here</h2>
            <p className="muted">
              Vendor lifecycle controls appear only in an explicitly configured Production
              environment using Live data.
            </p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
