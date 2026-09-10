import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  getRenewalWorkspace,
  RENEWAL_WORKSPACE_COLLECTIONS,
} from "@/lib/firestore/renewal-workspace";
import {
  capturedTrend,
  marketBasisFromCapturedResult,
  type CapturedCompResult,
  type RenewalMarketObservation,
} from "@/lib/lease-renewal/market-observation";

export const CompCaptureSchema = z
  .object({ cycleId: z.string().uuid(), compObservationId: z.string().uuid().optional() })
  .strict();
export async function assertCompCaptureCycle(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  compObservationId?: string,
  db: Firestore = getAdminFirestore(),
) {
  if (!can(actor.role, "edit") || isVerificationAccount(actor))
    throw new EditableLayerError(
      "Staff authority is required to retain a comp lookup.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const state = await getRenewalWorkspace(actor, leaseId, db);
  if (!state || state.cycleId !== cycleId)
    throw new EditableLayerError(
      "Select the current reviewed cycle before this lookup.",
      409,
    );
  if (compObservationId) {
    const comp = await db
      .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
      .doc(compObservationId)
      .get();
    if (
      !comp.exists ||
      comp.get("lease_id") !== leaseId ||
      comp.get("cycle_id") !== cycleId ||
      comp.get("operation") !== "comps"
    )
      throw new EditableLayerError(
        "Select comps from this exact cycle before the linked trend lookup.",
        409,
      );
  }
}
/** Called only with the actual normalized response of the existing governed comp route. */
export async function captureMarketObservation(
  actor: AuthenticatedUser,
  leaseId: string,
  capture: z.infer<typeof CompCaptureSchema>,
  operation: "comps" | "trend",
  payload: Record<string, unknown>,
  db: Firestore = getAdminFirestore(),
) {
  if (!can(actor.role, "edit") || isVerificationAccount(actor))
    throw new EditableLayerError("Staff authority is required.", 403);
  assertMutationAllowed(requireEnvironmentDescriptor());
  const id = randomUUID(),
    recordedAt = new Date().toISOString(),
    collection = db.collection(RENEWAL_WORKSPACE_COLLECTIONS.observations);
  if (operation === "comps") {
    const result = payload as unknown as CapturedCompResult;
    if (result.queryBasis?.leaseId !== leaseId)
      throw new EditableLayerError("Comp evidence did not match this lease.", 409);
    const market = marketBasisFromCapturedResult(result);
    await collection.doc(id).create({
      lease_id: leaseId,
      cycle_id: capture.cycleId,
      actor_uid: actor.uid,
      recorded_at: recordedAt,
      operation,
      result,
      market,
    });
  } else {
    if (!capture.compObservationId)
      throw new EditableLayerError("A trend must identify its exact comp lookup.", 409);
    const comp = await collection.doc(capture.compObservationId).get();
    if (
      !comp.exists ||
      comp.get("lease_id") !== leaseId ||
      comp.get("cycle_id") !== capture.cycleId ||
      comp.get("operation") !== "comps"
    )
      throw new EditableLayerError("The trend's comp identity is unavailable.", 409);
    await collection.doc(id).create({
      lease_id: leaseId,
      cycle_id: capture.cycleId,
      actor_uid: actor.uid,
      recorded_at: recordedAt,
      operation,
      comp_observation_id: capture.compObservationId,
      trend: capturedTrend(payload),
    });
  }
  const saved = await collection.doc(id).get();
  if (!saved.exists)
    throw new EditableLayerError(
      "The lookup finished but its retained result could not be read back.",
      409,
    );
  return id;
}
export async function listMarketObservations(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalMarketObservation[]> {
  if (!can(actor.role, "read"))
    throw new EditableLayerError("Renewal read access is required.", 403);
  const rows = await db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
    .where("lease_id", "==", leaseId)
    .get();
  return rows.docs
    .filter((row) => row.get("cycle_id") === cycleId && row.get("operation") === "comps")
    .map((row) => ({
      id: row.id,
      leaseId,
      cycleId,
      result: row.get("result") as CapturedCompResult,
      market: row.get("market") as RenewalMarketObservation["market"],
      recordedAt: String(row.get("recorded_at")),
    }))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}
