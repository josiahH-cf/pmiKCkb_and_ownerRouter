import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  PacketEvaluationInput,
  PacketFact,
  PacketSourceReference,
} from "@/lib/lease-documents/packet-types";

export interface ApprovedPacketFactResolution {
  fieldKey: string;
  normalizedValue: PacketFact["normalizedValue"];
  displayValue: string;
  source: PacketSourceReference;
  reason: string;
  actorUid: string;
  authority: "Admin";
  scope: string;
  resolvedAt: string;
}

/**
 * Build a successor input after an Admin resolves one displayed conflict. The prior snapshot keeps
 * the original conflicting observations; this returns a fresh input and never mutates its caller.
 */
export function applyApprovedFactResolution(
  input: PacketEvaluationInput,
  resolution: ApprovedPacketFactResolution,
): PacketEvaluationInput {
  if (
    resolution.authority !== "Admin" ||
    resolution.fieldKey.trim() === "" ||
    resolution.reason.trim() === "" ||
    resolution.actorUid.trim() === "" ||
    resolution.scope.trim() === "" ||
    resolution.source.system.trim() === "" ||
    resolution.source.reference.trim() === "" ||
    resolution.source.retrievedAt.trim() === ""
  ) {
    throw new EditableLayerError(
      "A conflict resolution requires Admin authority, reason, source, actor, and scope.",
      400,
    );
  }
  const prior = input.facts.filter((fact) => fact.fieldKey === resolution.fieldKey);
  if (prior.length < 2 && !prior.some((fact) => fact.confidence === "Conflict")) {
    throw new EditableLayerError("The selected field has no displayed conflict.", 409);
  }
  return {
    ...input,
    facts: [
      ...input.facts.filter((fact) => fact.fieldKey !== resolution.fieldKey),
      {
        fieldKey: resolution.fieldKey,
        normalizedValue: resolution.normalizedValue,
        displayValue: resolution.displayValue,
        source: resolution.source,
        confidence: "Verified",
        applicability: "Applicable",
        verifiedBy: resolution.actorUid,
        ruleVersion: `admin-resolution:${resolution.resolvedAt}`,
        blockingScope: resolution.scope,
      },
    ],
  };
}
