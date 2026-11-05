// S253 (R-S253-7, R-S253-8): the owner acknowledgment as its own evaluated packet of one lease.
//
// The tenant packet and the owner acknowledgment are evaluated and saved separately, so writing or
// changing the owner explanation never changes the tenant packet or makes its prepared files
// stale. The owner packet reads the same facts as the tenant packet plus the explanation staff
// wrote for this lease and cycle; nothing else is added, and no date is ever supplied for "Lease
// executed on".
//
// The S66 rule is unchanged: an owner acknowledgment packet is not ready for a provider until the
// exact tenant packet is proven fully executed. What S253 adds is narrower. The acknowledgment
// usually goes out before signing, so its file can be prepared and inspected while that one proof
// is the only thing outstanding. Preparing sends nothing and opens no provider action. Pure.

import type { CalculatedCharges } from "@/lib/lease-documents/charge-policy";
import { packetFormHolds } from "@/lib/lease-documents/form-holds";
import {
  packetOwnerExplanationFact,
  type PacketInputsRecord,
} from "@/lib/lease-documents/packet-inputs";
import type {
  PacketEvaluation,
  PacketEvaluationInput,
} from "@/lib/lease-documents/packet-types";

const OWNER_ACKNOWLEDGMENT_SUFFIX = ":owner_acknowledgment";

/** The transaction identity the owner acknowledgment of one lease is saved under. */
export function ownerAcknowledgmentTransactionId(leaseId: string): string {
  return `${leaseId}${OWNER_ACKNOWLEDGMENT_SUFFIX}`;
}

export function isOwnerAcknowledgmentTransaction(
  leaseId: string,
  transactionId: string,
): boolean {
  return transactionId === ownerAcknowledgmentTransactionId(leaseId);
}

/**
 * The owner acknowledgment's evaluation input from the lease's resolved tenant input. The only
 * fact added is the explanation staff wrote on this lease for its current cycle; a form that
 * places an explanation nobody wrote is held with that one need.
 */
export function buildOwnerAcknowledgmentInput(input: {
  tenant: PacketEvaluationInput;
  inputs: PacketInputsRecord | null;
  cycleId: string | null;
  calculated: Pick<CalculatedCharges, "petAgreement"> | null;
}): PacketEvaluationInput {
  const { tenant } = input;
  const explanation = packetOwnerExplanationFact(input.inputs, input.cycleId);
  const facts = explanation ? [...tenant.facts, explanation] : tenant.facts;
  const formHolds = packetFormHolds({
    catalog: tenant.catalog,
    facts,
    calculated: input.calculated,
  });
  return {
    leaseId: tenant.leaseId,
    transactionId: ownerAcknowledgmentTransactionId(tenant.leaseId),
    audience: "owner",
    facts,
    participants: tenant.participants,
    charges: tenant.charges,
    animals: tenant.animals,
    catalog: tenant.catalog,
    ...(formHolds.length ? { formHolds } : {}),
  };
}

/**
 * Whether a saved packet's files may be prepared for inspection. A tenant packet must be ready for
 * preview, as before. An owner acknowledgment may also be prepared while the proof of the fully
 * executed tenant packet is the only thing it lacks; any other blocker still refuses it.
 */
export function packetFilesPreparable(
  snapshot: Pick<PacketEvaluation, "state" | "blockers" | "manifest">,
): boolean {
  if (snapshot.state === "Ready for preview") return true;
  return (
    snapshot.manifest?.audience === "owner" &&
    snapshot.state === "Needs input" &&
    snapshot.blockers.length > 0 &&
    snapshot.blockers.every((blocker) => blocker.code === "owner_ack_proof_unavailable")
  );
}
