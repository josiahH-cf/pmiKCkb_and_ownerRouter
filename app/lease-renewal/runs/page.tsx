import { redirect } from "next/navigation";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

/** Compatibility redirect for historical links; the browser Test-run index is retired. */
export default async function LeaseRenewalRunsPage() {
  await requirePageSpaceAccess("renewals");
  await requirePageCapability(renewalRoleCapability("read_workspace"));
  redirect("/lease-renewal/live");
}
