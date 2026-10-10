import type { MaintenancePropertyPreapproval } from "@/lib/maintenance/property-preapproval";
import { createHash } from "node:crypto";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type {
  VendorPacket,
  VendorSelection,
  VendorRosterRecord,
} from "@/lib/maintenance/vendor-work-model";
import { vendorPacketCurrent } from "@/lib/maintenance/vendor-work-model";
export function vendorAssignmentGeneration(
  vendor: {
    id: string;
    uid: string;
    email?: string;
    updatedAt?: string;
    inviteVersion?: number;
  },
  assignment: { vendor_id: string; ticket_id: string; updated_at?: string },
  ticket: MaintenanceTicketRecord,
): string | null {
  if (!vendor.updatedAt || !assignment.updated_at || ticket.vendor_id !== vendor.id)
    return null;
  return createHash("sha256")
    .update(
      JSON.stringify([
        vendor.id,
        vendor.uid,
        vendor.email?.toLowerCase() ?? null,
        vendor.updatedAt,
        vendor.inviteVersion ?? null,
        assignment.vendor_id,
        assignment.ticket_id,
        assignment.updated_at,
      ]),
    )
    .digest("hex");
}
export function reviewedVendorPacket(
  packet: VendorPacket | null,
  selection: VendorSelection | null,
  roster: VendorRosterRecord | null,
  ticket: MaintenanceTicketRecord,
  vendorId: string,
  policy: MaintenancePropertyPreapproval | null = null,
  verifiedOwnerRefs: readonly string[] = [],
) {
  if (
    !vendorPacketCurrent(packet, selection, roster, ticket, policy, verifiedOwnerRefs) ||
    packet!.vendorId !== vendorId
  )
    return null;
  const p = packet!;
  return {
    version: p.version,
    issue: p.issue,
    location: p.location,
    access: p.access,
    scheduling: p.scheduling,
    approvedScope: p.approvedScope,
    costLimitCents: p.costLimitCents,
    costBasis: p.costBasis,
    authorizationRef: p.authorizationRef,
    troubleshooting: p.troubleshooting.map((s) => ({ step: s.step, outcome: s.outcome })),
    artifactIds: p.artifactIds,
    reviewedAt: p.recordedAt,
  };
}
