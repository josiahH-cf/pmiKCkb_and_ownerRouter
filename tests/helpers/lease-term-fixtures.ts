// S103 test helper: lease-term projections built through the REAL projection, never hand-written.
// A fixture that hard-codes a projection shape would drift silently from `projectLeaseTerm`.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  projectLeaseTerm,
  type LeaseTermProjection,
} from "@/lib/lease-renewal/lease-term";

function enrichedView(
  lease: Record<string, unknown>,
  detail: Record<string, unknown>,
): RawLease {
  const [view] = leaseViewsFromExport([{ lease: { leaseID: 1, ...lease }, unit: {} }]);
  applyLeaseDetailToView(view, {
    baseRentAmount: 1500,
    rentAmount: 1500,
    isMonthToMonth: "0",
    monthToMonthStartDate: null,
    hasPendingMonthToMonthConversion: false,
    ...detail,
  });
  return view;
}

/** A fixed-term projection with the given lease dates. */
export function fixedTermProjection(
  endDateIso: string | null = "2026-09-30",
  startDateIso: string | null = "2025-10-01",
): LeaseTermProjection {
  return projectLeaseTerm(
    enrichedView(
      {
        ...(startDateIso === null ? {} : { startDate: startDateIso }),
        ...(endDateIso === null ? {} : { endDate: endDateIso }),
      },
      {},
    ),
  );
}

/** A month-to-month projection anchored on the provider start date (null anchor is allowed). */
export function monthToMonthProjection(
  anchorDateIso: string | null = "2025-09-15",
  endDateIso: string | null = "2026-09-30",
): LeaseTermProjection {
  return projectLeaseTerm(
    enrichedView(endDateIso === null ? {} : { endDate: endDateIso }, {
      isMonthToMonth: "1",
      monthToMonthStartDate: anchorDateIso,
    }),
  );
}

/** A needs-review projection: the lease detail could not be read. */
export function needsReviewTermProjection(
  endDateIso: string | null = "2026-09-30",
): LeaseTermProjection {
  return projectLeaseTerm(
    enrichedView(endDateIso === null ? {} : { endDate: endDateIso }, {
      hasPendingMonthToMonthConversion: true,
    }),
  );
}
