import { redirect } from "next/navigation";
import { requirePageSpaceAccess } from "@/lib/auth/page-guards";

/** Historical sample-workspace links now return to the canonical Live Renewal desk. */
export default async function LeaseRenewalWorkspacePage() {
  await requirePageSpaceAccess("renewals");
  redirect("/lease-renewal/live/desk");
}
