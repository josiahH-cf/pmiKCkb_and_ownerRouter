import { dispositionSourceBasis } from "@/lib/lease-renewal/cycle-disposition";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { withRenewalNoticeAdmission } from "@/lib/firestore/renewal-notice-safety";
import { leaseEndDateIso, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { getLeaseTermReview } from "@/lib/firestore/lease-renewal-term-reviews";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { projectLeaseTerm } from "@/lib/lease-renewal/lease-term";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import type { OwnerRosterEntry } from "@/lib/firestore/renewal-workspace";
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

/**
 * S246 R-S246-5: the lease end the current source read reports for one lease, through the same
 * read a first save uses for its basis (no second source reader). Null when the source is not
 * connected, the lease does not resolve exactly once, or it reports no end date; a choice about
 * a later RentVine lease end is then not recorded.
 */
export async function resolveCurrentLeaseEndIso(
  actor: AuthenticatedUser,
  id: string,
): Promise<string | null> {
  const basis = await resolveRenewalWorkBasis(actor, id);
  return basis?.kind === "lease_end" ? basis.dateIso : null;
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

/**
 * S234 R-S234-1: the lease's owners of record from the current source read, each with its source
 * reference. Null when the source is not connected, cannot be read or does not resolve the lease
 * exactly once; an approval is then not recorded.
 */
export async function resolveLeaseOwnerRoster(
  actor: AuthenticatedUser,
  id: string,
): Promise<readonly OwnerRosterEntry[] | null> {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return null;
  const views = await requireCurrentLeaseViews(
    withRenewalNoticeAdmission(actor, config.rentvineClient),
    Date.now(),
  );
  const matches = views.filter((view) => leaseViewId(view) === id);
  if (matches.length !== 1) return null;
  return projectRenewalDeskIdentity(matches[0]).owners.map((owner) => ({
    label: owner.label,
    sourceRef: owner.sourceRef,
  }));
}

/** The same verified lease end or annual review used by the desk's cycle projection. */
export async function resolveDispositionSourceBasis(
  actor: AuthenticatedUser,
  leaseId: string,
) {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return null;
  const now = Date.now();
  const views = await requireCurrentLeaseViews(
    withRenewalNoticeAdmission(actor, config.rentvineClient),
    now,
  );
  const leases = views.filter((lease) => leaseViewId(lease) === leaseId);
  if (leases.length !== 1) return null;
  const term = projectLeaseTerm(leases[0], await getLeaseTermReview(actor, leaseId), {
    referenceDateIso: businessDateIso(now),
  });
  return dispositionSourceBasis({
    term: term.term,
    endDateIso: leaseEndDateIso(leases[0]) ?? null,
    nextReviewIso: term.nextReviewIso,
  });
}
