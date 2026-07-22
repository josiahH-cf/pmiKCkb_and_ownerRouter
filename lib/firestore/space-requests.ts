// KB-owned persistence for Admin "request a new Space" intake (Slice 7, D12).
//
// One append-only record per request (Admin captures name/scope/intended sources). It changes NO system
// of record and provisions nothing: the record is the intent, and the provisioning commands are generated
// separately (lib/admin/space-request-commands.ts) for the owner to run by hand. Admin-only by
// construction here AND at the route; Firestore rules deny every client write, so the browser can never
// forge one.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { slugifySpaceId } from "@/lib/admin/space-request-commands";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const SPACE_REQUESTS_COLLECTION = "space_requests";

export const CreateSpaceRequestInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    scope: z.string().trim().min(3).max(1000),
    intendedSources: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  })
  .strict();

export type CreateSpaceRequestInput = z.infer<typeof CreateSpaceRequestInputSchema>;

export interface SpaceRequest {
  id: string;
  name: string;
  /** Derived kebab slug (the Space key + Vertex data-store id the provisioning commands use). */
  spaceId: string;
  scope: string;
  intendedSources: string[];
  status: "requested";
  requestedByUid: string;
  createdAt: string | null;
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Only an Admin can request a new Space.", 403);
  }
}

/** Record a new Space request (Admin only). Returns the saved, canonical record. */
export async function createSpaceRequest(
  actor: AuthenticatedUser,
  input: CreateSpaceRequestInput,
  db: Firestore = getAdminFirestore(),
): Promise<SpaceRequest> {
  assertAdmin(actor);
  const parsed = CreateSpaceRequestInputSchema.parse(input);
  const id = uuidv7();
  const spaceId = slugifySpaceId(parsed.name);
  const ref = db.collection(SPACE_REQUESTS_COLLECTION).doc(id);
  await ref.set({
    id,
    name: parsed.name,
    space_id: spaceId,
    scope: parsed.scope,
    intended_sources: parsed.intendedSources,
    status: "requested",
    requested_by_uid: actor.uid,
    created_at: FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  const record = saved.data();
  if (!record) {
    throw new EditableLayerError("The Space request could not be read back.", 404);
  }
  return toSpaceRequest(record);
}

/** List every Space request, newest first (Admin only). */
export async function listSpaceRequests(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<SpaceRequest[]> {
  assertAdmin(actor);
  const snapshot = await db.collection(SPACE_REQUESTS_COLLECTION).get();
  return snapshot.docs
    .map((doc) => toSpaceRequest(doc.data()))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

function toSpaceRequest(record: Record<string, unknown>): SpaceRequest {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    spaceId: String(record.space_id ?? ""),
    scope: String(record.scope ?? ""),
    intendedSources: Array.isArray(record.intended_sources)
      ? record.intended_sources.map((source) => String(source))
      : [],
    status: "requested",
    requestedByUid: String(record.requested_by_uid ?? ""),
    createdAt: normalizeTimestamp(record.created_at),
  };
}

/** Normalize a Firestore Timestamp (or already-ISO string) to an ISO string, or null when absent. */
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
