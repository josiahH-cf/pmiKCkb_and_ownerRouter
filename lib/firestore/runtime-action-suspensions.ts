import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  ChangeRuntimeSuspensionInputSchema,
  CreateActionRegistryInputSchema,
  RuntimeActionSuspensionRecordSchema,
  RuntimeSuspensionChangeRecordSchema,
  RuntimeSuspensionExpectedIdSchema,
  RuntimeSuspensionOperationIdSchema,
  type ChangeRuntimeSuspensionInput,
} from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  INTERNAL_TRANSACTIONAL_ALLOWED_DOMAIN,
  isInternalTransactionalDestination,
} from "@/lib/notifications/internal-destination";
import {
  RUNTIME_ACTION_SUSPENDED,
  RUNTIME_GLOBAL_SUSPENDED,
  RUNTIME_SUSPENSION_CLEAR,
  RUNTIME_SUSPENSION_UNREADABLE,
  type RuntimeSuspensionState,
} from "@/lib/operations/runtime-suspension";
import {
  RUNTIME_SUSPENSION_GLOBAL_KEY,
  RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
} from "@/lib/operations/runtime-suspension-policy";

export const RUNTIME_SUSPENSION_COLLECTIONS = Object.freeze({
  state: "runtime_action_suspensions",
  changes: "runtime_suspension_changes",
} as const);

export type RuntimeActionSuspensionRecord = z.infer<
  typeof RuntimeActionSuspensionRecordSchema
>;
export type RuntimeSuspensionChangeRecord = z.infer<
  typeof RuntimeSuspensionChangeRecordSchema
>;

export type RuntimeSuspensionTargetStatus = "clear" | "suspended" | "unreadable";

export interface RuntimeSuspensionActionOption {
  readonly key: string;
  readonly label: string;
  /** False only for an existing out-of-scope record exposed so an Admin can clear it. */
  readonly effectTarget: boolean;
}

export interface RuntimeSuspensionAdminSnapshot {
  readonly suspensions: RuntimeActionSuspensionRecord[];
  readonly unreadableActionKeys: string[];
  readonly hasUnknownRecords: boolean;
}

export interface RuntimeSuspensionMutationOperation {
  readonly operationId: string;
  readonly expectedSuspensionId?: string;
}

export interface RuntimeSuspensionMutationResult {
  readonly actionKey: string;
  readonly status: RuntimeSuspensionTargetStatus;
  readonly suspensionId?: string;
  readonly changed: boolean;
  readonly replayed: boolean;
}

export type RuntimeSuspensionStoreErrorCode =
  | "runtime_suspension_invalid_input"
  | "runtime_suspension_unknown_action"
  | "runtime_suspension_admin_required"
  | "runtime_suspension_actor_invalid"
  | "runtime_suspension_conflict"
  | "runtime_suspension_idempotency_conflict"
  | "runtime_suspension_store_unreadable";

export class RuntimeSuspensionStoreError extends Error {
  constructor(
    readonly code: RuntimeSuspensionStoreErrorCode,
    message: string,
    readonly status: 400 | 403 | 409,
  ) {
    super(message);
    this.name = "RuntimeSuspensionStoreError";
  }
}

interface RuntimeSuspensionDependencies {
  readonly now?: () => Date;
  readonly suspensionId?: () => string;
}

