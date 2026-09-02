import { redirect } from "next/navigation";

import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import {
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_DESK_ROUTE,
  buildWorkspaceHref,
  isStableLeaseId,
} from "@/lib/lease-renewal/desk-view-continuation";
import { RENEWAL_PROCESS_STEP_IDS } from "@/lib/lease-renewal/renewal-process";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

/**
 * S82: historical per-lease links land on the exact guarded canonical workspace, preserving only
 * validated v2 desk state and an allow-listed step. A malformed or unstable lease id falls back to
 * the canonical desk; the workspace's own guard/ambiguity behavior handles unknown leases.
 */
export default async function LeaseRenewalWorkspacePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ leaseId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await requirePageSpaceAccess("renewals");
  await requirePageCapability(renewalRoleCapability("read_workspace"));
  const { leaseId } = await params;
  const search = (await searchParams) ?? {};

  if (!isStableLeaseId(leaseId)) redirect(RENEWAL_DESK_ROUTE);

  const stepParam = Array.isArray(search.step) ? search.step[0] : search.step;
  const step = (RENEWAL_PROCESS_STEP_IDS as readonly string[]).includes(stepParam ?? "")
    ? stepParam
    : undefined;
  const canonical = serializeRenewalDeskQueryV2(parseRenewalDeskQueryV2(search));
  redirect(
    buildWorkspaceHref({
      leaseId,
      ...(step ? { step } : {}),
      deskView: canonical === "" ? null : canonical,
    }),
  );
}
