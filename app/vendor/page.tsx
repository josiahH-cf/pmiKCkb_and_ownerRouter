import { redirect } from "next/navigation";

/** Legacy bookmarks leave the fully retired component without reading its records. */
export default function RetiredMaintenancePage() {
  redirect("/lease-renewal");
}