interface SnapshotLike {
  readonly id: string;
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

type TargetRead =
  | Readonly<{ status: "clear" }>
  | Readonly<{ status: "suspended"; record: RuntimeActionSuspensionRecord }>
  | Readonly<{ status: "unreadable" }>;

/**
 * These two Registry rows describe the always-on, read-only source adapters used by the live Renewal
 * Desk, Ask target lookup, and Maintenance unit lookup. They intentionally remain outside D09's
 * effect-attempt stop surface while their committed Registry rows remain closed: treating them as
 * selectable would imply that this control disconnects or suspends those product reads, which it
 * does not. Their complete caller inventory is pinned by the provider-boundary sentinel.
 */
const PRODUCT_SOURCE_READ_KEYS_OUTSIDE_EFFECT_STOP = new Set([
  "google_sheets.renewal_checklist.read",
  "rentvine.lease.read",
]);

const ACTION_LABELS = new Map(
  ACTION_REGISTRY_SEED.map((entry) => {
    const parsed = CreateActionRegistryInputSchema.parse(entry);
    return [parsed.key, parsed.label] as const;
  }),
);
const KNOWN_ACTION_KEYS = new Set(ACTION_LABELS.keys());
const ACTION_OPTIONS = buildActionOptions();

/**
 * The system reader recognizes exact committed Action Registry keys plus the reserved global key.
 * The Admin mutation surface is narrower: the two always-on Product source reads are not effect-stop
 * targets, though an already-existing record remains visible and generation-bound clearable.
 * Firestore's Action Registry projection is deliberately not an authority source.
 */
export function isKnownRuntimeSuspensionActionKey(actionKey: string): boolean {
  return actionKey === RUNTIME_SUSPENSION_GLOBAL_KEY || KNOWN_ACTION_KEYS.has(actionKey);
}

export function isRuntimeSuspensionEffectTarget(actionKey: string): boolean {
  return (
    actionKey === RUNTIME_SUSPENSION_GLOBAL_KEY ||
    (KNOWN_ACTION_KEYS.has(actionKey) &&
      !PRODUCT_SOURCE_READ_KEYS_OUTSIDE_EFFECT_STOP.has(actionKey))
  );
}

export function listRuntimeSuspensionActionOptions(
  repairActionKeys: readonly string[] = [],
): readonly RuntimeSuspensionActionOption[] {
  const repairOnly = Array.from(new Set(repairActionKeys))
    .filter(
      (key) =>
        PRODUCT_SOURCE_READ_KEYS_OUTSIDE_EFFECT_STOP.has(key) &&
        KNOWN_ACTION_KEYS.has(key),
    )
    .sort()
    .map((key) =>
      Object.freeze({
        key,
        label: `${ACTION_LABELS.get(key) ?? key} — clear existing record only`,
        effectTarget: false,
      }),
    );
  return repairOnly.length === 0
    ? ACTION_OPTIONS
    : Object.freeze([...ACTION_OPTIONS, ...repairOnly]);
}

/**
 * System reader used by the runtime gate. It reads the global and exact-key documents from one
 * Firestore transaction and converts every unknown, malformed, mismatched, or failed read to the
 * unreadable closed state. Only absence of both canonical documents means clear.
 */
export async function readRuntimeActionSuspension(
  actionKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<RuntimeSuspensionState> {
  if (!isKnownRuntimeSuspensionActionKey(actionKey)) {
    return RUNTIME_SUSPENSION_UNREADABLE;
  }

  try {
    return await db.runTransaction(async (transaction) => {
      const globalRef = stateRef(db, RUNTIME_SUSPENSION_GLOBAL_KEY);
      const global = readTarget(
        await transaction.get(globalRef),
        RUNTIME_SUSPENSION_GLOBAL_KEY,
      );

      if (actionKey === RUNTIME_SUSPENSION_GLOBAL_KEY) {
        return runtimeState(global, true);
      }

      const exact = readTarget(await transaction.get(stateRef(db, actionKey)), actionKey);
      if (global.status === "unreadable" || exact.status === "unreadable") {
        return RUNTIME_SUSPENSION_UNREADABLE;
      }
      if (global.status === "suspended") return RUNTIME_GLOBAL_SUSPENDED;
      if (exact.status === "suspended") return RUNTIME_ACTION_SUSPENDED;
      return RUNTIME_SUSPENSION_CLEAR;
    });
  } catch {
    return RUNTIME_SUSPENSION_UNREADABLE;
  }
}

export async function listRuntimeActionSuspensions(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<RuntimeSuspensionAdminSnapshot> {
  assertAdminActor(actor);
  const snapshot = await db.collection(RUNTIME_SUSPENSION_COLLECTIONS.state).get();
  const suspensions: RuntimeActionSuspensionRecord[] = [];
  const unreadableActionKeys: string[] = [];
  let hasUnknownRecords = false;

  for (const doc of snapshot.docs) {
    if (!isKnownRuntimeSuspensionActionKey(doc.id)) {
      hasUnknownRecords = true;
      continue;
    }
    const parsed = RuntimeActionSuspensionRecordSchema.safeParse(doc.data());
    if (!parsed.success || parsed.data.action_key !== doc.id) {
      unreadableActionKeys.push(doc.id);
      continue;
    }
    suspensions.push(parsed.data);
  }

  suspensions.sort((left, right) => left.action_key.localeCompare(right.action_key));
  unreadableActionKeys.sort((left, right) => left.localeCompare(right));
  return { suspensions, unreadableActionKeys, hasUnknownRecords };
}

/**
 * Apply one exact-confirmed Admin operation. The operation id is the immutable audit document id.
 * A replay of the same fingerprint returns without touching current state; reuse with a different
 * fingerprint is a 409. Clear additionally binds to the exact suspension generation (or the explicit
 * unreadable repair sentinel), preventing a stale clear from removing a newer incident stop.
 */
export async function changeRuntimeActionSuspension(
  actor: AuthenticatedUser,
  input: ChangeRuntimeSuspensionInput,
  operation: RuntimeSuspensionMutationOperation,
  db: Firestore = getAdminFirestore(),
  dependencies: RuntimeSuspensionDependencies = {},
): Promise<RuntimeSuspensionMutationResult> {
  const canonicalActor = assertAdminActor(actor);
  const parsed = parseMutationInput(input);
  assertEffectTarget(parsed.actionKey, parsed.action);

  const operationId = parseOperationId(operation.operationId);
  const expectedSuspensionId = parseExpectedSuspensionId(
    parsed.action,
    operation.expectedSuspensionId,
  );
  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const nextSuspensionId =
    parsed.action === "suspend"
      ? parseGeneratedSuspensionId((dependencies.suspensionId ?? uuidv7)())
      : undefined;

  const targetRef = stateRef(db, parsed.actionKey);
  const operationRef = db
    .collection(RUNTIME_SUSPENSION_COLLECTIONS.changes)
    .doc(operationId);

  return db.runTransaction(async (transaction) => {
    const priorOperation = await transaction.get(operationRef);
    if (priorOperation.exists) {
      const recorded = readChange(priorOperation, operationId);
      if (!sameOperation(recorded, canonicalActor, parsed, expectedSuspensionId)) {
        throw new RuntimeSuspensionStoreError(
          "runtime_suspension_idempotency_conflict",
          "This idempotency key was already used for a different runtime suspension operation.",
          409,
        );
      }

      const current = readTarget(await transaction.get(targetRef), parsed.actionKey);
      return mutationResult(parsed.actionKey, current, false, true);
    }

    const snapshot = await transaction.get(targetRef);
    const current = readTarget(snapshot, parsed.actionKey);
    assertClearPrecondition(parsed.action, expectedSuspensionId, current);

    const newState: RuntimeSuspensionChangeRecord["new_state"] =
      parsed.action === "suspend" ? "suspended" : "clear";
    const change = stripUndefined({
      operation_id: operationId,
      actor_uid: canonicalActor.uid,
      actor_email: canonicalActor.email,
      action_key: parsed.actionKey,
      previous_state: current.status,
      new_state: newState,
      reason_code: parsed.reasonCode,
      incident_ref: parsed.incidentRef,
      expected_suspension_id: expectedSuspensionId,
      previous_suspension_id:
        current.status === "suspended" ? current.record.suspension_id : undefined,
      new_suspension_id: nextSuspensionId,
      created_at: createdAt,
    });
    const parsedChange = RuntimeSuspensionChangeRecordSchema.parse(change);

    if (parsed.action === "suspend") {
      const nextRecord = RuntimeActionSuspensionRecordSchema.parse(
        stripUndefined({
          action_key: parsed.actionKey,
          state: "suspended",
          suspension_id: nextSuspensionId,
          reason_code: parsed.reasonCode,
          incident_ref: parsed.incidentRef,
          suspended_by_uid: canonicalActor.uid,
          suspended_by_email: canonicalActor.email,
          suspended_at: createdAt,
        }),
      );
      transaction.set(targetRef, nextRecord);
      transaction.create(operationRef, parsedChange);
      return mutationResult(
        parsed.actionKey,
        { status: "suspended", record: nextRecord },
        true,
        false,
      );
    }

    transaction.delete(targetRef);
    transaction.create(operationRef, parsedChange);
    return mutationResult(parsed.actionKey, { status: "clear" }, true, false);
  });
}

export async function listRuntimeSuspensionChanges(
  limit = 25,
  db: Firestore = getAdminFirestore(),
): Promise<RuntimeSuspensionChangeRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_invalid_input",
      "Runtime suspension audit limit must be between 1 and 100.",
      400,
    );
  }
  const snapshot = await db
    .collection(RUNTIME_SUSPENSION_COLLECTIONS.changes)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => readChange(doc, doc.id));
}

