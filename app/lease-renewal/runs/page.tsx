import { redirect } from "next/navigation";
import { requirePageSpaceAccess } from "@/lib/auth/page-guards";

/** Compatibility redirect for historical links; the browser Test-run index is retired. */
export default async function LeaseRenewalRunsPage() {
  await requirePageSpaceAccess("renewals");
  redirect("/lease-renewal/live");
}
