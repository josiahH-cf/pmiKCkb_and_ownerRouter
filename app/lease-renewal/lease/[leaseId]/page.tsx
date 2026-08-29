import { redirect } from "next/navigation";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

/** Historical sample-workspace links now return to the canonical Live Renewal desk. */
export default async function LeaseRenewalWorkspacePage() {
  await requirePageSpaceAccess("renewals");
  await requirePageCapability(renewalRoleCapability("read_workspace"));
  redirect("/lease-renewal/live/desk");
}
