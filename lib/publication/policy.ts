import { FieldValue } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  PublicationAllowedType,
  PublicationPolicyRecord,
  PublicationSensitivity,
} from "@/lib/publication/types";
import { launchSpaces } from "@/lib/spaces";

export const PUBLICATION_POLICY_COLLECTION = "publication_policies";
export const PUBLICATION_POLICY_AUDIT_COLLECTION = "publication_policy_audit";

const mib = 1024 * 1024;

export const LAUNCH_PUBLICATION_ALLOWED_TYPES = Object.freeze([
  typeRule(".md", 2 * mib, "text/markdown", "text/plain"),
  typeRule(".txt", 2 * mib, "text/plain"),
  typeRule(".pdf", 25 * mib, "application/pdf"),
  typeRule(
    ".docx",
    25 * mib,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ),
  typeRule(".csv", 10 * mib, "text/csv"),
  typeRule(".jpg", 10 * mib, "image/jpeg"),
  typeRule(".jpeg", 10 * mib, "image/jpeg"),
  typeRule(".png", 10 * mib, "image/png"),
  typeRule(".webp", 10 * mib, "image/webp"),
]) satisfies readonly PublicationAllowedType[];

const allowedTypeSchema = z
  .object({
    extension: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^\.[a-z0-9]+$/),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(25 * mib),
    mimeTypes: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const CreatePublicationPolicySchema = z
  .object({
    allowedSpaces: z.array(z.string().trim().min(1)).min(1),
    allowedTypes: z
      .array(allowedTypeSchema)
      .min(1)
      .default(
        LAUNCH_PUBLICATION_ALLOWED_TYPES.map((rule) => ({
          ...rule,
          mimeTypes: [...rule.mimeTypes],
        })),
      ),
    connectorId: z.string().trim().min(1),
    enabled: z.boolean().default(true),
    reason: z.string().trim().min(8),
    rootId: z.string().trim().min(1),
    scannerKey: z.string().trim().min(1),
    sensitivityCeiling: z.enum(["Low", "Medium", "High"]).default("Medium"),
  })
  .strict();

export const TightenPublicationPolicySchema = z
  .object({
    allowedSpaces: z.array(z.string().trim().min(1)).min(1).optional(),
    allowedTypes: z.array(allowedTypeSchema).min(1).optional(),
    enabled: z.boolean().optional(),
    reason: z.string().trim().min(8),
    sensitivityCeiling: z.enum(["Low", "Medium", "High"]).optional(),
  })
  .strict();

export type CreatePublicationPolicyInput = z.input<typeof CreatePublicationPolicySchema>;
export type TightenPublicationPolicyInput = z.input<
  typeof TightenPublicationPolicySchema
>;

export async function createPublicationPolicy(
  actor: AuthenticatedUser,
  input: CreatePublicationPolicyInput,
  db = getAdminFirestore(),
): Promise<PublicationPolicyRecord> {
  assertAdmin(actor);
  const parsed = CreatePublicationPolicySchema.parse(input);
  assertUniqueTypes(parsed.allowedTypes);
  assertKnownSpaces(parsed.allowedSpaces);
  const id = uuidv7();
  const ref = db.collection(PUBLICATION_POLICY_COLLECTION).doc(id);
  const auditRef = db.collection(PUBLICATION_POLICY_AUDIT_COLLECTION).doc(uuidv7());

  await db.runTransaction(async (transaction) => {
    transaction.set(ref, {
      id,
      allowedSpaces: unique(parsed.allowedSpaces),
      allowedTypes: parsed.allowedTypes,
      connectorId: parsed.connectorId,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: actor.uid,
      enabled: parsed.enabled,
      rootId: parsed.rootId,
      scannerKey: parsed.scannerKey,
      sensitivityCeiling: parsed.sensitivityCeiling,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: actor.uid,
    });
    transaction.set(
      auditRef,
      bodylessPolicyAudit(id, actor.uid, "created", parsed.reason),
    );
  });

  return getPublicationPolicy(id, db);
}

export async function tightenPublicationPolicy(
  actor: AuthenticatedUser,
  policyId: string,
  input: TightenPublicationPolicyInput,
  db = getAdminFirestore(),
): Promise<PublicationPolicyRecord> {
  assertAdmin(actor);
  const parsed = TightenPublicationPolicySchema.parse(input);
  const policyRef = db.collection(PUBLICATION_POLICY_COLLECTION).doc(policyId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(policyRef);
    const current = readPolicy(snapshot.id, snapshot.data());
    const nextSpaces = parsed.allowedSpaces
      ? unique(parsed.allowedSpaces)
      : current.allowedSpaces;
    const nextTypes = parsed.allowedTypes ?? current.allowedTypes;
    const nextSensitivity = parsed.sensitivityCeiling ?? current.sensitivityCeiling;
    const nextEnabled = parsed.enabled ?? current.enabled;

    assertUniqueTypes(nextTypes);
    assertKnownSpaces(nextSpaces);
    assertPolicyOnlyTightens(current, {
      allowedSpaces: nextSpaces,
      allowedTypes: nextTypes,
      enabled: nextEnabled,
      sensitivityCeiling: nextSensitivity,
    });

    transaction.update(policyRef, {
      allowedSpaces: nextSpaces,
      allowedTypes: nextTypes,
      enabled: nextEnabled,
      sensitivityCeiling: nextSensitivity,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: actor.uid,
    });
    transaction.set(
      db.collection(PUBLICATION_POLICY_AUDIT_COLLECTION).doc(uuidv7()),
      bodylessPolicyAudit(policyId, actor.uid, "tightened", parsed.reason),
    );
  });

  return getPublicationPolicy(policyId, db);
}

