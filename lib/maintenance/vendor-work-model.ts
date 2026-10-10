// Client-safe, explicit vendor-visible work vocabulary. No staff record is spread into a packet.
import { z } from "zod";
import type { MaintenanceTicketRecord } from "./ticket-model";
import { hasCurrentRecordedOwnerDecision, maintenanceWorkAuthorized } from "./lifecycle";
import type { MaintenancePropertyPreapproval } from "./property-preapproval";
import { maintenanceWorkScope } from "./lifecycle";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  text = z.string().trim().min(1).max(4000),
  ref = z.string().trim().min(1).max(1000);
const envelope = {
  operationId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
};
export const VendorRosterInputSchema = z
  .object({
    ...envelope,
    vendorId: id,
    active: z.boolean(),
    availability: z.enum(["available", "limited", "unavailable", "unknown"]),
    categories: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    preference: z.enum(["primary", "backup", "alternative"]),
    contactEmail: z.string().email().max(254),
    contactPhone: z.string().trim().max(80),
    preferredChannel: z.enum(["email", "phone", "portal"]),
    contactVerified: z.literal(true),
    sourceRef: ref,
    rentvineVendorId: z
      .string()
      .regex(/^[1-9]\d{0,9}$/)
      .nullable(),
    rentvineEvidenceRef: ref.nullable(),
    reason: text,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.preferredChannel === "phone" && !v.contactPhone)
      c.addIssue({
        code: "custom",
        message: "Record the actual verified phone contact.",
        path: ["contactPhone"],
      });
    if (v.rentvineVendorId && !v.rentvineEvidenceRef)
      c.addIssue({
        code: "custom",
        message: "A RentVine identity requires its actual reviewed mapping evidence.",
        path: ["rentvineEvidenceRef"],
      });
    if (new Set(v.categories.map((x) => x.toLowerCase())).size !== v.categories.length)
      c.addIssue({
        code: "custom",
        message: "Service categories must be distinct.",
        path: ["categories"],
      });
  });
export type VendorRosterInput = z.infer<typeof VendorRosterInputSchema>;
export interface VendorRosterRecord extends Omit<
  VendorRosterInput,
  "operationId" | "expectedVersion"
> {
  version: number;
  recordedBy: string;
  recordedAt: string;
}
export const VendorPacketInputSchema = z
  .object({
    issue: text,
    location: text,
    access: z.string().trim().max(4000),
    scheduling: z.string().trim().max(4000),
    approvedScope: text,
    costLimitCents: z.number().int().nonnegative().max(1e10).nullable(),
    authorizationRef: ref.nullable(),
    troubleshooting: z.array(z.object({ step: text, outcome: text }).strict()).max(30),
    artifactIds: z.array(z.string().uuid()).max(20),
    reviewedForVendor: z.literal(true),
    reason: text,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.costLimitCents !== null && !v.authorizationRef)
      c.addIssue({
        code: "custom",
        message: "A stated cost limit requires actual work authorization evidence.",
        path: ["authorizationRef"],
      });
    if (new Set(v.artifactIds).size !== v.artifactIds.length)
      c.addIssue({
        code: "custom",
        message: "Use each retained file once.",
        path: ["artifactIds"],
      });
  });
export type VendorPacketInput = z.infer<typeof VendorPacketInputSchema>;
export interface VendorPacket extends VendorPacketInput {
  authorizationBinding: {
    kind: "owner_decision" | "standing_policy";
    snapshot: string;
  } | null;
  costBasis: MaintenanceTicketRecord["estimate_cost_basis"] | null;
  ticketId: string;
  vendorId: string;
  version: number;
  selectionVersion: number;
  rosterVersion: number;
  workScope: string;
  recordedBy: string;
  recordedAt: string;
}
export interface VendorSelection {
  ticketId: string;
  vendorId: string;
  version: number;
  rosterVersion: number;
  reason: string;
  selectedBy: string;
  selectedAt: string;
}
export const VendorContributionInputSchema = z
  .object({
    operationId: z.string().uuid(),
    submissionId: z.string().uuid(),
    expectedSubmissionVersion: z.number().int().nonnegative(),
    assignmentGeneration: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(["quote", "schedule", "progress", "invoice", "completion"]),
    description: text,
    occurredAt: z.string().datetime(),
    quoteBasis: z.enum(["estimate", "fixed"]).nullable(),
    lines: z
      .array(
        z
          .object({
            description: text,
            amountCents: z.number().int().nonnegative().max(1e10),
          })
          .strict(),
      )
      .max(100),
    invoiceId: z.string().trim().min(1).max(160).nullable(),
    invoiceMeaning: z.enum(["invoice", "credit"]).optional(),
    issueDate: z.string().date().nullable(),
    serviceDate: z.string().date().nullable(),
    proposedStart: z.string().datetime().nullable(),
    proposedEnd: z.string().datetime().nullable(),
    progressKind: z.enum(["note", "arrived", "departed", "schedule_update"]).nullable(),
    unresolvedIssues: z.string().trim().max(4000),
    artifactIds: z.array(z.string().uuid()).max(20),
    revisionReason: text,
  })
  .strict()
  .superRefine((v, c) => {
    const fail = (field: string, message: string) =>
      c.addIssue({ code: "custom", message, path: [field] });
    if (v.kind === "quote" && (!v.quoteBasis || !v.lines.length))
      fail(
        "lines",
        "A quote needs its explicit estimate/fixed basis and itemized amounts.",
      );
    if (
      v.kind === "invoice" &&
      (!v.invoiceId ||
        !v.issueDate ||
        !v.serviceDate ||
        !v.lines.length ||
        !v.artifactIds.length)
    )
      fail(
        "invoiceId",
        "An invoice needs its identity, issue/service dates, itemized amounts and original retained document.",
      );
    if (
      v.kind === "schedule" &&
      (!v.proposedStart ||
        !v.proposedEnd ||
        Date.parse(v.proposedStart) >= Date.parse(v.proposedEnd))
    )
      fail("proposedEnd", "Propose an actual ordered visit window.");
    if (v.kind === "progress" && !v.progressKind)
      fail("progressKind", "Select the actual work-log meaning.");
    if (new Set(v.artifactIds).size !== v.artifactIds.length)
      fail("artifactIds", "Reference each retained file once.");
  });
