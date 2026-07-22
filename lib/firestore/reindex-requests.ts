// KB-owned persistence for the Admin "re-index sources" request (Slice 8, D14).
//
// A re-index request is INTENT only: Vertex ingestion is cost-bearing and CLI-only, so this layer never
// ingests. It records an Admin-confirmed request; the owner then runs the printed command. The input
// schema REQUIRES confirm:true, so the route refuses to stage a request without explicit confirmation.
// Admin-only here AND at the route; Firestore rules deny every client write.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const REINDEX_REQUESTS_COLLECTION = "reindex_requests";

export const CreateReindexRequestInputSchema = z
  .object({
    spaceId: z.string().trim().min(1).max(60),
    // The confirmation gate: the request is refused unless the Admin explicitly confirms. Vertex
    // ingestion is cost-bearing, so a re-index is never staged on an accidental click.
    confirm: z.literal(true),
  })
  .strict();

export type CreateReindexRequestInput = z.infer<typeof CreateReindexRequestInputSchema>;

export interface ReindexRequest {
  id: string;
  spaceId: string;
  status: "requested";
  requestedByUid: string;
  createdAt: string | null;
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Only an Admin can request a re-index.", 403);
  }
}

/** Record an Admin-confirmed re-index request (Admin only). Ingests NOTHING. */
export async function createReindexRequest(
  actor: AuthenticatedUser,
  input: CreateReindexRequestInput,
  db: Firestore = getAdminFirestore(),
): Promise<ReindexRequest> {
  assertAdmin(actor);
  const parsed = CreateReindexRequestInputSchema.parse(input);
  const id = uuidv7();
  const ref = db.collection(REINDEX_REQUESTS_COLLECTION).doc(id);
  await ref.set({
    id,
    space_id: parsed.spaceId,
    status: "requested",
    requested_by_uid: actor.uid,
    created_at: FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  const record = saved.data();
  if (!record) {
    throw new EditableLayerError("The re-index request could not be read back.", 404);
  }
  return toReindexRequest(record);
}

/** List every re-index request, newest first (Admin only). */
export async function listReindexRequests(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<ReindexRequest[]> {
  assertAdmin(actor);
  const snapshot = await db.collection(REINDEX_REQUESTS_COLLECTION).get();
  return snapshot.docs
    .map((doc) => toReindexRequest(doc.data()))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

function toReindexRequest(record: Record<string, unknown>): ReindexRequest {
  return {
    id: String(record.id ?? ""),
    spaceId: String(record.space_id ?? ""),
    status: "requested",
    requestedByUid: String(record.requested_by_uid ?? ""),
    createdAt: normalizeTimestamp(record.created_at),
  };
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  return null;
}