function buildActionOptions(): readonly RuntimeSuspensionActionOption[] {
  const options = ACTION_REGISTRY_SEED.map((entry) =>
    CreateActionRegistryInputSchema.parse(entry),
  )
    .filter((entry) => !PRODUCT_SOURCE_READ_KEYS_OUTSIDE_EFFECT_STOP.has(entry.key))
    .map((entry) =>
      Object.freeze({ key: entry.key, label: entry.label, effectTarget: true }),
    );
  const keys = new Set(options.map((option) => option.key));
  if (keys.size !== options.length || keys.has(RUNTIME_SUSPENSION_GLOBAL_KEY)) {
    throw new Error("Committed Action Registry keys are not unique and canonical.");
  }
  return Object.freeze([
    Object.freeze({
      key: RUNTIME_SUSPENSION_GLOBAL_KEY,
      label: "All gated live effects",
      effectTarget: true,
    }),
    ...options.sort((left, right) => left.key.localeCompare(right.key)),
  ]);
}

function stateRef(db: Firestore, actionKey: string) {
  return db.collection(RUNTIME_SUSPENSION_COLLECTIONS.state).doc(actionKey);
}

function readTarget(snapshot: SnapshotLike, expectedKey: string): TargetRead {
  if (!snapshot.exists) return { status: "clear" };
  const parsed = RuntimeActionSuspensionRecordSchema.safeParse(snapshot.data());
  if (
    !parsed.success ||
    snapshot.id !== expectedKey ||
    parsed.data.action_key !== expectedKey ||
    !isKnownRuntimeSuspensionActionKey(parsed.data.action_key)
  ) {
    return { status: "unreadable" };
  }
  return { status: "suspended", record: parsed.data };
}

