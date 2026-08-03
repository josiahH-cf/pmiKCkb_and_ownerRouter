import { redirect } from "next/navigation";
import { requirePageSpaceAccess } from "@/lib/auth/page-guards";

/** Preserve old evidence links while routing every review to the Live-only surface. */
export default async function ReconciliationDeepLinkPage({
  params,
}: {
  params: Promise<{ runId: string; fieldKey: string }>;
}) {
  await requirePageSpaceAccess("renewals");
  const { fieldKey } = await params;
  redirect(`/lease-renewal/live?flag=${encodeURIComponent(fieldKey)}`);
}
