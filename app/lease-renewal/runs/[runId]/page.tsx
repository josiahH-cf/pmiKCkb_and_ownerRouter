import { redirect } from "next/navigation";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

/** Compatibility redirect for persisted renewal links; no Test/sample run is reconstructed. */
export default async function LeaseRenewalRunPage() {
  await requirePageSpaceAccess("renewals");
  await requirePageCapability(renewalRoleCapability("read_workspace"));
  redirect("/lease-renewal/live");
}
