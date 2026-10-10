import { cache } from "react";
import { ReadDeadlineError, withReadDeadline } from "@/lib/observability/read-lifetime";
import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import {
  BusinessProfileSchema,
  PresentationCommandSchema,
  applicationDisplayName,
  type PresentationCommand,
  type StaffBusinessProfile,
  type ApplicationPresentation,
} from "@/lib/staff/business-profile";
import { getRetainedSenderSignature } from "./renewal-sender-signatures";
const C = {
  profiles: "staff_business_profiles",
  profileVersions: "staff_business_profile_versions",
  branding: "application_presentation",
  brandingVersions: "application_presentation_versions",
  operations: "presentation_settings_operations",
} as const;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex"),
  opKey = (actor: AuthenticatedUser, id: string) => hash([actor.uid, id]);
function staff(actor: AuthenticatedUser, write = false) {
  if (
    !actor.uid ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    actor.hd !== "pmikcmetro.com" ||
    !["Editor", "Approver", "Admin"].includes(actor.role) ||
    !can(actor.role, write ? "manageAdmin" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      "Current managed staff access is required; only Admin maintains business profiles and the display name.",
      403,
    );
}
export interface ExistingStaffIdentity {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
}
async function existingStaff(uid: string): Promise<ExistingStaffIdentity> {
  try {
    return await getAuth(getFirebaseAdminApp()).getUser(uid);
  } catch {
    throw new EditableLayerError(
      "That existing managed staff account could not be verified. No profile was changed.",
      409,
    );
  }
}
function validStaff(target: ExistingStaffIdentity, uid: string) {
  const claims = target.customClaims ?? {};
  if (
    target.uid !== uid ||
    target.disabled ||
    !target.emailVerified ||
    !target.email?.toLowerCase().endsWith("@pmikcmetro.com") ||
    ["vendor", "vendor_id", "data_mode"].some((k) => Object.hasOwn(claims, k)) ||
    (claims.role !== undefined &&
      !["Editor", "Approver", "Admin"].includes(String(claims.role)))
  )
    throw new EditableLayerError(
      "Choose an existing enabled, verified managed staff account. Business titles never grant an access role.",
      400,
    );
  return { uid, email: target.email.toLowerCase() };
}
export async function readBusinessProfile(
  actor: AuthenticatedUser,
  uid = actor.uid,
  db: Firestore = getAdminFirestore(),
) {
  staff(actor);
  if (uid !== actor.uid && actor.role !== "Admin")
    throw new EditableLayerError(
      "Only your own staff business profile is available.",
      403,
    );
  const snap = await db.collection(C.profiles).doc(uid).get();
  if (!snap.exists) return null;
  const p = snap.data() as StaffBusinessProfile;
  if (
    p.uid !== uid ||
    (uid === actor.uid && p.email.toLowerCase() !== actor.email.toLowerCase()) ||
    !Number.isInteger(p.version) ||
    p.version < 1 ||
    !BusinessProfileSchema.safeParse(p.profile).success
  )
    throw new EditableLayerError(
      "This saved business profile needs an Admin review before it can supply a signature.",
      409,
    );
  return p;
}
export async function inspectOwnBusinessProfile(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  staff(actor);
  const [profile, retained] = await Promise.all([
    readBusinessProfile(actor, actor.uid, db),
    getRetainedSenderSignature(actor, db),
  ]);
  return {
    actorUid: actor.uid,
    profile,
    retainedSignature: retained?.signature ?? null,
    retainedAt: retained?.updatedAt ?? null,
  };
}
export async function readApplicationPresentation(
  db: Firestore = getAdminFirestore(),
): Promise<ApplicationPresentation | null> {
  const snap = await db.collection(C.branding).doc("display").get();
  if (!snap.exists) return null;
  const p = snap.data()!;
  if (
    !Number.isInteger(p.version) ||
    p.version < 1 ||
    typeof p.displayName !== "string" ||
    applicationDisplayName(p.displayName) !==
      (p.displayName || applicationDisplayName(""))
  )
    throw new EditableLayerError("The application display name is unavailable.", 409);
  return p as ApplicationPresentation;
}
/** Presentation is public, contains no identity/contact data and always has a readable fallback. */
async function readDisplayName(db?: Firestore) {
  try {
    return applicationDisplayName(
      (await withReadDeadline(() => readApplicationPresentation(db), 1500))?.displayName,
    );
  } catch (error) {
    console.info(
      JSON.stringify({
        event: "presentation_read",
        outcome: error instanceof ReadDeadlineError ? "deadline" : "unavailable",
      }),
    );
    return applicationDisplayName(null);
  }
}
// React cache is request-local: title and navigation share this public presentation read only.
// No actor, permission, provider decision or configuration survives into another request.
const requestDisplayName = cache(() => readDisplayName());
export async function readApplicationDisplayName(db?: Firestore) {
  return db ? readDisplayName(db) : requestDisplayName();
}
export async function readPresentationOperation(
  actor: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  staff(actor);
  PresentationCommandSchema.options[0].shape.operationId.parse(operationId);
  const snap = await db.collection(C.operations).doc(opKey(actor, operationId)).get();
  if (!snap.exists)
    return {
      state: "not_recorded" as const,
      operationId,
      detail:
        "No original receipt is recorded. This does not establish that an in-flight save failed.",
    };
  const r = snap.data()!;
  if (r.actorUid !== actor.uid)
    throw new EditableLayerError("That original save is unavailable.", 404);
  return r.state === "cancelled"
    ? { state: "cancelled" as const, operationId }
    : {
        state: "committed" as const,
        operationId,
        op: r.op as PresentationCommand["op"],
        result: r.result as StaffBusinessProfile | ApplicationPresentation,
      };
}
export async function savePresentationSetting(
  actor: AuthenticatedUser,
  input: PresentationCommand,
  options: {
    db?: Firestore;
    verifyStaff?: (uid: string) => Promise<ExistingStaffIdentity>;
    at?: string;
  } = {},
) {
  staff(actor, true);
  const command = PresentationCommandSchema.parse(input),
    db = options.db ?? getAdminFirestore(),
    op = db.collection(C.operations).doc(opKey(actor, command.operationId)),
    prior = await op.get(),
    fingerprint = hash(command),
    at = options.at ?? new Date().toISOString();
  // An original committed result stays recoverable when the identity provider is unavailable.
  const identity =
    command.op === "save_profile" && !prior.exists
      ? validStaff(await (options.verifyStaff ?? existingStaff)(command.uid), command.uid)
      : null;
  const profile = command.op === "save_profile",
    collection = profile ? C.profiles : C.branding,
    versions = profile ? C.profileVersions : C.brandingVersions,
    id = profile ? command.uid : "display",
    head = db.collection(collection).doc(id);
  return db.runTransaction(async (tx) => {
    const [receipt, current] = await tx.getAll(op, head);
    if (receipt.exists) {
      const r = receipt.data()!;
      if (r.state === "cancelled")
        throw new EditableLayerError(
          "This exact save was stopped before admission. Read current settings before a new save.",
          409,
        );
      if (r.actorUid !== actor.uid || r.fingerprint !== fingerprint)
        throw new EditableLayerError(
          "This operation identifies different original content. Recover its original result.",
          409,
        );
      return {
        state: "committed" as const,
        operationId: command.operationId,
        op: command.op,
        result: r.result as StaffBusinessProfile | ApplicationPresentation,
      };
    }
    const old = current.data(),
      version = Number(old?.version ?? 0);
    if (version !== command.expectedVersion)
      throw new EditableLayerError(
        "This setting changed. Read the current version; your edited fields are kept.",
        409,
      );
    const result =
      command.op === "save_profile"
        ? {
            uid: command.uid,
            email: identity!.email,
            version: version + 1,
            profile: command.profile,
            updatedAt: at,
            updatedBy: actor.uid,
          }
        : {
            version: version + 1,
            displayName: command.displayName,
            updatedAt: at,
            updatedBy: actor.uid,
          };
    tx.set(head, stampProductRecordRetention(collection, { ...result }, old));
    tx.create(
      db.collection(versions).doc(`${hash(id)}_v${version + 1}`),
      stampProductRecordRetention(versions, {
        ...result,
        reason: command.reason,
        operationId: command.operationId,
      }),
    );
    tx.create(
      op,
      stampProductRecordRetention(C.operations, {
        actorUid: actor.uid,
        operationId: command.operationId,
        op: command.op,
        fingerprint,
        result,
        recordedAt: at,
      }),
    );
    return {
      state: "committed" as const,
      operationId: command.operationId,
      op: command.op,
      result,
    };
  });
}
export async function stopPresentationOperation(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
) {
  staff(actor, true);
  PresentationCommandSchema.options[0].shape.operationId.parse(id);
  const ref = db.collection(C.operations).doc(opKey(actor, id));
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (!old.exists)
      tx.create(
        ref,
        stampProductRecordRetention(C.operations, {
          actorUid: actor.uid,
          operationId: id,
          state: "cancelled",
          recordedAt: new Date().toISOString(),
        }),
      );
  });
  return readPresentationOperation(actor, id, db);
}
