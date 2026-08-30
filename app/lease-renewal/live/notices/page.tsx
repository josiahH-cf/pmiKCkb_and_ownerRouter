import { redirect } from "next/navigation";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S78 compatibility route. Renewal work has one Product entry; the workspace retains the separately
// guarded unsent-draft control, while this URL grants no draft or provider authority of its own.
export const dynamic = "force-dynamic";

export default async function LiveRenewalNoticesPage() {
  await requirePageSpaceAccess("renewals");
  await requirePageCapability(renewalRoleCapability("read_workspace"));
  redirect("/lease-renewal/live/desk");
}
