import { redirect } from "next/navigation";
import { requirePageSpaceAccess } from "@/lib/auth/page-guards";

/** The canonical Renewal entry is the Live desk; Production exposes no sample workspace. */
export default async function LeaseRenewalPage() {
  await requirePageSpaceAccess("renewals");
  redirect("/lease-renewal/live/desk");
}