function runtimeState(target: TargetRead, global: boolean): RuntimeSuspensionState {
  if (target.status === "unreadable") return RUNTIME_SUSPENSION_UNREADABLE;
  if (target.status === "clear") return RUNTIME_SUSPENSION_CLEAR;
  return global ? RUNTIME_GLOBAL_SUSPENDED : RUNTIME_ACTION_SUSPENDED;
}

function readChange(
  snapshot: SnapshotLike,
  expectedOperationId: string,
): RuntimeSuspensionChangeRecord {
  const parsed = RuntimeSuspensionChangeRecordSchema.safeParse(snapshot.data());
  if (
    !parsed.success ||
    snapshot.id !== expectedOperationId ||
    parsed.data.operation_id !== expectedOperationId ||
    !isKnownRuntimeSuspensionActionKey(parsed.data.action_key)
  ) {
    throw unreadableStoreError();
  }
  return parsed.data;
}

function parseMutationInput(
  input: ChangeRuntimeSuspensionInput,
): ChangeRuntimeSuspensionInput {
  const parsed = ChangeRuntimeSuspensionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_invalid_input",
      "Runtime suspension input is invalid.",
      400,
    );
  }
  return parsed.data;
}

function parseOperationId(value: string): string {
  const parsed = RuntimeSuspensionOperationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_invalid_input",
      "A canonical idempotency key is required.",
      400,
    );
  }
  return parsed.data;
}

