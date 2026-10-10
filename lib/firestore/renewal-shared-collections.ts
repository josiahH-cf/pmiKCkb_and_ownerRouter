// S201 shared app-owned reviewed membership with private actor-bound receipts and CAS history.
import { createHash } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import {
  CollectionPrepareSchema,
  CollectionConfirmSchema,
  CollectionRenameSchema,
  collectionDifference,
  projectCollectionStatuses,
  type CollectionSource,
  type CollectionReview,
  type CollectionMember,
  type SharedLeaseCollection,
} from "@/lib/lease-renewal/shared-collections";
export const SHARED_COLLECTIONS = {
  heads: "renewal_shared_lease_collections",
  reviews: "renewal_shared_collection_reviews",
  operations: "renewal_shared_collection_operations",
  versions: "versions",
} as const;
const hash = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex");
function actor(a: AuthenticatedUser, write = false) {
  if (
    a.hd !== "pmikcmetro.com" ||
    !a.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    !["Editor", "Approver", "Admin"].includes(a.role) ||
    !hasSpaceAccess(a, "renewals") ||
    !can(a.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(a))
  )
    throw new EditableLayerError(
      "Current managed Renewal staff access is required.",
      403,
    );
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
}
function conflict(): never {
  throw new EditableLayerError(
    "This collection changed. Your input is kept; read its current version and review the difference again.",
    409,
  );
}
function resolveMembers(
  source: CollectionSource,
  basis: CollectionReview["basis"],
): CollectionMember[] {
  if (!source.complete || !source.readAt)
    throw new EditableLayerError(
      "A complete current lease and cycle read is required before membership can change. Stored membership is kept.",
      409,
    );
  const ids = basis.mode === "explicit" ? basis.selectedLeaseIds : source.matches(basis);
  if (ids.length > 2000)
    throw new EditableLayerError(
      "This selection exceeds 2,000 members. Narrow the period or filters.",
      409,
    );
  const byId = new Map(source.records.map((r) => [r.member.leaseId, r.member]));
  if (byId.size !== source.records.length || new Set(ids).size !== ids.length)
    throw new EditableLayerError(
      "The source contains an ambiguous lease identity. Membership changes are held.",
      409,
    );
  const members = ids.map((id) => byId.get(id));
  if (members.some((m) => !m))
    throw new EditableLayerError(
      "A selected lease or its current cycle is unavailable. Review the actual accessible members.",
      409,
    );
  return (members as CollectionMember[]).sort((a, b) =>
    a.leaseId.localeCompare(b.leaseId),
  );
}
export class RenewalSharedCollectionStore {
  constructor(
    readonly db: Firestore = getAdminFirestore(),
    readonly now: () => Date = () => new Date(),
  ) {}
  private head(id: string) {
    return this.db.collection(SHARED_COLLECTIONS.heads).doc(z.string().uuid().parse(id));
  }
  private operation(a: AuthenticatedUser, id: string) {
    z.string().uuid().parse(id);
    return this.db.collection(SHARED_COLLECTIONS.operations).doc(hash([a.uid, id]));
  }
  async get(a: AuthenticatedUser, id: string) {
    actor(a);
    const d = await this.head(id).get();
    return d.exists ? (d.data() as SharedLeaseCollection) : null;
  }
  async list(a: AuthenticatedUser, after: string | null = null) {
    actor(a);
    if (after) z.string().uuid().parse(after);
    let q = this.db.collection(SHARED_COLLECTIONS.heads).orderBy(FieldPath.documentId());
    if (after) q = q.startAfter(after);
    const page = await q.limit(51).get();
    return {
      collections: page.docs.slice(0, 50).map((d) => d.data() as SharedLeaseCollection),
      nextCursor: page.size > 50 ? page.docs[49].id : null,
    };
  }
  async readReview(a: AuthenticatedUser, id: string) {
    actor(a);
    z.string().uuid().parse(id);
    const d = await this.db
      .collection(SHARED_COLLECTIONS.reviews)
      .doc(hash([a.uid, id]))
      .get();
    if (!d.exists || d.get("actorUid") !== a.uid)
      throw new EditableLayerError("Reviewed selection unavailable.", 404);
    return { review: d.get("review") as CollectionReview };
  }
  async statuses(a: AuthenticatedUser, id: string, source: CollectionSource) {
    const collection = await this.get(a, id);
    if (!collection) throw new EditableLayerError("Collection not found.", 404);
    return {
      collection,
      statuses: projectCollectionStatuses(collection, source),
      readAt: source.readAt,
      complete: source.complete,
      issues: source.issues,
    };
  }
  async receipt(a: AuthenticatedUser, id: string) {
    actor(a);
    const saved = await this.operation(a, id).get();
    if (!saved.exists) return { state: "not_recorded" as const };
    if (saved.get("actorUid") !== a.uid)
      throw new EditableLayerError("Receipt unavailable.", 404);
    const current = await this.get(a, saved.get("collectionId"));
    return {
      state: "recorded" as const,
      acceptedVersion: saved.get("acceptedVersion") as number,
      collection: current,
    };
  }
  async review(
    a: AuthenticatedUser,
    raw: z.input<typeof CollectionPrepareSchema>,
    source: CollectionSource,
  ) {
    actor(a, true);
    const input = CollectionPrepareSchema.parse(raw),
      members = resolveMembers(source, input.basis),
      ref = this.head(input.collectionId),
      reviewRef = this.db
        .collection(SHARED_COLLECTIONS.reviews)
        .doc(hash([a.uid, input.reviewId]));
    const requestHash = hash(input),
      now = this.now(),
      at = now.toISOString();
    return this.db.runTransaction(async (tx) => {
      const [old, saved] = await Promise.all([tx.get(ref), tx.get(reviewRef)]);
      if (saved.exists) {
        if (saved.get("requestHash") !== requestHash) conflict();
        return saved.get("review") as CollectionReview;
      }
      if ((old.exists ? old.get("version") : 0) !== input.expectedVersion) conflict();
      const prior = old.exists ? (old.data() as SharedLeaseCollection) : null;
      const review: CollectionReview = {
        id: input.reviewId,
        collectionId: input.collectionId,
        expectedVersion: input.expectedVersion,
        name: input.name,
        basis: input.basis,
        members,
        ...collectionDifference(prior?.members ?? [], members),
        sourceReadAt: source.readAt!,
        createdAt: at,
        expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
      };
      tx.create(reviewRef, { actorUid: a.uid, requestHash, review });
      return review;
    });
  }
  async save(
    a: AuthenticatedUser,
    raw: z.input<typeof CollectionConfirmSchema>,
    source: () => Promise<CollectionSource>,
  ) {
    actor(a, true);
    const input = CollectionConfirmSchema.parse(raw),
      op = this.operation(a, input.operationId),
      reviewRef = this.db
        .collection(SHARED_COLLECTIONS.reviews)
        .doc(hash([a.uid, input.reviewId])),
      requestHash = hash(input);
    // Reconcile an already committed intent before source reads; an outage never dispatches it again.
    const done = await op.get();
    if (done.exists) {
      if (done.get("requestHash") !== requestHash) conflict();
      return this.receipt(a, input.operationId);
    }
    const prepared = await reviewRef.get();
    if (!prepared.exists || prepared.get("actorUid") !== a.uid)
      throw new EditableLayerError("That reviewed selection is unavailable.", 404);
    const review = prepared.get("review") as CollectionReview;
    if (Date.parse(review.expiresAt) < this.now().getTime())
      throw new EditableLayerError(
        "Review the current membership again; this review expired.",
        409,
      );
    const fresh = await source(),
      members = resolveMembers(fresh, review.basis);
    if (hash(members) !== hash(review.members))
      throw new EditableLayerError(
        "The qualifying leases or cycles changed. Review the new membership difference before saving.",
        409,
      );
    return this.db.runTransaction(async (tx) => {
      const [prior, latest, reviewAgain] = await Promise.all([
        tx.get(op),
        tx.get(this.head(review.collectionId)),
        tx.get(reviewRef),
      ]);
      if (prior.exists) {
        if (prior.get("requestHash") !== requestHash) conflict();
        return {
          state: "recorded" as const,
          acceptedVersion: prior.get("acceptedVersion") as number,
          collection: latest.data() as SharedLeaseCollection,
        };
      }
      if (Date.parse(review.expiresAt) < this.now().getTime())
        throw new EditableLayerError(
          "Review the current membership again; this review expired.",
          409,
        );
      if (
        !reviewAgain.exists ||
        reviewAgain.get("actorUid") !== a.uid ||
        hash(reviewAgain.get("review")) !== hash(review) ||
        (latest.exists ? latest.get("version") : 0) !== review.expectedVersion
      )
        conflict();
      const previous = latest.exists ? (latest.data() as SharedLeaseCollection) : null,
        at = this.now().toISOString();
      const collection: SharedLeaseCollection = {
        schemaVersion: "shared-renewal-collection/v1",
        id: review.collectionId,
        name: review.name,
        basis: review.basis,
        members: review.members,
        version: review.expectedVersion + 1,
        createdAt: previous?.createdAt ?? at,
        createdByUid: previous?.createdByUid ?? a.uid,
        updatedAt: at,
        updatedByUid: a.uid,
        sourceReadAt: fresh.readAt!,
      };
      tx.set(this.head(collection.id), collection);
      tx.create(
        this.head(collection.id)
          .collection(SHARED_COLLECTIONS.versions)
          .doc(String(collection.version)),
        { ...collection, reviewId: review.id, operationId: input.operationId },
      );
      tx.create(op, {
        actorUid: a.uid,
        requestHash,
        collectionId: collection.id,
        acceptedVersion: collection.version,
        recordedAt: at,
      });
      return {
        state: "recorded" as const,
        acceptedVersion: collection.version,
        collection,
      };
    });
  }
  async rename(a: AuthenticatedUser, raw: z.input<typeof CollectionRenameSchema>) {
    actor(a, true);
    const input = CollectionRenameSchema.parse(raw),
      op = this.operation(a, input.operationId),
      ref = this.head(input.collectionId),
      requestHash = hash(input);
    return this.db.runTransaction(async (tx) => {
      const [prior, old] = await Promise.all([tx.get(op), tx.get(ref)]);
      if (!old.exists) throw new EditableLayerError("Collection not found.", 404);
      if (prior.exists) {
        if (prior.get("requestHash") !== requestHash) conflict();
        return {
          state: "recorded" as const,
          acceptedVersion: prior.get("acceptedVersion") as number,
          collection: old.data() as SharedLeaseCollection,
        };
      }
      if (old.get("version") !== input.expectedVersion) conflict();
      const at = this.now().toISOString(),
        collection = {
          ...(old.data() as SharedLeaseCollection),
          name: input.name,
          version: input.expectedVersion + 1,
          updatedAt: at,
          updatedByUid: a.uid,
        };
      tx.set(ref, collection);
      tx.create(
        ref.collection(SHARED_COLLECTIONS.versions).doc(String(collection.version)),
        { ...collection, operationId: input.operationId },
      );
      tx.create(op, {
        actorUid: a.uid,
        requestHash,
        collectionId: collection.id,
        acceptedVersion: collection.version,
        recordedAt: at,
      });
      return {
        state: "recorded" as const,
        acceptedVersion: collection.version,
        collection,
      };
    });
  }
}
