import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";

export type PacketRetryPlan =
  | { action: "reconcile"; idempotencyKey: string }
  | { action: "new_attempt" }
  | { action: "refuse"; reason: string };

/** Any ambiguous/partial provider attempt must reconcile before another create/upload. */
export function planPacketRetry(snapshot: RenewalPacketSnapshot): PacketRetryPlan {
  if (!snapshot.current || snapshot.visibleState === "Superseded") {
    return { action: "refuse", reason: "The packet snapshot is superseded." };
  }
  if (
    snapshot.execution &&
    ["Provider pending", "Partially executed", "Failed"].includes(
      snapshot.execution.state,
    )
  ) {
    return { action: "reconcile", idempotencyKey: snapshot.execution.idempotencyKey };
  }
  if (snapshot.execution?.state === "Executed") {
    return { action: "refuse", reason: "The packet is already executed." };
  }
  return snapshot.state === "Ready for preview"
    ? { action: "new_attempt" }
    : { action: "refuse", reason: "The packet is not ready for preview." };
}