function parseGeneratedSuspensionId(value: string): string {
  const parsed = RuntimeSuspensionOperationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw unreadableStoreError();
  }
  return parsed.data;
}

function parseExpectedSuspensionId(
  action: ChangeRuntimeSuspensionInput["action"],
  value: string | undefined,
): string | undefined {
  if (action === "suspend") {
    if (value !== undefined) {
      throw new RuntimeSuspensionStoreError(
        "runtime_suspension_invalid_input",
        "A suspend operation must not carry a clear-state precondition.",
        400,
      );
    }
    return undefined;
  }
  const parsed = RuntimeSuspensionExpectedIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_invalid_input",
      "Clear requires the exact current suspension id.",
      400,
    );
  }
  return parsed.data;
}

function assertEffectTarget(
  actionKey: string,
  operation: ChangeRuntimeSuspensionInput["action"],
): void {
  const repairOnlyClear =
    operation === "clear" &&
    KNOWN_ACTION_KEYS.has(actionKey) &&
    PRODUCT_SOURCE_READ_KEYS_OUTSIDE_EFFECT_STOP.has(actionKey);
  if (!isRuntimeSuspensionEffectTarget(actionKey) && !repairOnlyClear) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_unknown_action",
      "The runtime suspension target is not a gated live-effect action.",
      400,
    );
  }
}

function assertAdminActor(actor: AuthenticatedUser): {
  readonly uid: string;
  readonly email: string;
} {
  if (!can(actor.role, "manageAdmin")) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_admin_required",
      "Admin access is required to manage runtime suspensions.",
      403,
    );
  }
  const uid = actor.uid.trim();
  const email = actor.email.trim().toLowerCase();
  if (
    !uid ||
    uid !== actor.uid ||
    actor.hd !== INTERNAL_TRANSACTIONAL_ALLOWED_DOMAIN ||
    !isInternalTransactionalDestination(email)
  ) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_actor_invalid",
      "A managed internal Admin identity is required.",
      403,
    );
  }
  return { uid, email };
}

function assertClearPrecondition(
  action: ChangeRuntimeSuspensionInput["action"],
  expectedSuspensionId: string | undefined,
  current: TargetRead,
): void {
  if (action !== "clear") return;

  const matches =
    (current.status === "suspended" &&
      expectedSuspensionId === current.record.suspension_id) ||
    (current.status === "unreadable" &&
      expectedSuspensionId === RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION);
  if (!matches) {
    throw new RuntimeSuspensionStoreError(
      "runtime_suspension_conflict",
      "Runtime suspension state changed. Refresh and confirm the current state.",
      409,
    );
  }
}

function sameOperation(
  recorded: RuntimeSuspensionChangeRecord,
  actor: { readonly uid: string; readonly email: string },
  input: ChangeRuntimeSuspensionInput,
  expectedSuspensionId: string | undefined,
): boolean {
  return (
    recorded.actor_uid === actor.uid &&
    recorded.actor_email === actor.email &&
    recorded.action_key === input.actionKey &&
    recorded.new_state === (input.action === "suspend" ? "suspended" : "clear") &&
    recorded.reason_code === input.reasonCode &&
    recorded.incident_ref === input.incidentRef &&
    recorded.expected_suspension_id === expectedSuspensionId
  );
}

function mutationResult(
  actionKey: string,
  current: TargetRead,
  changed: boolean,
  replayed: boolean,
): RuntimeSuspensionMutationResult {
  return {
    actionKey,
    status: current.status,
    ...(current.status === "suspended"
      ? { suspensionId: current.record.suspension_id }
      : {}),
    changed,
    replayed,
  };
}

function unreadableStoreError(): RuntimeSuspensionStoreError {
  return new RuntimeSuspensionStoreError(
    "runtime_suspension_store_unreadable",
    "Runtime suspension state is unreadable and remains closed.",
    409,
  );
}

function stripUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
