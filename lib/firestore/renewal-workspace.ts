import { resolveCurrentCompScreenshotAttachment } from "@/lib/firestore/lease-renewal-progress";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { RenewalMarketBasisSchema } from "@/lib/lease-renewal/market-basis-schema";
import { SheetFieldIntentSchema } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import {
  CycleBasisSchema,
  MANUAL_ACTIVITIES,
  RenewalTermsSchema,
  RenewalWorkspaceActionSchema,
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalCycleBasis,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

export const RENEWAL_WORKSPACE_COLLECTIONS = {
  head: "lease_renewal_workspaces",
  cycles: "lease_renewal_workspace_cycles",
  activity: "lease_renewal_workspace_activity",
  observations: "lease_renewal_market_observations",
} as const;
const leaseId = z.string().regex(/^[1-9]\d*$/);
const staff = z
  .object({
    eventId: z.string(),
    actorUid: z.string(),
    recordedAt: z.string().datetime(),
    source: z.string().min(1),
    reason: z.string().optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    termsRevision: z.number().int().nonnegative(),
  })
  .strict();
const stateSchema = z
  .object({
    schemaVersion: z.literal("renewal-workspace/v1"),
    leaseId,
    cycleId: z.string().uuid(),
    basis: CycleBasisSchema,
    revision: z.number().int().nonnegative(),
    termsRevision: z.number().int().nonnegative(),
    ownerResponse: staff
      .extend({
        outcome: z.enum([
          "approved_terms",
          "revision_requested",
          "declined_non_renewal",
          "no_response",
        ]),
        terms: RenewalTermsSchema.optional(),
      })
      .nullable(),
    tenantResponse: staff
      .extend({
        outcome: z.enum([
          "awaiting_response",
          "accepted",
          "counter_change_requested",
          "declined_nonrenewing",
          "needs_verification",
        ]),
      })
      .nullable(),
    activities: z
      .record(
        z.string(),
        staff.extend({
          outcome: z.enum(["not_started", "waiting", "done", "not_applicable"]),
          applicabilityPolicy: z.string().trim().min(1).max(240).optional(),
        }),
      )
      .refine((value) => Object.keys(value).every((key) => key in MANUAL_ACTIVITIES)),
    completion: staff.nullable(),
    preparation: z
      .object({
        market: RenewalMarketBasisSchema.extend({
          compScreenshotRef: z
            .string()
            .regex(/^drive:[A-Za-z0-9_-]{10,200}$/)
            .optional(),
        }),
        source: z.string(),
        analysisReference: z.string().optional(),
        observationId: z.string().uuid().optional(),
        recordedAt: z.string().datetime(),
        recordedByUid: z.string(),
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    sourceUpdates: z.record(
      z.string(),
      z
        .object({
          eventId: z.string(),
          intent: SheetFieldIntentSchema,
          state: z.enum(["pending", "prepared", "verified", "unavailable"]),
          proposalId: z.string().optional(),
          executionId: z.string().optional(),
          reason: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export { stateSchema as RenewalWorkspaceStateSchema };
export const SaveRenewalWorkspaceSchema = z
  .object({
    leaseId,
    cycleId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    action: RenewalWorkspaceActionSchema,
  })
  .strict();
export const StartRenewalCycleSchema = z
  .object({
    leaseId,
    expectedCycleId: z.string().uuid().nullable(),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    basis: CycleBasisSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export function renewalWorkspaceDocId(id: string) {
  return createHash("sha256").update(leaseId.parse(id)).digest("hex");
}
function assertActor(actor: AuthenticatedUser, write = false) {
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError("Renewals staff authority is required.", 403);
}
function parseState(raw: unknown, id: string): RenewalWorkspaceState {
  const state = stateSchema.parse(raw);
  if (state.leaseId !== id)
    throw new EditableLayerError(
      "The saved workspace identity does not match this lease.",
      409,
    );
  return state;
}
export async function getRenewalWorkspace(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWorkspaceState | null> {
  assertActor(actor);
  const snapshot = await db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
    .doc(renewalWorkspaceDocId(id))
    .get();
  return snapshot.exists ? parseState(snapshot.data(), id) : null;
}
export async function listRenewalWorkspaces(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor);
  const docs = await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.head).get();
  return new Map(
    docs.docs.map((doc) => {
      const state = stateSchema.parse(doc.data());
      if (doc.id !== renewalWorkspaceDocId(state.leaseId))
        throw new EditableLayerError("A saved workspace identity is invalid.", 409);
      return [state.leaseId, state as RenewalWorkspaceState];
    }),
  );
}
export async function listRenewalWorkspaceActivity(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor);
  leaseId.parse(id);
  const result = await db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
    .where("lease_id", "==", id)
    .get();
  return result.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) =>
      String((a as Record<string, unknown>).recorded_at).localeCompare(
        String((b as Record<string, unknown>).recorded_at),
      ),
    );
}
/** Exact identity is resolved from current source before starting; old provider progress is untouched. */
export async function startRenewalCycle(
  actor: AuthenticatedUser,
  raw: unknown,
  verifiedBasis: RenewalCycleBasis,
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor, true);
  const input = StartRenewalCycleSchema.parse(raw);
  if (
    hashExecutionPreview(input.basis) !==
    hashExecutionPreview(CycleBasisSchema.parse(verifiedBasis))
  )
    throw new EditableLayerError(
      "The reviewed cycle context changed. Refresh and review it.",
      409,
    );
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const head = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
    .doc(renewalWorkspaceDocId(input.leaseId));
  const event = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
    .doc(input.operationId);
  await db.runTransaction(async (tx) => {
    const [snapshot, prior] = await Promise.all([tx.get(head), tx.get(event)]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError("The cycle request changed.", 409);
      return;
    }
    const current = snapshot.exists ? parseState(snapshot.data(), input.leaseId) : null;
    if (
      (current?.cycleId ?? null) !== input.expectedCycleId ||
      (current?.revision ?? 0) !== input.expectedRevision
    )
      throw new EditableLayerError(
        "The current cycle changed. Reload before starting another.",
        409,
      );
    const next = emptyRenewalWorkspace(input.leaseId, input.operationId, verifiedBasis);
    const now = new Date().toISOString();
    tx.set(head, next);
    tx.create(
      db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(input.operationId),
      next,
    );
    tx.create(event, {
      lease_id: input.leaseId,
      cycle_id: next.cycleId,
      actor_uid: actor.uid,
      recorded_at: now,
      request_hash: requestHash,
      action: { kind: "start_cycle", basis: verifiedBasis, reason: input.reason },
      previous_cycle_id: current?.cycleId ?? null,
      next_state: next,
    });
  });
  return { state: await getRenewalWorkspace(actor, input.leaseId, db) };
}
/** Atomic optimistic concurrency + immutable request identity. No provider receipt or completion flag. */
export async function saveRenewalWorkspace(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor, true);
  const input = SaveRenewalWorkspaceSchema.parse(raw),
    requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const head = db
      .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
      .doc(renewalWorkspaceDocId(input.leaseId)),
    event = db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).doc(input.operationId);
  const duplicate = await db.runTransaction(async (tx) => {
    const [snapshot, prior] = await Promise.all([tx.get(head), tx.get(event)]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This recorded request changed. Reload before correcting it.",
          409,
        );
      return true;
    }
    if (!snapshot.exists)
      throw new EditableLayerError("Select the reviewed renewal cycle first.", 409);
    const current = parseState(snapshot.data(), input.leaseId);
    if (current.cycleId !== input.cycleId || current.revision !== input.expectedRevision)
      throw new EditableLayerError(
        "Another operator changed this cycle. Reload and review the current record.",
        409,
      );
    const now = new Date().toISOString();
    const next = planRenewalWorkspaceAction(current, input.action, {
      eventId: input.operationId,
      actorUid: actor.uid,
      recordedAt: now,
    });
    if (
      input.action.kind === "preparation" &&
      next.preparation &&
      input.action.observationId !== undefined
    ) {
      if (input.action.observationId === null) {
        delete next.preparation.market.provider;
        delete next.preparation.observationId;
      } else {
        const observation = await tx.get(
          db
            .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
            .doc(input.action.observationId),
        );
        if (
          !observation.exists ||
          observation.get("lease_id") !== input.leaseId ||
          observation.get("cycle_id") !== input.cycleId ||
          observation.get("operation") !== "comps"
        )
          throw new EditableLayerError(
            "Select comp evidence retrieved for this exact lease and cycle.",
            409,
          );
        const market = RenewalMarketBasisSchema.parse(observation.get("market"));
        if (!market.provider)
          throw new EditableLayerError(
            "This lookup did not return a usable provider basis. Retained preparation is unchanged.",
            409,
          );
        next.preparation.market = {
          ...next.preparation.market,
          provider: market.provider,
        };
        next.preparation.observationId = input.action.observationId;
      }
    }
    if (input.action.kind === "preparation" && input.action.trendObservationId) {
      const observation = await tx.get(
        db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
          .doc(input.action.trendObservationId),
      );
      if (
        !next.preparation?.market.provider ||
        !observation.exists ||
        observation.get("lease_id") !== input.leaseId ||
        observation.get("cycle_id") !== input.cycleId ||
        observation.get("operation") !== "trend" ||
        observation.get("comp_observation_id") !== next.preparation.observationId
      )
        throw new EditableLayerError(
          "Select a trend retrieved with these exact comps.",
          409,
        );
      const trend = observation.get("trend");
      if (trend)
        next.preparation.market.provider = RenewalMarketBasisSchema.parse({
          provider: { ...next.preparation.market.provider, trend },
        }).provider!;
    }
    if (input.action.kind === "preparation" && next.preparation) {
      const attachment = await resolveCurrentCompScreenshotAttachment(
        tx,
        db,
        input.leaseId,
      );
      delete next.preparation.market.compScreenshotRef;
      if (attachment) next.preparation.market.compScreenshotRef = attachment.ref;
    }
    const valid = parseState(next, input.leaseId);
    tx.set(head, valid);
    tx.set(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(input.cycleId), valid);
    tx.create(event, {
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      actor_uid: actor.uid,
      recorded_at: now,
      request_hash: requestHash,
      action: input.action,
      previous_revision: current.revision,
      next_state: valid,
    });
    return false;
  });
  return { state: await getRenewalWorkspace(actor, input.leaseId, db), duplicate };
}

/** Server-derived source status, conditional on the same current staff event and cycle. */
export async function recordWorkspaceSourceStatus(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    field: string;
    eventId: string;
    update: Pick<
      RenewalWorkspaceState["sourceUpdates"][string],
      "state" | "proposalId" | "executionId" | "reason"
    >;
  },
  db: Firestore = getAdminFirestore(),
) {
  assertActor(actor, true);
  const head = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
    .doc(renewalWorkspaceDocId(input.leaseId));
  const audit = db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).doc(randomUUID());
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(head);
    const current = snapshot.exists ? parseState(snapshot.data(), input.leaseId) : null;
    const entry = current?.sourceUpdates[input.field];
    if (
      !current ||
      current.cycleId !== input.cycleId ||
      !entry ||
      entry.eventId !== input.eventId
    )
      throw new EditableLayerError(
        "The staff fact changed while its source update was being prepared. Review the current record.",
        409,
      );
    const updated = { eventId: entry.eventId, intent: entry.intent, ...input.update };
    if (hashExecutionPreview(entry) === hashExecutionPreview(updated)) return;
    const next = parseState(
      {
        ...current,
        revision: current.revision + 1,
        sourceUpdates: { ...current.sourceUpdates, [input.field]: updated },
      },
      input.leaseId,
    );
    tx.set(head, next);
    tx.set(db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(input.cycleId), next);
    tx.create(audit, {
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      actor_uid: actor.uid,
      recorded_at: new Date().toISOString(),
      action: {
        kind: "source_update_status",
        field: input.field,
        eventId: input.eventId,
        ...input.update,
      },
      previous_revision: current.revision,
      next_state: next,
    });
  });
}
