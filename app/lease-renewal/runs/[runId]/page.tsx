import { redirect } from "next/navigation";
import { requirePageSpaceAccess } from "@/lib/auth/page-guards";

/** Compatibility redirect for persisted renewal links; no Test/sample run is reconstructed. */
export default async function LeaseRenewalRunPage() {
  await requirePageSpaceAccess("renewals");
  redirect("/lease-renewal/live");
}
