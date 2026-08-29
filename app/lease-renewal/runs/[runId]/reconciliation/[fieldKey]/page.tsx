import { redirect } from "next/navigation";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

/** Preserve old evidence links while routing every review to the Live-only surface. */
export default async function ReconciliationDeepLinkPage({
  params,
}: {
  params: Promise<{ runId: string; fieldKey: string }>;
}) {
  await requirePageSpaceAccess("renewals");
  await requirePageCapability(renewalRoleCapability("read_workspace"));
  const { fieldKey } = await params;
  redirect(`/lease-renewal/live?flag=${encodeURIComponent(fieldKey)}`);
}
