import { z } from "zod";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { MoveOutDisposition } from "./move-out-disposition";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const NoticeSafetyMarkerSchema = z
  .object({
    version: z.number().int().positive(),
    scopeHash: hash,
    semanticHash: hash,
    sourceReadAt: z
      .object({ lease: z.number().nonnegative(), status: z.number().nonnegative() })
      .strict(),
    observedAt: z.string().datetime(),
  })
  .strict();
export type NoticeSafetyMarker = z.infer<typeof NoticeSafetyMarkerSchema>;
export type NoticeSafetyBasis = Pick<
  NoticeSafetyMarker,
  "scopeHash" | "version" | "semanticHash"
>;
export function noticeSafetyBasis(marker: NoticeSafetyMarker): NoticeSafetyBasis {
  return {
    scopeHash: marker.scopeHash,
    version: marker.version,
    semanticHash: marker.semanticHash,
  };
}

/** Provider record identifiers, never names/emails or a lease id alone, establish a tenancy. */
export function noticeTenancyHash(lease: RawLease): string | null {
  const leaseId = leaseViewId(lease);
  const unit = lease.unit as Record<string, unknown> | undefined;
  const unitId = String(unit?.unitID ?? "").trim();
  const tenants = Array.isArray(lease.tenants) ? lease.tenants : [];
  const contacts = tenants.map((value) =>
    value && typeof value === "object"
      ? String((value as Record<string, unknown>).contactID ?? "").trim()
      : "",
  );
  if (
    !leaseId ||
    !/^[1-9]\d*$/.test(unitId) ||
    !contacts.length ||
    contacts.some((id) => !/^[1-9]\d*$/.test(id)) ||
    new Set(contacts).size !== contacts.length
  )
    return null;
  return hashExecutionPreview({ leaseId, unitId, contacts: contacts.sort() });
}
export function noticeScopeHash(
  leaseId: string,
  tenancyHash: string | null,
  cycleId: string | null,
) {
  return hashExecutionPreview({ leaseId, tenancyHash, cycleId });
}
export function noticeSemanticHash(
  disposition: MoveOutDisposition,
  tenancyVerified: boolean,
  historyRevision: number,
) {
  return hashExecutionPreview({
    state: disposition.state,
    reason: disposition.reason,
    evidence: disposition.evidence,
    expired: ["expired", "unavailable"].includes(disposition.freshness),
    tenancyVerified,
    historyRevision,
  });
}
function conflictHash(
  scopeHash: string,
  sourceReadAt: NoticeSafetyMarker["sourceReadAt"],
) {
  return hashExecutionPreview({ conflict: true, scopeHash, sourceReadAt });
}
export function pendingNoticeHash(
  scopeHash: string,
  sourceReadAt: NoticeSafetyMarker["sourceReadAt"],
) {
  return hashExecutionPreview({ pending: true, scopeHash, sourceReadAt });
}
/** Source timestamps are a vector: a newer lease plus an older status list is not a newer read. */
export function advanceNoticeSafetyMarker(
  previous: NoticeSafetyMarker | null,
  input: Omit<NoticeSafetyMarker, "version">,
): { marker: NoticeSafetyMarker; ready: boolean } {
  if (!previous) return { marker: { ...input, version: 1 }, ready: true };
  const equal =
    previous.scopeHash === input.scopeHash &&
    previous.semanticHash === input.semanticHash;
  const nonOlder =
    input.sourceReadAt.lease >= previous.sourceReadAt.lease &&
    input.sourceReadAt.status >= previous.sourceReadAt.status;
  if (
    previous.semanticHash === pendingNoticeHash(previous.scopeHash, previous.sourceReadAt)
  ) {
    // Admission already invalidated the old approval before dispatch. An older or mixed cached
    // observation stays unavailable without poisoning the newer in-flight generation's completion.
    return nonOlder
      ? { marker: { ...input, version: previous.version }, ready: true }
      : { marker: previous, ready: false };
  }
  const newer =
    nonOlder &&
    (input.sourceReadAt.lease > previous.sourceReadAt.lease ||
      input.sourceReadAt.status > previous.sourceReadAt.status);
  if (equal)
    return {
      marker: newer ? { ...input, version: previous.version } : previous,
      ready: true,
    };
  if (newer) return { marker: { ...input, version: previous.version + 1 }, ready: true };
  // A cached/parallel differing generation invalidates prior approval even when it cannot safely
  // replace the newest evidence. Repeated conflict reads are idempotent; a fresh read resolves it.
  const semanticHash = conflictHash(previous.scopeHash, previous.sourceReadAt);
  return {
    marker:
      previous.semanticHash === semanticHash
        ? previous
        : {
            ...previous,
            semanticHash,
            version: previous.version + 1,
            observedAt: input.observedAt,
          },
    ready: false,
  };
}
export function manualNonRenewalReason(
  workspace:
    | {
        ownerResponse?: { outcome?: string } | null;
        tenantResponse?: { outcome?: string } | null;
      }
    | null
    | undefined,
): string | null {
  return workspace?.ownerResponse?.outcome === "declined_non_renewal" ||
    workspace?.tenantResponse?.outcome === "declined_nonrenewing"
    ? "Staff recorded a non-renewal decision. Ordinary owner and tenant renewal outreach is unavailable; review the non-renewal handoff."
    : null;
}
