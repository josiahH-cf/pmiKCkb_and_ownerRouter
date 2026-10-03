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
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
  RENEWAL_WORKSPACE_COLLECTIONS,
} from "@/lib/firestore/renewal-workspace";
import type { RenewalWorkBasis } from "@/lib/lease-renewal/workspace-state";
import {
  capturedTrend,
  marketBasisFromCapturedResult,
  type CapturedCompResult,
  type RenewalMarketObservation,
} from "@/lib/lease-renewal/market-observation";

// S154: a comp lookup needs no cycle step. The client may still name the work record it shows;
// the server binds the retained evidence to the lease's current work record, established by this
// save when none exists yet.
export const CompCaptureSchema = z
  .object({
    cycleId: z.string().uuid().nullable().optional(),
    compObservationId: z.string().uuid().optional(),
  })
  .strict();
/** Staff authority for retaining a lookup, and the exact comp identity a linked trend names. */
export async function assertCompCaptureAllowed(
  actor: AuthenticatedUser,
  leaseId: string,
  compObservationId?: string,
  db: Firestore = getAdminFirestore(),
) {
  if (!can(actor.role, "edit") || isVerificationAccount(actor))
    throw new EditableLayerError(
      "Staff authority is required to retain a comp lookup.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (compObservationId) {
    const cycleId = (await getRenewalWorkspace(actor, leaseId, db))?.cycleId ?? null;
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
        "Choose comps saved with this lease's current work before the linked trend lookup.",
        409,
      );
  }
}
/** Called only with the actual normalized response of the existing governed comp route. */
export async function captureMarketObservation(
  actor: AuthenticatedUser,
  leaseId: string,
  requested: z.infer<typeof CompCaptureSchema>,
  operation: "comps" | "trend",
  payload: Record<string, unknown>,
  db: Firestore = getAdminFirestore(),
  resolveBasis?: () => Promise<RenewalWorkBasis | null>,
) {
  if (!can(actor.role, "edit") || isVerificationAccount(actor))
    throw new EditableLayerError("Staff authority is required.", 403);
  assertMutationAllowed(requireEnvironmentDescriptor());
  // The returned evidence is the actual save: it reuses the current work record or establishes it.
  const capture = {
    ...requested,
    cycleId: (await ensureRenewalWorkRecord(actor, leaseId, db, resolveBasis)).cycleId,
  };
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
