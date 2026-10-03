import { EditableLayerError } from "@/lib/firestore/errors";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { withRenewalNoticeAdmission } from "@/lib/firestore/renewal-notice-safety";
import { leaseEndDateIso, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { getLeaseTermReview } from "@/lib/firestore/lease-renewal-term-reviews";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { projectLeaseTerm } from "@/lib/lease-renewal/lease-term";
import {
  CycleBasisSchema,
  type RenewalCycleBasis,
  type RenewalWorkBasis,
} from "@/lib/lease-renewal/workspace-state";

/**
 * S154: the real basis for a work record established by its first save. The lease end the source
 * reports comes first; a month-to-month lease uses its existing annual review date. When the source
 * offers neither, or cannot be read, the answer is null: the record is then saved on the lease
 * without a date, and no date is asked for or invented.
 */
export async function resolveRenewalWorkBasis(
  actor: AuthenticatedUser,
  id: string,
): Promise<RenewalWorkBasis | null> {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return null;
  const now = Date.now();
  const views = await requireCurrentLeaseViews(
    withRenewalNoticeAdmission(actor, config.rentvineClient),
    now,
  );
  const matches = views.filter((view) => leaseViewId(view) === id);
  if (matches.length !== 1) return null;
  const end = leaseEndDateIso(matches[0]);
  if (end) return { kind: "lease_end", dateIso: end, source: "RentVine lease end" };
  const review = await getLeaseTermReview(actor, id).catch(() => null);
  const nextReviewIso = projectLeaseTerm(matches[0], review, {
    referenceDateIso: businessDateIso(now),
  }).nextReviewIso;
  return nextReviewIso
    ? {
        kind: "review_date",
        dateIso: nextReviewIso,
        source: "Month-to-month annual review date",
      }
    : null;
}

export async function resolveRenewalCycleBasis(
  actor: AuthenticatedUser,
  id: string,
  reviewed?: RenewalCycleBasis,
): Promise<RenewalCycleBasis> {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "The current lease source must be connected before a new cycle can be selected.",
      409,
    );
  const views = await requireCurrentLeaseViews(
    withRenewalNoticeAdmission(actor, config.rentvineClient),
    Date.now(),
  );
  const matches = views.filter((view) => leaseViewId(view) === id);
  if (matches.length !== 1)
    throw new EditableLayerError(
      "The current lease identity must resolve exactly once before recording a new cycle.",
      409,
    );
  const end = leaseEndDateIso(matches[0]);
  if (end) return { kind: "lease_end", dateIso: end, source: "RentVine lease end" };
  if (reviewed?.kind === "review_date") return CycleBasisSchema.parse(reviewed);
  throw new EditableLayerError(
    "Select the reviewed periodic-review date and its source for this lease.",
    409,
  );
}
