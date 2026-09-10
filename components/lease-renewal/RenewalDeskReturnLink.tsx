import Link from "next/link";
import { buildDeskReturnHref } from "@/lib/lease-renewal/desk-view-continuation";
/** The shared page-level return control retains the validated desk continuation. */
export function RenewalDeskReturnLink({ deskView }: { deskView: string | null }) {
  return (
    <Link
      className="back-link renewal-workspace-link"
      href={buildDeskReturnHref(deskView)}
    >
      ← Back to renewals
    </Link>
  );
}
