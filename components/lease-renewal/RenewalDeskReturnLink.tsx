import { buildDeskReturnHref } from "@/lib/lease-renewal/desk-view-continuation";
/** A document GET retains the validated view without an interrupted client route stream. */
export function RenewalDeskReturnLink({ deskView }: { deskView: string | null }) {
  return (
    <a className="back-link renewal-workspace-link" href={buildDeskReturnHref(deskView)}>
      ← Back to renewals
    </a>
  );
}
