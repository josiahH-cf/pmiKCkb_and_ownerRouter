import { createHash } from "node:crypto";
import { z } from "zod";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { assertMaintenanceCaseActor } from "./maintenance-case-records";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import {
  OperatingPolicyScopeSchema,
  operatingPolicyId,
  operatingHeadSelection,
  type OperatingPolicyHead,
  type OperatingPolicyVersion,
} from "@/lib/maintenance/operating-policy";
import {
  OPERATING_POLICY_COLLECTIONS as C,
  readApplicableOperatingPolicy,
} from "./maintenance-operating-policy-reader";
import {
  ApplyOperatingPolicySchema,
  type ApplyOperatingPolicy,
} from "@/lib/maintenance/operating-policy";
export {
  ApplyOperatingPolicySchema,
  type ApplyOperatingPolicy,
} from "@/lib/maintenance/operating-policy";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex"),
  opKey = (a: AuthenticatedUser, id: string) => hash([a.uid, id]);
function policyManager(actor: AuthenticatedUser) {
  assertMaintenanceCaseActor(actor, true);
  if (actor.role !== "Admin")
    throw new EditableLayerError(
      "A current managed Admin maintains approved operating policies.",
      403,
    );
}
export async function readOperatingPolicyOperation(
  actor: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor);
  z.string().uuid().parse(operationId);
  const s = await db.collection(C.operations).doc(opKey(actor, operationId)).get();
  if (!s.exists)
    return {
      state: "not_recorded" as const,
      operationId,
      detail:
        "No settled original result is recorded; this does not prove an in-flight request failed.",
    };
  const p = s.data()!;
  if (p.actorUid !== actor.uid)
    throw new EditableLayerError("That original policy operation is unavailable.", 404);
  if (p.state === "cancelled")
    return {
      state: "cancelled" as const,
      operationId,
      detail:
        "The exact operation was stopped before admission. No policy version was saved.",
    };
  return {
    state: "committed" as const,
    operationId,
    head: p.head as OperatingPolicyHead,
    version: p.version as OperatingPolicyVersion,
  };
}
async function verifyProperty(propertyId: string) {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "Current property identity is unavailable. Your policy is kept.",
      409,
    );
  try {
    const property = await config.rentvineClient.getProperty(propertyId);
    if (String(property.propertyID ?? property.propertyId ?? "") !== propertyId)
      throw Error();
  } catch {
    throw new EditableLayerError(
      "The exact current property identity could not be verified. No policy was changed.",
      409,
    );
  }
}
export async function applyOperatingPolicy(
  actor: AuthenticatedUser,
  input: ApplyOperatingPolicy,
  options: {
    db?: Firestore;
    at?: string;
    verifyProperty?: (id: string) => Promise<void>;
  } = {},
) {
  policyManager(actor);
  const command = ApplyOperatingPolicySchema.parse(input),
    db = options.db ?? getAdminFirestore(),
    at = options.at ?? new Date().toISOString(),
    fingerprint = hash(command),
    op = db.collection(C.operations).doc(opKey(actor, command.operationId)),
    prior = await op.get(),
    purpose = command.op === "save_version" ? command.policy.purpose : command.purpose,
    scope = command.op === "save_version" ? command.policy.scope : command.scope,
    id = operatingPolicyId(purpose, scope),
    ref = db.collection(C.heads).doc(id);
  if (!prior.exists && scope.kind === "property")
    await (options.verifyProperty ?? verifyProperty)(scope.propertyId);
  if (
    command.op === "save_version" &&
    command.policy.purpose === "emergency" &&
    command.policy.contacts.some((c) => Date.parse(c.verifiedAt) > Date.parse(at))
  )
    throw new EditableLayerError("Contact verification cannot be in the future.", 400);
  return db.runTransaction(async (tx) => {
    const [old, original] = await tx.getAll(ref, op);
    if (original.exists) {
      const p = original.data()!;
      if (p.state === "cancelled")
        throw new EditableLayerError(
          "This exact policy save was stopped before admission. Review current terms before a new save.",
          409,
        );
      if (p.actorUid !== actor.uid || p.fingerprint !== fingerprint)
        throw new EditableLayerError(
          "The original operation records different policy content. Recover its result.",
          409,
        );
      return {
        state: "committed" as const,
        operationId: command.operationId,
        head: p.head as OperatingPolicyHead,
        version: p.version as OperatingPolicyVersion,
      };
    }
    const head = old.exists ? (old.data() as OperatingPolicyHead) : null;
    if ((head?.version ?? 0) !== command.expectedVersion)
      throw new EditableLayerError(
        "This policy changed. Read its current version; your words are kept.",
        409,
      );
    const keys = [head?.activeVersion, head?.scheduledVersion, head?.draftVersion].filter(
      (n): n is number => typeof n === "number",
    );
    const versions = keys.length
      ? (
          await tx.getAll(
            ...[...new Set(keys)].map((n) =>
              db.collection(C.versions).doc(`${id}_v${n}`),
            ),
          )
        )
          .filter((s) => s.exists)
          .map((s) => s.data() as OperatingPolicyVersion)
      : [];
    if (keys.some((n) => !versions.some((v) => v.version === n)))
      throw new EditableLayerError(
        "An existing policy version is unavailable. Reconcile it before changing policy.",
        409,
      );
    const active = operatingHeadSelection(head, versions, at),
      version = (head?.version ?? 0) + 1,
      next: OperatingPolicyHead = {
        id,
        purpose,
        scope,
        version,
        activeVersion: active?.version ?? null,
        scheduledVersion:
          head?.scheduledVersion && head.scheduledVersion !== active?.version
            ? head.scheduledVersion
            : null,
        draftVersion: head?.draftVersion ?? null,
        updatedAt: at,
        updatedBy: actor.uid,
      };
    let saved: OperatingPolicyVersion;
    if (command.op === "save_version") {
      saved = {
        ...command.policy,
        id,
        version,
        recordedAt: at,
        recordedBy: actor.uid,
        reason: command.reason,
      };
      if (saved.state === "draft") next.draftVersion = version;
      else if (Date.parse(saved.effectiveFrom) > Date.parse(at))
        next.scheduledVersion = version;
      else {
        next.activeVersion = version;
        next.scheduledVersion = null;
      }
    } else {
      const target = versions.find((v) => v.version === command.targetVersion);
      if (!target)
        throw new EditableLayerError(
          "Only a currently selected or scheduled/draft version can be revoked.",
          409,
        );
      saved = {
        ...target,
        version,
        state: "revoked",
        recordedAt: at,
        recordedBy: actor.uid,
        reason: command.reason,
      };
      if (next.activeVersion === target.version) next.activeVersion = null;
      if (next.scheduledVersion === target.version) next.scheduledVersion = null;
      if (next.draftVersion === target.version) next.draftVersion = null;
    }
    const retained = stampProductRecordRetention(C.versions, saved);
    tx.set(ref, stampProductRecordRetention(C.heads, { ...next }));
    tx.create(db.collection(C.versions).doc(`${id}_v${version}`), retained);
    tx.create(
      op,
      stampProductRecordRetention(C.operations, {
        actorUid: actor.uid,
        operationId: command.operationId,
        fingerprint,
        head: next,
        version: saved,
        recordedAt: at,
      }),
    );
    return {
      state: "committed" as const,
      operationId: command.operationId,
      head: next,
      version: saved,
    };
  });
}
export async function readOperatingPolicyScope(
  actor: AuthenticatedUser,
  purpose: "emergency" | "chargeback",
  scope: z.infer<typeof OperatingPolicyScopeSchema>,
  db: Firestore = getAdminFirestore(),
  beforeVersion?: number,
) {
  assertMaintenanceCaseActor(actor);
  const id = operatingPolicyId(purpose, OperatingPolicyScopeSchema.parse(scope)),
    ref = await db.collection(C.heads).doc(id).get(),
    history = await (
      beforeVersion
        ? db
            .collection(C.versions)
            .where("id", "==", id)
            .where("version", "<", z.number().int().positive().parse(beforeVersion))
        : db.collection(C.versions).where("id", "==", id)
    )
      .orderBy("version", "desc")
      .limit(51)
      .get();
  return {
    head: ref.exists ? (ref.data() as OperatingPolicyHead) : null,
    history: history.docs.slice(0, 50).map((s) => s.data() as OperatingPolicyVersion),
    nextBeforeVersion: history.size > 50 ? Number(history.docs[49].data().version) : null,
    applicable: await readApplicableOperatingPolicy(
      purpose,
      scope.kind === "property" ? scope.propertyId : null,
      undefined,
      db,
    ),
  };
}

export async function stopOperatingPolicyOperation(
  actor: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  policyManager(actor);
  z.string().uuid().parse(operationId);
  const ref = db.collection(C.operations).doc(opKey(actor, operationId));
  await db.runTransaction(async (tx) => {
    const prior = await tx.get(ref);
    if (!prior.exists)
      tx.create(
        ref,
        stampProductRecordRetention(C.operations, {
          actorUid: actor.uid,
          operationId,
          state: "cancelled",
          recordedAt: new Date().toISOString(),
        }),
      );
  });
  return readOperatingPolicyOperation(actor, operationId, db);
}
