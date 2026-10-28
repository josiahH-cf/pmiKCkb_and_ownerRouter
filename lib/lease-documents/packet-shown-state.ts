// S235 ARCH-S235-3 / R-S235-4: the packet state staff see, projected from the current snapshot's
// recorded events: a prepared filled copy (Previewed), its approval (Approved), a claimed upload
// (Provider pending), receipted uploads (Partially executed, Executed), a recorded refusal (Failed)
// or cancellation (Cancelled). No shown state skips its recorded event. Display only: the stored
// snapshot and execution states that gate provider actions are unchanged.

import type {
  PacketVisibleState,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";

export const EXECUTED_NOTE =
  "Executed means the provider operations are complete, not that anyone signed.";

export interface ShownPacketDocument {
  readonly artifactId: string;
  /** A reviewed field or region map fills it; false for an unchanged or manual document. */
  readonly fillable: boolean;
  /** An approved original used exactly as approved. */
  readonly unchanged: boolean;
  /** A filled copy (the exact preview) exists for this snapshot. */
  readonly prepared: boolean;
  /** That filled copy is approved. */
  readonly approved: boolean;
  /** A receipted upload of this snapshot's document is recorded in the lease's current loop. */
  readonly uploaded: boolean;
  /** An upload is claimed and not yet settled. */
  readonly uploadPending: boolean;
}

export interface ShownPacketState {
  readonly snapshotId: string;
  readonly state: PacketVisibleState;
  readonly note: string | null;
}

export function projectShownPacketState(input: {
  readonly snapshot: RenewalPacketSnapshot;
  readonly documents: readonly ShownPacketDocument[];
}): ShownPacketState {
  const { snapshot, documents } = input;
  const shown = (state: PacketVisibleState, note: string | null = null) => ({
    snapshotId: snapshot.snapshotId,
    state,
    note,
  });
  if (!snapshot.current) return shown("Superseded");
  if (snapshot.state !== "Ready for preview") return shown(snapshot.state);
  const execution = snapshot.execution?.state;
  if (execution === "Failed")
    return shown(
      "Failed",
      "A provider refusal is recorded; nothing is retried automatically.",
    );
  if (execution === "Cancelled") return shown("Cancelled");
  if (
    execution === "Provider pending" ||
    documents.some((document) => document.uploadPending)
  )
    return shown("Provider pending");
  if (documents.length && documents.every((document) => document.uploaded))
    return shown("Executed", EXECUTED_NOTE);
  if (
    execution === "Partially executed" ||
    documents.some((document) => document.uploaded)
  )
    return shown(
      "Partially executed",
      `${documents.filter((document) => document.uploaded).length} of ${documents.length} documents are current in the linked loop.`,
    );
  if (
    documents.length &&
    documents.every(
      (document) => document.unchanged || (document.fillable && document.approved),
    )
  )
    return shown("Approved");
  const fillable = documents.filter((document) => document.fillable);
  if (fillable.length && fillable.every((document) => document.prepared))
    return shown(
      "Previewed",
      fillable.length < documents.length
        ? "Some documents have no filled copy; a person completes them in Dotloop."
        : null,
    );
  return shown(snapshot.state);
}
