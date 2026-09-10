import { EditableLayerError } from "@/lib/firestore/errors";
import { leaseEndDateIso, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { requireCurrentLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import {
  CycleBasisSchema,
  type RenewalCycleBasis,
} from "@/lib/lease-renewal/workspace-state";

export async function resolveRenewalCycleBasis(
  id: string,
  reviewed?: RenewalCycleBasis,
): Promise<RenewalCycleBasis> {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "The current lease source must be connected before a new cycle can be selected.",
      409,
    );
  const views = await requireCurrentLeaseViews(config.rentvineClient, Date.now());
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
