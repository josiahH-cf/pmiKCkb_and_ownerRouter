import { readPolicyMaterialSnapshot } from "@/lib/firestore/lease-renewal-policy-material";
import type { FollowUpPolicyContext } from "./lease-follow-up";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { withRenewalNoticeAdmission } from "@/lib/firestore/renewal-notice-safety";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { leaseEndDateIso, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { getLeaseTermReview } from "@/lib/firestore/lease-renewal-term-reviews";
import { projectLeaseTerm } from "@/lib/lease-renewal/lease-term";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type { RenewalWorkBasis } from "@/lib/lease-renewal/workspace-state";
import type { WorkSourceReference } from "./types";
import { WorkAccountabilityError, canonicalSourceLink } from "./model";
export interface VerifiedLeaseFollowUpSource {
  leaseId: string;
  basis: RenewalWorkBasis | null;
  source: WorkSourceReference;
  policyContext?: FollowUpPolicyContext;
}
export type LeaseFollowUpSourceResolver = (
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore,
) => Promise<VerifiedLeaseFollowUpSource>;
/** Complete current source resolution, never a name/address guess or partial-export match. */
export const resolveLeaseFollowUpSource: LeaseFollowUpSourceResolver = async (
  actor,
  id,
  db,
) => {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new WorkAccountabilityError(
      "The current lease source is unavailable. Existing tasks remain readable.",
      409,
      "source_unavailable",
    );
  const now = Date.now(),
    views = await requireCurrentLeaseViews(
      withRenewalNoticeAdmission(actor, config.rentvineClient, db),
      now,
    );
  const matches = views.filter((v) => leaseViewId(v) === id);
  if (matches.length !== 1)
    throw new WorkAccountabilityError(
      "The actual lease identity is missing or ambiguous.",
      409,
      "source_ambiguous",
    );
  const end = leaseEndDateIso(matches[0]);
  let basis: RenewalWorkBasis | null = end
    ? { kind: "lease_end", dateIso: end, source: "RentVine lease end" }
    : null;
  if (!basis) {
    const review = await getLeaseTermReview(actor, id, db);
    const next = projectLeaseTerm(matches[0], review, {
      referenceDateIso: businessDateIso(now),
    }).nextReviewIso;
    if (next)
      basis = {
        kind: "review_date",
        dateIso: next,
        source: "Month-to-month annual review date",
      };
  }
  const material = await readPolicyMaterialSnapshot("rhino", db).catch(() => ({
    state: "unreadable" as const,
    active: null,
  }));
  const active = material.state === "approved" ? material.active : null;
  const policyContext: FollowUpPolicyContext = {
    product: "rhino",
    material_state: material.state,
    reference: active?.reference ?? null,
    version: active?.version ?? null,
    publication_reference: active?.publicationSource.reference ?? null,
    content_hash: active?.publicationSource.contentHash ?? null,
    read_at: new Date(now).toISOString(),
    applicability: "unverified",
  };
  return {
    leaseId: id,
    basis,
    policyContext,
    source: {
      type: "renewal_lease",
      id,
      link: canonicalSourceLink("renewal_lease", id),
      version: `rentvine:${new Date(now).toISOString()}`,
      status: "verified",
    },
  };
};
