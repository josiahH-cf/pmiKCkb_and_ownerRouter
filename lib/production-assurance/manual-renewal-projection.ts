import { createHash } from "node:crypto";
import type { RenewalWorkspaceState } from "../lease-renewal/workspace-state";

export interface IndependentManualRenewal {
  readonly cycleId: string;
  readonly revision: number;
  readonly complete: boolean;
  readonly pendingSourceUpdates: number;
  readonly nextActivity: string;
  readonly actionStepId: string;
  readonly sourceDigest: string;
}

// Independent S113 oracle: share the persisted schema, never the app's summary/projection.
export function projectIndependentManualRenewal(
  state: RenewalWorkspaceState,
): IndependentManualRenewal {
  const order = [
    "owner_outreach",
    "tenant_offer",
    "information_form",
    "form_returned",
    "documents",
    "document_delivery",
    "signatures",
    "insurance",
    "rhino",
    "pet",
    "charges",
    "inspection",
    "filter",
    "utilities",
    "assisted_housing",
  ];
  const conditional = new Set([
    "information_form",
    "form_returned",
    "insurance",
    "rhino",
    "pet",
    "charges",
    "inspection",
    "filter",
    "utilities",
    "assisted_housing",
  ]);
  const termsDependent = new Set([
    "tenant_offer",
    "documents",
    "document_delivery",
    "signatures",
    "charges",
    "assisted_housing",
  ]);
  const done = (key: string) => {
    const entry = state.activities[key as keyof typeof state.activities];
    if (
      !entry ||
      (termsDependent.has(key) && entry.termsRevision !== state.termsRevision)
    )
      return false;
    return (
      entry.outcome === "done" ||
      (entry.outcome === "not_applicable" &&
        conditional.has(key) &&
        !!entry.reason?.trim() &&
        !!entry.applicabilityPolicy?.trim())
    );
  };
  const tenant =
    state.tenantResponse?.termsRevision === state.termsRevision
      ? state.tenantResponse
      : null;
  const nonRenewal =
    state.ownerResponse?.outcome === "declined_non_renewal" ||
    tenant?.outcome === "declined_nonrenewing";
  let nextActivity: string;
  if (nonRenewal)
    nextActivity = done("non_renewal_handoff") ? "complete" : "non_renewal_handoff";
  else if (!done("owner_outreach")) nextActivity = "owner_outreach";
  else if (
    state.ownerResponse?.outcome !== "approved_terms" ||
    !state.ownerResponse.terms
  )
    nextActivity = "owner_response";
  else if (!done("tenant_offer")) nextActivity = "tenant_offer";
  else if (tenant?.outcome !== "accepted")
    nextActivity =
      tenant?.outcome === "counter_change_requested"
        ? "owner_response"
        : "tenant_response";
  else nextActivity = order.find((key) => !done(key)) ?? "complete";
  return {
    cycleId: state.cycleId,
    revision: state.revision,
    complete:
      nextActivity === "complete" &&
      !!state.completion &&
      state.completion.termsRevision === state.termsRevision,
    pendingSourceUpdates: Object.values(state.sourceUpdates).filter(
      (entry) => entry.state !== "verified",
    ).length,
    nextActivity,
    actionStepId: ["owner_outreach", "owner_response"].includes(nextActivity)
      ? "owner-decision"
      : ["tenant_offer", "tenant_response", "information_form", "form_returned"].includes(
            nextActivity,
          )
        ? "tenant-decision"
        : "compliance-close",
    sourceDigest: createHash("sha256").update(JSON.stringify(state)).digest("hex"),
  };
}

/** Select documented positive lease identities for real detail reads; missing details never fall back. */
export function independentLeaseDetailIds(
  rows: readonly Readonly<Record<string, unknown>>[],
): string[] {
  return [
    ...new Set(
      rows.flatMap((row) => {
        const lease =
          row.lease && typeof row.lease === "object"
            ? (row.lease as Record<string, unknown>)
            : row;
        const raw = lease.leaseID ?? lease.leaseId ?? lease.id;
        const id = raw === undefined || raw === null ? "" : String(raw).trim();
        return /^[1-9]\d*$/.test(id) ? [id] : [];
      }),
    ),
  ];
}