export type VendorContributionInput = z.infer<typeof VendorContributionInputSchema>;
export interface VendorContribution extends Omit<
  VendorContributionInput,
  "operationId" | "expectedSubmissionVersion"
> {
  ticketId: string;
  vendorId: string;
  version: number;
  recordedBy: string;
  recordedAt: string;
  review: {
    state: "pending" | "accepted" | "returned";
    reason: string;
    recordedBy: string | null;
    recordedAt: string | null;
  };
}
export const MaintenanceVendorCommandSchema = z.discriminatedUnion("op", [
  z
    .object({
      ...envelope,
      op: z.literal("vendor_selection"),
      vendorId: id,
      rosterVersion: z.number().int().positive(),
      reason: text,
    })
    .strict(),
  z
    .object({
      ...envelope,
      op: z.literal("vendor_packet"),
      selectionVersion: z.number().int().positive(),
      rosterVersion: z.number().int().positive(),
      packet: VendorPacketInputSchema,
    })
    .strict(),
  z
    .object({
      ...envelope,
      op: z.literal("vendor_review"),
      submissionId: z.string().uuid(),
      expectedSubmissionVersion: z.number().int().positive(),
      decision: z.enum(["accepted", "returned"]),
      reason: text,
    })
    .strict(),
  z
    .object({
      ...envelope,
      op: z.literal("vendor_handoff_report"),
      packetVersion: z.number().int().positive(),
      sourceRef: ref,
      occurredAt: z.string().datetime(),
      reason: text,
    })
    .strict(),
]);
export type MaintenanceVendorCommand = z.infer<typeof MaintenanceVendorCommandSchema>;
export function vendorPacketCurrent(
  packet: VendorPacket | null,
  selection: VendorSelection | null,
  roster: VendorRosterRecord | null,
  ticket: MaintenanceTicketRecord,
  policy: MaintenancePropertyPreapproval | null = null,
  verifiedOwnerRefs: readonly string[] = [],
) {
  if (
    !packet ||
    !selection ||
    !roster ||
    !roster.active ||
    roster.availability === "unavailable" ||
    packet.vendorId !== selection.vendorId ||
    packet.version <= 0 ||
    packet.selectionVersion !== selection.version ||
    packet.rosterVersion !== roster.version ||
    selection.rosterVersion !== roster.version ||
    packet.workScope !== maintenanceWorkScope(ticket)
  )
    return false;
  if (packet.costLimitCents === null) return packet.authorizationBinding === null;
  const authority = hasCurrentRecordedOwnerDecision(ticket)
      ? ticket.owner_decision
      : policy,
    kind = hasCurrentRecordedOwnerDecision(ticket) ? "owner_decision" : "standing_policy";
  return (
    maintenanceWorkAuthorized(ticket, policy, verifiedOwnerRefs) &&
    packet.authorizationBinding?.kind === kind &&
    packet.authorizationBinding.snapshot === JSON.stringify(authority) &&
    packet.costBasis === ticket.estimate_cost_basis &&
    packet.costLimitCents <= ticket.estimate_amount_cents!
  );
}
export const VendorArtifactInputSchema = z
  .object({
    operationId: z.string().uuid(),
    assignmentGeneration: z.string().regex(/^[a-f0-9]{64}$/),
    filename: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,119}\.(?:pdf|jpg|jpeg|png|webp)$/i),
    mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    purpose: z.enum(["quote", "invoice", "work_photo", "completion"]),
    base64: z
      .string()
      .min(1)
      .max(7 * 1024 * 1024),
    approvedCoreEvidence: z.literal(true),
  })
  .strict();
export type VendorArtifactInput = z.infer<typeof VendorArtifactInputSchema>;
export interface VendorArtifact {
  id: string;
  ticketId: string;
  vendorId: string;
  filename: string;
  mimeType: string;
  purpose: VendorArtifactInput["purpose"];
  sha256: string;
  sizeBytes: number;
  state: "uploading" | "retained";
  assignmentGeneration: string;
  recordedBy: string;
  recordedAt: string;
}
