import { redirect } from "next/navigation";

import { VendorPortal } from "@/components/vendor/VendorPortal";
import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { listVendorTickets } from "@/lib/vendor/assignment";
import { getVendorSession } from "@/lib/vendor/auth";

export default async function VendorPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/sign-in");
  const store = new FirestoreVendorStore();
  if (
    !(await store.activateVendor(
      principal.vendorId,
      principal.uid,
      principal.email,
      new Date().toISOString(),
      principal.dataMode ?? "live",
    ))
  ) {
    redirect("/vendor/sign-in?error=unavailable");
  }
  return (
    <VendorPortal
      email={principal.email}
      dataMode={principal.dataMode ?? "live"}
      tickets={await listVendorTickets(principal, store)}
    />
  );
}
