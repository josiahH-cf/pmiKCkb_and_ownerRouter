// S34 (ARCH-S34-2): the server-only store for each lease's Dotloop loop association.
//
// The association is the lease/cycle target every packet upload uses. It is written only here:
// staff link a reviewed existing loop or correct the current link (audited current-state actions),
// the S20 claim reserves an app creation or the first folder creation, and a receipted execution
// records the created loop, the durable folder and each uploaded document version. An owner index
// keeps a loop recorded for one lease from being linked to another. Nothing here calls a provider
// or rewrites a receipt.

import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  FOLDER_RESERVATION_STALE_MS,
  LOOP_ASSOCIATION_SCHEMA_VERSION,
  loopAssociationDocId,
  loopOwnerDocId,
  type LoopAssociation,
  type LoopAssociationDocument,
  type LoopAssociationReadback,
  type LoopPendingUpload,
} from "@/lib/lease-documents/dotloop-loop-association";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";

const ACTION_EXECUTIONS_COLLECTION = "action_executions";

export const LOOP_ASSOCIATION_COLLECTIONS = {
  associations: "lease_document_loop_associations",
  owners: "lease_document_loop_owners",
  activity: "lease_document_loop_association_activity",
} as const;

const text = z.string().min(1).max(500);
const iso = z.string().min(10).max(40);
const DocumentSchema = z
  .object({
    artifactId: text,
    documentRef: text,
    label: z.string().max(200),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    snapshotId: text,
    derivedArtifactId: text.nullable(),
    receiptId: text,
    dotloopDocumentId: text,
    dotloopFolderId: text,
    documentName: z.string().max(500),
    uploadedAt: iso,
    uploadedByUid: text,
    supersedesContentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
const AssociationSchema = z
  .object({
    schemaVersion: z.literal(LOOP_ASSOCIATION_SCHEMA_VERSION),
    leaseId: text,
    cycleId: text,
    state: z.enum(["creating", "current", "unlinked"]),
    linkRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    profileId: text,
    loopId: text.nullable(),
    loopName: z.string().max(500).nullable(),
    loopUrl: z.string().max(2000).nullable(),
    origin: z.enum(["app_created", "linked_existing"]),
    createExecutionId: text.nullable(),
    linkedByUid: text,
    linkedAt: iso,
    reason: z.string().max(500),
    priorCycleIds: z.array(text).max(50),
    folder: z
      .object({ dotloopFolderId: text, createdByExecutionId: text, recordedAt: iso })
      .strict()
      .nullable(),
    folderReservation: z
      .object({ executionId: text, reservedAt: iso })
      .strict()
      .nullable(),
    documents: z.array(DocumentSchema).max(500),
    pendingUploads: z
      .array(
        z
          .object({
            executionId: text,
            loopId: text,
            documentRef: text,
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            claimedAt: iso,
          })
          .strict(),
      )
      .max(200)
      .optional(),
    readback: z
      .object({
        readBackAt: iso,
        loopStatus: z.string().max(200).nullable(),
        participantCount: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    updatedAt: iso,
    updatedByUid: text,
  })
  .strict();

const RETENTION_KEYS = [
  "product_retention_policy",
  "product_retention_class",
  "legal_hold",
];

/** A stored association, or null when absent. A malformed record refuses rather than guessing. */
export function parseLoopAssociation(data: unknown): LoopAssociation | null {
  if (data === undefined || data === null) return null;
  const record = { ...(data as Record<string, unknown>) };
  for (const key of RETENTION_KEYS) delete record[key];
  const parsed = AssociationSchema.safeParse(record);
  if (!parsed.success)
    throw new EditableLayerError(
      "The lease's Dotloop loop record could not be read. Its evidence is retained for review.",
      409,
    );
  return parsed.data as LoopAssociation;
}

export function loopAssociationRef(db: Firestore, leaseId: string) {
  return db
    .collection(LOOP_ASSOCIATION_COLLECTIONS.associations)
    .doc(loopAssociationDocId(leaseId));
}

export async function readLoopAssociation(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LoopAssociation | null> {
  return parseLoopAssociation((await loopAssociationRef(db, leaseId).get()).data());
}

export async function readLoopAssociationIn(
  transaction: Transaction,
  db: Firestore,
  leaseId: string,
): Promise<LoopAssociation | null> {
  return parseLoopAssociation(
    (await transaction.get(loopAssociationRef(db, leaseId))).data(),
  );
}

function stored(association: LoopAssociation) {
  return stampProductRecordRetention(
    "lease_renewal_progress",
    JSON.parse(JSON.stringify(association)) as Record<string, unknown>,
  );
}

function activity(
  transaction: Transaction,
  db: Firestore,
  entry: Record<string, unknown>,
) {
  const id = uuidv7();
  transaction.create(
    db.collection(LOOP_ASSOCIATION_COLLECTIONS.activity).doc(id),
    stampProductRecordRetention("lease_renewal_progress", { id, ...entry }),
  );
}

function assertStaffWrite(actor: AuthenticatedUser) {
  if (!can(actor.role, renewalRoleCapability("link_dotloop_loop")))
    throw new EditableLayerError(
      "Editor access is required to link or correct the lease's Dotloop loop.",
      403,
    );
  if (isVerificationAccount(actor))
    throw new EditableLayerError(
      "Verification accounts cannot change the lease's Dotloop loop.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
}

/** What staff reviewed about an existing loop through the company connection. */
export interface ReviewedLoopObservation {
  readonly profileId: string;
  readonly loopId: string;
  readonly name: string;
  readonly status: string | null;
  readonly loopUrl: string | null;
  readonly participantCount: number | null;
  readonly participants: ReadonlyArray<{ fullName: string; email: string; role: string }>;
}

/** The hash a link confirmation must match: the loop changed if this changed. */
export function reviewedLoopHash(observation: ReviewedLoopObservation): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        profileId: observation.profileId,
        loopId: observation.loopId,
        name: observation.name,
        status: observation.status,
        participants: [...observation.participants]
          .map((participant) => [
            participant.fullName,
            participant.email.toLowerCase(),
            participant.role,
          ])
          .sort(),
      }),
    )
    .digest("hex");
}

/** How the reviewed loop relates to what the app already records, for the review screen. */
export async function describeLoopForLease(
  leaseId: string,
  profileId: string,
  loopId: string,
  db: Firestore = getAdminFirestore(),
): Promise<{
  recordedForOtherLease: boolean;
  earlierCycleIds: string[];
  current: LoopAssociation | null;
}> {
  const [owner, current] = await Promise.all([
    db
      .collection(LOOP_ASSOCIATION_COLLECTIONS.owners)
      .doc(loopOwnerDocId(profileId, loopId))
      .get(),
    readLoopAssociation(leaseId, db),
  ]);
  return {
    recordedForOtherLease: owner.exists && owner.get("leaseId") !== leaseId,
    earlierCycleIds: owner.exists ? ((owner.get("cycleIds") as string[]) ?? []) : [],
    current,
  };
}

/**
 * Link an existing loop the staff member reviewed. The caller re-read the loop through the company
 * connection immediately before and passes that observation; a loop recorded for another lease, a
 * different current loop, an unresolved app creation or an unconfirmed reuse from an earlier cycle
 * refuses. Linking grants no provider receipt and is corrected only through `unlinkLeaseLoop`.
 */
export async function linkExistingLoop(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    observation: ReviewedLoopObservation;
    reason: string;
    expectedLinkRevision: number;
    reuseAcrossCycles: boolean;
  },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<LoopAssociation> {
  assertStaffWrite(actor);
  const reason = input.reason.trim();
  if (reason.length < 3)
    throw new EditableLayerError("Say why this loop belongs to this lease.", 400);
  const { observation } = input;
  const ref = loopAssociationRef(db, input.leaseId);
  const ownerRef = db
    .collection(LOOP_ASSOCIATION_COLLECTIONS.owners)
    .doc(loopOwnerDocId(observation.profileId, observation.loopId));
  return db.runTransaction(async (transaction) => {
    const [current, owner] = await Promise.all([
      readLoopAssociationIn(transaction, db, input.leaseId),
      transaction.get(ownerRef),
    ]);
    if (owner.exists && owner.get("leaseId") !== input.leaseId)
      throw new EditableLayerError(
        "This Dotloop loop is recorded for a different lease, so it cannot be linked here.",
        409,
      );
    if ((current?.linkRevision ?? 0) !== input.expectedLinkRevision)
      throw new EditableLayerError(
        "The lease's Dotloop loop changed since this page was loaded. Reload before linking.",
        409,
      );
    if (current?.state === "creating")
      throw new EditableLayerError(
        "An app loop creation for this lease is unresolved. Recover that attempt, or correct the link first.",
        409,
      );
    if (current?.state === "current" && current.loopId !== observation.loopId)
      throw new EditableLayerError(
        "This lease already has a current Dotloop loop. Correct that link before linking another.",
        409,
      );
    const sameLoop = current?.loopId === observation.loopId;
    if (current?.state === "current" && sameLoop && current.cycleId === input.cycleId)
      throw new EditableLayerError(
        "This loop is already linked for the current renewal cycle.",
        409,
      );
    const earlierCycles = owner.exists ? ((owner.get("cycleIds") as string[]) ?? []) : [];
    const reusedFromEarlierCycle =
      earlierCycles.some((cycleId) => cycleId !== input.cycleId) ||
      (sameLoop && current!.cycleId !== input.cycleId);
    if (reusedFromEarlierCycle && !input.reuseAcrossCycles)
      throw new EditableLayerError(
        "This loop served an earlier renewal cycle of this lease. Confirm that it is reused for the current cycle.",
        409,
      );
    const next: LoopAssociation = {
      schemaVersion: LOOP_ASSOCIATION_SCHEMA_VERSION,
      leaseId: input.leaseId,
      cycleId: input.cycleId,
      state: "current",
      linkRevision: (current?.linkRevision ?? 0) + 1,
      revision: (current?.revision ?? 0) + 1,
      profileId: observation.profileId,
      loopId: observation.loopId,
      loopName: observation.name,
      loopUrl: observation.loopUrl,
      origin: sameLoop ? current!.origin : "linked_existing",
      createExecutionId: sameLoop ? current!.createExecutionId : null,
      linkedByUid: actor.uid,
      linkedAt: now,
      reason,
      priorCycleIds: sameLoop
        ? [
            ...new Set([
              ...current!.priorCycleIds,
              ...(current!.cycleId !== input.cycleId ? [current!.cycleId] : []),
            ]),
          ]
        : earlierCycles.filter((cycleId) => cycleId !== input.cycleId),
      folder: sameLoop ? current!.folder : null,
      folderReservation: null,
      documents: sameLoop ? current!.documents : [],
      readback: {
        readBackAt: now,
        loopStatus: observation.status,
        participantCount: observation.participantCount,
      },
      updatedAt: now,
      updatedByUid: actor.uid,
    };
    transaction.set(ref, stored(next));
    transaction.set(
      ownerRef,
      stampProductRecordRetention("lease_renewal_progress", {
        leaseId: input.leaseId,
        profileId: observation.profileId,
        loopId: observation.loopId,
        cycleIds: [...new Set([...earlierCycles, input.cycleId])],
        origin: next.origin,
        recordedAt: now,
      }),
    );
    activity(transaction, db, {
      action: "loop_linked",
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      loop_id: observation.loopId,
      profile_id: observation.profileId,
      origin: next.origin,
      reused_across_cycles: reusedFromEarlierCycle,
      reason,
      actor_uid: actor.uid,
      created_at: now,
    });
    return next;
  });
}

/**
 * Correct the lease's current link (or clear an unresolved creation). The loop and every document
 * in Dotloop are untouched: the provider documents no deletion, and a person retires files or
 * archives a loop in Dotloop. Upload history and receipts stay readable.
 */
export async function unlinkLeaseLoop(
  actor: AuthenticatedUser,
  input: { leaseId: string; expectedLinkRevision: number; reason: string },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<LoopAssociation> {
  assertStaffWrite(actor);
  const reason = input.reason.trim();
  if (reason.length < 3)
    throw new EditableLayerError("Say why the lease's Dotloop link is corrected.", 400);
  const ref = loopAssociationRef(db, input.leaseId);
  return db.runTransaction(async (transaction) => {
    const current = await readLoopAssociationIn(transaction, db, input.leaseId);
    if (!current || current.state === "unlinked")
      throw new EditableLayerError(
        "This lease has no current Dotloop link to correct.",
        409,
      );
    if (current.linkRevision !== input.expectedLinkRevision)
      throw new EditableLayerError(
        "The lease's Dotloop loop changed since this page was loaded. Reload before correcting it.",
        409,
      );
    // An app creation still running, or one that succeeded, is never cleared: its own result (or
    // its recovery) links the created loop. Only a failed or uncertain creation is cleared.
    if (current.state === "creating" && current.createExecutionId) {
      const creation = (
        await transaction.get(
          db.collection(ACTION_EXECUTIONS_COLLECTION).doc(current.createExecutionId),
        )
      ).get("state");
      if (creation === "Executing")
        throw new EditableLayerError(
          "The loop creation is still running. Wait for its result before clearing it.",
          409,
        );
      if (creation === "Succeeded")
        throw new EditableLayerError(
          "The loop was created. Recover its attempt to make it the lease's loop.",
          409,
        );
    }
    const ownerRef = current.loopId
      ? db
          .collection(LOOP_ASSOCIATION_COLLECTIONS.owners)
          .doc(loopOwnerDocId(current.profileId, current.loopId))
      : null;
    // A mistaken link that never received an upload frees the loop for its right lease. A loop the
    // app created or uploaded into stays recorded for this lease.
    const releaseOwner =
      ownerRef !== null &&
      current.origin === "linked_existing" &&
      current.documents.length === 0 &&
      current.priorCycleIds.length === 0;
    const next: LoopAssociation = {
      ...current,
      state: "unlinked",
      linkRevision: current.linkRevision + 1,
      revision: current.revision + 1,
      folderReservation: null,
      reason,
      updatedAt: now,
      updatedByUid: actor.uid,
    };
    transaction.set(ref, stored(next));
    if (releaseOwner) transaction.delete(ownerRef!);
    activity(transaction, db, {
      action: current.state === "creating" ? "creation_cleared" : "loop_unlinked",
      lease_id: input.leaseId,
      cycle_id: current.cycleId,
      ...(current.loopId ? { loop_id: current.loopId } : {}),
      ...(current.createExecutionId
        ? { create_execution_id: current.createExecutionId }
        : {}),
      owner_released: releaseOwner,
      reason,
      actor_uid: actor.uid,
      created_at: now,
    });
    return next;
  });
}

/**
 * Inside the S20 claim transaction (after its reads): reserve this lease for one app loop creation.
 * A current link or another unresolved creation refuses, so a changed packet can never create a
 * second loop. Returns the write to apply once every read is done.
 */
export function planLoopCreationClaim(
  current: LoopAssociation | null,
  input: {
    leaseId: string;
    cycleId: string;
    profileId: string;
    executionId: string;
    actorUid: string;
    now: string;
  },
): LoopAssociation | null {
  if (current?.state === "creating" && current.createExecutionId === input.executionId)
    return null;
  if (current?.state === "current" || current?.state === "creating")
    throw new EditableLayerError(
      "This lease already has a Dotloop loop or an unresolved loop creation. Upload into the linked loop, or correct the link first.",
      409,
    );
  return {
    schemaVersion: LOOP_ASSOCIATION_SCHEMA_VERSION,
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    state: "creating",
    linkRevision: (current?.linkRevision ?? 0) + 1,
    revision: (current?.revision ?? 0) + 1,
    profileId: input.profileId,
    loopId: null,
    loopName: null,
    loopUrl: null,
    origin: "app_created",
    createExecutionId: input.executionId,
    linkedByUid: input.actorUid,
    linkedAt: input.now,
    reason: "App loop creation confirmed",
    priorCycleIds: [],
    folder: null,
    folderReservation: null,
    documents: [],
    readback: null,
    updatedAt: input.now,
    updatedByUid: input.actorUid,
  };
}

/**
 * Inside the S20 claim transaction: the confirmed upload still targets the lease's current loop;
 * the same version is never sent again while an earlier attempt into that loop is in flight or
 * uncertain; and only one attempt may create the packet folder while none is recorded. A folder
 * holder still executing after FOLDER_RESERVATION_STALE_MS is treated as stalled and taken over.
 * `attemptStates` holds the S20 states of the other attempts named in the association.
 */
export function planUploadClaim(
  current: LoopAssociation | null,
  input: {
    loopId: string;
    linkRevision: number;
    cycleId: string;
    documentRef: string;
    contentHash: string;
    executionId: string;
    actorUid: string;
    now: string;
    attemptStates: Readonly<Record<string, string | null>>;
  },
): LoopAssociation | null {
  if (
    !current ||
    current.state !== "current" ||
    current.loopId !== input.loopId ||
    current.linkRevision !== input.linkRevision ||
    current.cycleId !== input.cycleId
  )
    throw new EditableLayerError(
      "The lease's Dotloop loop changed after preview. Review the current loop before uploading.",
      409,
    );
  if (
    current.documents.some(
      (document) =>
        document.documentRef === input.documentRef &&
        document.contentHash === input.contentHash,
    )
  )
    throw new EditableLayerError(
      "This exact document version is already in the linked loop; its upload receipt is reused.",
      409,
    );
  const pending = current.pendingUploads ?? [];
  // A definitively failed attempt sent nothing, so it no longer holds its version.
  const kept = pending.filter(
    (entry) =>
      entry.executionId === input.executionId ||
      input.attemptStates[entry.executionId] !== "Failed",
  );
  if (
    kept.some(
      (entry) =>
        entry.executionId !== input.executionId &&
        entry.loopId === input.loopId &&
        entry.contentHash === input.contentHash,
    )
  )
    throw new EditableLayerError(
      "An earlier upload of this exact version into the linked loop has no confirmed outcome. Check the loop in Dotloop; the app never sends an uncertain upload again.",
      409,
    );
  const own = kept.some((entry) => entry.executionId === input.executionId);
  const pendingUploads: LoopPendingUpload[] = own
    ? kept
    : [
        ...kept,
        {
          executionId: input.executionId,
          loopId: input.loopId,
          documentRef: input.documentRef,
          contentHash: input.contentHash,
          claimedAt: input.now,
        },
      ];
  let folderReservation = current.folderReservation;
  if (!current.folder && folderReservation?.executionId !== input.executionId) {
    const holder = folderReservation;
    const stalled =
      holder !== null &&
      Date.parse(input.now) - Date.parse(holder.reservedAt) >=
        FOLDER_RESERVATION_STALE_MS;
    if (holder && input.attemptStates[holder.executionId] === "Executing" && !stalled)
      throw new EditableLayerError(
        "Another upload is creating this loop's packet folder. Retry after it finishes.",
        409,
      );
    folderReservation = { executionId: input.executionId, reservedAt: input.now };
  }
  if (
    own &&
    kept.length === pending.length &&
    folderReservation === current.folderReservation
  )
    return null;
  return {
    ...current,
    revision: current.revision + 1,
    pendingUploads,
    folderReservation,
    updatedAt: input.now,
    updatedByUid: input.actorUid,
  };
}

/** The activity a planned upload claim records. */
export function uploadClaimAction(
  current: LoopAssociation,
  next: LoopAssociation,
  executionId: string,
): string {
  if (next.folderReservation?.executionId !== executionId) return "upload_claimed";
  if (current.folderReservation?.executionId === executionId) return "upload_claimed";
  return current.folderReservation
    ? "folder_reservation_taken_over"
    : "folder_creation_reserved";
}

/**
 * After a definitively failed upload attempt (nothing was sent): it no longer holds its version.
 * An uncertain attempt is never released here.
 */
export async function releasePendingUpload(
  input: { leaseId: string; executionId: string },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<void> {
  const ref = loopAssociationRef(db, input.leaseId);
  await db.runTransaction(async (transaction) => {
    const current = await readLoopAssociationIn(transaction, db, input.leaseId);
    const pending = current?.pendingUploads ?? [];
    if (!current || !pending.some((entry) => entry.executionId === input.executionId))
      return;
    const state = (
      await transaction.get(
        db.collection(ACTION_EXECUTIONS_COLLECTION).doc(input.executionId),
      )
    ).get("state");
    if (state !== "Failed") return;
    transaction.set(
      ref,
      stored({
        ...current,
        revision: current.revision + 1,
        pendingUploads: pending.filter(
          (entry) => entry.executionId !== input.executionId,
        ),
        updatedAt: now,
      }),
    );
    activity(transaction, db, {
      action: "upload_released_after_failure",
      lease_id: input.leaseId,
      execution_id: input.executionId,
      created_at: now,
    });
  });
}

/** Apply a claim-time association write planned above. */
export function writeClaimedAssociation(
  transaction: Transaction,
  db: Firestore,
  association: LoopAssociation,
  action: string,
  executionId: string,
) {
  transaction.set(loopAssociationRef(db, association.leaseId), stored(association));
  activity(transaction, db, {
    action,
    lease_id: association.leaseId,
    cycle_id: association.cycleId,
    execution_id: executionId,
    actor_uid: association.updatedByUid,
    created_at: association.updatedAt,
  });
}

/**
 * After a receipted, read-back app creation: the reserved creation becomes the lease's current
 * loop. If staff corrected the link meanwhile, the created loop is recorded in activity only and
 * staff link it explicitly if it should be used.
 */
export async function completeLoopCreation(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    profileId: string;
    executionId: string;
    loop: {
      id: string;
      name: string;
      loopUrl: string | null;
      status: string | null;
      participantCount: number | null;
    };
  },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<{ linked: boolean; association: LoopAssociation | null }> {
  const ref = loopAssociationRef(db, input.leaseId);
  const ownerRef = db
    .collection(LOOP_ASSOCIATION_COLLECTIONS.owners)
    .doc(loopOwnerDocId(input.profileId, input.loop.id));
  return db.runTransaction(async (transaction) => {
    const [current, owner] = await Promise.all([
      readLoopAssociationIn(transaction, db, input.leaseId),
      transaction.get(ownerRef),
    ]);
    if (current?.state === "current" && current.loopId === input.loop.id)
      return { linked: true, association: current };
    const reserved =
      current?.state === "creating" && current.createExecutionId === input.executionId;
    if (!reserved || (owner.exists && owner.get("leaseId") !== input.leaseId)) {
      activity(transaction, db, {
        action: "created_loop_not_linked",
        lease_id: input.leaseId,
        cycle_id: input.cycleId,
        loop_id: input.loop.id,
        execution_id: input.executionId,
        actor_uid: actor.uid,
        created_at: now,
      });
      return { linked: false, association: current };
    }
    const next: LoopAssociation = {
      ...current!,
      state: "current",
      linkRevision: current!.linkRevision + 1,
      revision: current!.revision + 1,
      loopId: input.loop.id,
      loopName: input.loop.name,
      loopUrl: input.loop.loopUrl,
      readback: {
        readBackAt: now,
        loopStatus: input.loop.status,
        participantCount: input.loop.participantCount,
      },
      updatedAt: now,
      updatedByUid: actor.uid,
    };
    transaction.set(ref, stored(next));
    transaction.set(
      ownerRef,
      stampProductRecordRetention("lease_renewal_progress", {
        leaseId: input.leaseId,
        profileId: input.profileId,
        loopId: input.loop.id,
        cycleIds: [input.cycleId],
        origin: "app_created",
        recordedAt: now,
      }),
    );
    activity(transaction, db, {
      action: "loop_created",
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      loop_id: input.loop.id,
      execution_id: input.executionId,
      actor_uid: actor.uid,
      created_at: now,
    });
    return { linked: true, association: next };
  });
}

/**
 * Record the packet folder an upload created. The first recorded folder wins and is returned, so
 * every later document, worker or restart reuses it.
 */
export async function recordLoopFolder(
  input: {
    leaseId: string;
    loopId: string;
    dotloopFolderId: string;
    executionId: string;
  },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<string> {
  const ref = loopAssociationRef(db, input.leaseId);
  return db.runTransaction(async (transaction) => {
    const current = await readLoopAssociationIn(transaction, db, input.leaseId);
    if (!current || current.loopId !== input.loopId)
      throw new EditableLayerError(
        "The lease's Dotloop loop changed during the upload; its evidence is retained.",
        409,
      );
    if (current.folder) return current.folder.dotloopFolderId;
    const next: LoopAssociation = {
      ...current,
      revision: current.revision + 1,
      folder: {
        dotloopFolderId: input.dotloopFolderId,
        createdByExecutionId: input.executionId,
        recordedAt: now,
      },
      folderReservation: null,
      updatedAt: now,
    };
    transaction.set(ref, stored(next));
    activity(transaction, db, {
      action: "folder_recorded",
      lease_id: input.leaseId,
      loop_id: input.loopId,
      execution_id: input.executionId,
      created_at: now,
    });
    return input.dotloopFolderId;
  });
}

/** Record one receipted upload as a version of its document; earlier versions are never changed. */
export async function recordLoopUpload(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    loopId: string;
    document: Omit<LoopAssociationDocument, "supersedesContentHash">;
  },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<LoopAssociation> {
  const ref = loopAssociationRef(db, input.leaseId);
  return db.runTransaction(async (transaction) => {
    const current = await readLoopAssociationIn(transaction, db, input.leaseId);
    if (!current || current.loopId !== input.loopId)
      throw new EditableLayerError(
        "The lease's Dotloop loop changed during the upload; its receipt is retained.",
        409,
      );
    const prior = current.documents.find(
      (document) => document.receiptId === input.document.receiptId,
    );
    if (prior) return current;
    const pendingUploads = (current.pendingUploads ?? []).filter(
      (entry) => entry.executionId !== input.document.receiptId,
    );
    const earlier = current.documents
      .filter((document) => document.documentRef === input.document.documentRef)
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    const latest = earlier.length ? earlier[earlier.length - 1] : null;
    const next: LoopAssociation = {
      ...current,
      revision: current.revision + 1,
      documents: [
        ...current.documents,
        {
          ...input.document,
          supersedesContentHash:
            latest && latest.contentHash !== input.document.contentHash
              ? latest.contentHash
              : null,
        },
      ],
      pendingUploads,
      updatedAt: now,
      updatedByUid: actor.uid,
    };
    transaction.set(ref, stored(next));
    activity(transaction, db, {
      action: "document_uploaded",
      lease_id: input.leaseId,
      loop_id: input.loopId,
      document_ref: input.document.documentRef,
      content_hash: input.document.contentHash,
      receipt_id: input.document.receiptId,
      actor_uid: actor.uid,
      created_at: now,
    });
    return next;
  });
}

/** Record one explicit readback of the associated loop; absent observations stay absent. */
export async function recordLoopReadback(
  actor: AuthenticatedUser,
  input: { leaseId: string; loopId: string; readback: LoopAssociationReadback },
  db: Firestore = getAdminFirestore(),
): Promise<LoopAssociation> {
  const ref = loopAssociationRef(db, input.leaseId);
  return db.runTransaction(async (transaction) => {
    const current = await readLoopAssociationIn(transaction, db, input.leaseId);
    if (!current || current.state !== "current" || current.loopId !== input.loopId)
      throw new EditableLayerError(
        "The lease's Dotloop loop changed before this readback was saved. Reload and refresh again.",
        409,
      );
    const next: LoopAssociation = {
      ...current,
      revision: current.revision + 1,
      readback: input.readback,
      updatedAt: input.readback.readBackAt,
      updatedByUid: actor.uid,
    };
    transaction.set(ref, stored(next));
    activity(transaction, db, {
      action: "loop_read_back",
      lease_id: input.leaseId,
      loop_id: input.loopId,
      actor_uid: actor.uid,
      created_at: input.readback.readBackAt,
    });
    return next;
  });
}
