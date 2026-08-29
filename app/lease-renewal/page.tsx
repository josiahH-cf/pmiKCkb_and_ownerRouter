import { redirect } from "next/navigation";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

/** The canonical Renewal entry is the Live desk; Production exposes no sample workspace. */
export default async function LeaseRenewalPage() {
  await requirePageSpaceAccess("renewals");
  await requirePageCapability(renewalRoleCapability("read_workspace"));
  redirect("/lease-renewal/live/desk");
}