export async function listPublicationPolicies(
  actor: AuthenticatedUser,
  db = getAdminFirestore(),
): Promise<PublicationPolicyRecord[]> {
  assertAdmin(actor);
  const snapshot = await db.collection(PUBLICATION_POLICY_COLLECTION).get();
  return snapshot.docs.map((doc) => readPolicy(doc.id, doc.data()));
}

export async function getPublicationPolicy(
  policyId: string,
  db = getAdminFirestore(),
): Promise<PublicationPolicyRecord> {
  const snapshot = await db.collection(PUBLICATION_POLICY_COLLECTION).doc(policyId).get();
  return readPolicy(snapshot.id, snapshot.data());
}

export async function resolvePublicationPolicyForSpace(
  actor: AuthenticatedUser,
  spaceId: string,
  policyId: string | undefined,
  db = getAdminFirestore(),
): Promise<PublicationPolicyRecord> {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError("This user cannot publish content.", 403);
  }

  if (policyId) {
    const policy = await getPublicationPolicy(policyId, db);
    if (!policy.enabled || !policy.allowedSpaces.includes(spaceId)) {
      throw new EditableLayerError(
        "No enabled publication policy covers this Space.",
        409,
      );
    }
    return policy;
  }

  const snapshot = await db.collection(PUBLICATION_POLICY_COLLECTION).get();
  const matches = snapshot.docs
    .map((doc) => readPolicy(doc.id, doc.data()))
    .filter((policy) => policy.enabled && policy.allowedSpaces.includes(spaceId));

  if (matches.length !== 1) {
    throw new EditableLayerError(
      matches.length === 0
        ? "No enabled publication policy covers this Space."
        : "More than one publication policy covers this Space; select one explicitly.",
      409,
    );
  }
  return matches[0];
}

function assertPolicyOnlyTightens(
  current: PublicationPolicyRecord,
  next: Pick<
    PublicationPolicyRecord,
    "allowedSpaces" | "allowedTypes" | "enabled" | "sensitivityCeiling"
  >,
) {
  if (next.enabled && !current.enabled) rejectWidening();
  if (next.allowedSpaces.some((space) => !current.allowedSpaces.includes(space))) {
    rejectWidening();
  }
  if (
    sensitivityRank(next.sensitivityCeiling) > sensitivityRank(current.sensitivityCeiling)
  ) {
    rejectWidening();
  }

  for (const rule of next.allowedTypes) {
    const prior = current.allowedTypes.find((item) => item.extension === rule.extension);
    if (!prior || rule.maxBytes > prior.maxBytes) rejectWidening();
    if (rule.mimeTypes.some((mime) => !prior.mimeTypes.includes(mime))) rejectWidening();
  }
}

function readPolicy(
  id: string,
  data: Record<string, unknown> | undefined,
): PublicationPolicyRecord {
  if (!data) throw new EditableLayerError("Publication policy was not found.", 404);
  return normalizeFirestoreValue({ id, ...data }) as PublicationPolicyRecord;
}

function bodylessPolicyAudit(
  policyId: string,
  actorUid: string,
  eventType: "created" | "tightened",
  reason: string,
) {
  return {
    actorUid,
    createdAt: FieldValue.serverTimestamp(),
    eventType,
    policyId,
    reason,
  };
}

function assertAdmin(actor: AuthenticatedUser) {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError("Admin publication-policy authority is required.", 403);
  }
}

function assertUniqueTypes(types: readonly PublicationAllowedType[]) {
  if (new Set(types.map((item) => item.extension)).size !== types.length) {
    throw new EditableLayerError(
      "Publication type rules must have unique extensions.",
      400,
    );
  }
}

function assertKnownSpaces(spaces: readonly string[]) {
  if (spaces.some((spaceId) => !launchSpaces.some((space) => space.id === spaceId))) {
    throw new EditableLayerError(
      "Publication policies require known launch Spaces.",
      400,
    );
  }
}

function rejectWidening(): never {
  throw new EditableLayerError(
    "An existing publication policy may only be tightened; create a separately audited policy to widen it.",
    409,
  );
}

function sensitivityRank(value: PublicationSensitivity) {
  return { High: 3, Low: 1, Medium: 2 }[value];
}

function unique(values: readonly string[]) {
  return Array.from(new Set(values));
}

function typeRule(
  extension: string,
  maxBytes: number,
  ...mimeTypes: string[]
): PublicationAllowedType {
  return Object.freeze({ extension, maxBytes, mimeTypes: Object.freeze(mimeTypes) });
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") return toDate.call(value).toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}
