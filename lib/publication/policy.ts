import { FieldValue } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolveStoredDataMode } from "@/lib/data-mode";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  PublicationAllowedType,
  PublicationPolicyRecord,
  PublicationSensitivity,
  ProcessPublicationResourceScope,
} from "@/lib/publication/types";
import { launchSpaces } from "@/lib/spaces";
import {
  PublicationResourceScopeSchema,
  publicationPolicyAllowsResource,
  type PublicationResourceRequest,
} from "./resource-scope";
import {
  MANAGED_PROCESS_SCANNER_KEY,
  MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY,
} from "./managed-scanner-config";
import { stablePublicationResourceId } from "./resource-id";
import { getProcessDefinition } from "@/lib/firestore/workflows";
import { spaceIdForProcessDefinition } from "@/lib/space-scope-resources";
import { processDefinitionPublicationContent } from "./process-definition-content";
import {
  processDefinitionRevision,
  storedProcessDefinitionRevision,
} from "./process-definition-revision";
import { inspectProcessSensitivity } from "./process-sensitivity";

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
    resourceScope: PublicationResourceScopeSchema.optional(),
    expectedDefinitionRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sensitivityCeiling: z.enum(["Low", "Medium", "High"]).default("Medium"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.scannerKey === MANAGED_PROCESS_SCANNER_KEY &&
      value.resourceScope?.resourceType !== "process_definition"
    )
      context.addIssue({
        code: "custom",
        path: ["resourceScope"],
        message:
          "The managed process scanner requires an exact process-definition scope.",
      });
  });

export const TightenPublicationPolicySchema = z
  .object({
    resourceScope: PublicationResourceScopeSchema.optional(),
    expectedContentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    expectedDefinitionRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
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
  assertReviewedOriginalPolicy(parsed);
  const review =
    parsed.resourceScope?.resourceType === "process_definition"
      ? await readProcessByteReview(
          actor,
          parsed.resourceScope,
          parsed.expectedDefinitionRevision,
          db,
        )
      : null;
  if (review && !parsed.allowedSpaces.includes(review.spaceId)) rejectReview();
  const id = uuidv7();
  const ref = db.collection(PUBLICATION_POLICY_COLLECTION).doc(id);
  const auditRef = db.collection(PUBLICATION_POLICY_AUDIT_COLLECTION).doc(uuidv7());

  await db.runTransaction(async (transaction) => {
    if (review) {
      const current = await transaction.get(
        db.collection("process_definitions").doc(review.definitionId),
      );
      if (
        !current.exists ||
        storedProcessDefinitionRevision(current.id, current.data()) !== review.revision
      )
        rejectReview();
    }
    transaction.set(ref, {
      id,
      data_mode: "live",
      allowedSpaces: unique(parsed.allowedSpaces),
      allowedTypes: parsed.allowedTypes,
      connectorId: parsed.connectorId,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: actor.uid,
      enabled: parsed.enabled,
      rootId: parsed.rootId,
      scannerKey: parsed.scannerKey,
      ...(parsed.resourceScope ? { resourceScope: parsed.resourceScope } : {}),
      ...(review ? { reviewedDefinitionRevision: review.revision } : {}),
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
  const review =
    parsed.resourceScope?.resourceType === "process_definition"
      ? await readProcessByteReview(
          actor,
          parsed.resourceScope,
          parsed.expectedDefinitionRevision,
          db,
        )
      : null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(policyRef);
    const current = readPolicy(snapshot.id, snapshot.data());
    const nextSpaces = parsed.allowedSpaces
      ? unique(parsed.allowedSpaces)
      : current.allowedSpaces;
    const nextTypes = parsed.allowedTypes ?? current.allowedTypes;
    const nextSensitivity = parsed.sensitivityCeiling ?? current.sensitivityCeiling;
    const nextEnabled = parsed.enabled ?? current.enabled;
    const nextScope = parsed.resourceScope ?? current.resourceScope;
    if (parsed.resourceScope && current.resourceScope) {
      if (
        parsed.resourceScope.resourceType !== current.resourceScope.resourceType ||
        parsed.resourceScope.resourceId !== current.resourceScope.resourceId
      )
        rejectWidening();
      if (parsed.expectedContentHash !== current.resourceScope.contentHash)
        rejectReview();
      if (
        parsed.resourceScope.resourceType === "file" &&
        current.resourceScope.resourceType === "file" &&
        (parsed.resourceScope.artifactKind !== current.resourceScope.artifactKind ||
          parsed.resourceScope.path !== current.resourceScope.path ||
          parsed.resourceScope.fileName !== current.resourceScope.fileName)
      )
        rejectWidening();
    } else if (parsed.expectedContentHash !== undefined) rejectReview();
    if (review) {
      const definition = await transaction.get(
        db.collection("process_definitions").doc(review.definitionId),
      );
      if (
        !definition.exists ||
        storedProcessDefinitionRevision(definition.id, definition.data()) !==
          review.revision ||
        !nextSpaces.includes(review.spaceId)
      )
        rejectReview();
    }

    assertUniqueTypes(nextTypes);
    assertKnownSpaces(nextSpaces);
    assertReviewedOriginalPolicy({
      ...current,
      resourceScope: nextScope,
      allowedSpaces: nextSpaces,
      allowedTypes: nextTypes,
      sensitivityCeiling: nextSensitivity,
      expectedDefinitionRevision: parsed.expectedDefinitionRevision,
    });
    assertPolicyOnlyTightens(current, {
      allowedSpaces: nextSpaces,
      allowedTypes: nextTypes,
      enabled: nextEnabled,
      sensitivityCeiling: nextSensitivity,
    });

    transaction.update(policyRef, {
      ...(nextScope ? { resourceScope: nextScope } : {}),
      ...(review ? { reviewedDefinitionRevision: review.revision } : {}),
      allowedSpaces: nextSpaces,
      allowedTypes: nextTypes,
      enabled: nextEnabled,
      sensitivityCeiling: nextSensitivity,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: actor.uid,
    });
    transaction.set(db.collection(PUBLICATION_POLICY_AUDIT_COLLECTION).doc(uuidv7()), {
      ...bodylessPolicyAudit(
        policyId,
        actor.uid,
        parsed.resourceScope ? "content_reviewed" : "tightened",
        parsed.reason,
      ),
      ...(parsed.resourceScope
        ? {
            previousContentHash: current.resourceScope?.contentHash ?? null,
            contentHash: parsed.resourceScope.contentHash,
            ...(review ? { definitionRevision: review.revision } : {}),
            ...(parsed.resourceScope.resourceType === "file"
              ? { originalByteSize: parsed.resourceScope.byteSize }
              : {}),
          }
        : {}),
    });
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
  resource?: PublicationResourceRequest,
): Promise<PublicationPolicyRecord> {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError("This user cannot publish content.", 403);
  }

  if (policyId) {
    const policy = await getPublicationPolicy(policyId, db);
    if (
      resolveStoredDataMode(policy) !== "live" ||
      !policy.enabled ||
      !policy.allowedSpaces.includes(spaceId)
    ) {
      throw new EditableLayerError(
        "No enabled Live publication policy covers this Space.",
        409,
      );
    }
    if (!publicationPolicyAllowsResource(policy, resource))
      throw new EditableLayerError(
        "This publication policy does not cover the exact process/resource scope.",
        409,
      );
    return policy;
  }

  const snapshot = await db.collection(PUBLICATION_POLICY_COLLECTION).get();
  const matches = snapshot.docs
    .map((doc) => readPolicy(doc.id, doc.data()))
    .filter(
      (policy) =>
        resolveStoredDataMode(policy) === "live" &&
        policy.enabled &&
        policy.allowedSpaces.includes(spaceId),
    )
    .filter((policy) => publicationPolicyAllowsResource(policy, resource));

  if (matches.length !== 1) {
    throw new EditableLayerError(
      matches.length === 0
        ? "No enabled Live publication policy covers this Space."
        : "More than one Live publication policy covers this Space; select one explicitly.",
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
  eventType: "created" | "tightened" | "content_reviewed",
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

function rejectReview(): never {
  throw new EditableLayerError(
    "The current process bytes, reviewed revision or prior policy hash do not match this fresh review. Reload and review the exact current process.",
    409,
  );
}

async function readProcessByteReview(
  actor: AuthenticatedUser,
  scope: ProcessPublicationResourceScope,
  expectedRevision: string | undefined,
  db: ReturnType<typeof getAdminFirestore>,
) {
  if (!expectedRevision) rejectReview();
  const definitionId = scope.resourceId.slice("process-definition:".length);
  let definition: Awaited<ReturnType<typeof getProcessDefinition>>;
  try {
    definition = await getProcessDefinition(actor, definitionId, db);
  } catch {
    rejectReview();
  }
  const revision = processDefinitionRevision(definition);
  const reviewed = processDefinitionPublicationContent(definition);
  const spaceId = spaceIdForProcessDefinition(definition);
  if (
    !spaceId ||
    definition.status === "Retired" ||
    revision !== expectedRevision ||
    reviewed.contentHash !== scope.contentHash ||
    inspectProcessSensitivity(reviewed.content).code !== "clean"
  )
    rejectReview();
  return { definitionId, revision, contentHash: reviewed.contentHash, spaceId };
}

function assertReviewedOriginalPolicy(input: {
  resourceScope?: PublicationPolicyRecord["resourceScope"];
  scannerKey: string;
  connectorId: string;
  rootId: string;
  allowedSpaces: readonly string[];
  allowedTypes: readonly PublicationAllowedType[];
  sensitivityCeiling: PublicationSensitivity;
  expectedDefinitionRevision?: string;
}) {
  const scope = input.resourceScope;
  if (scope?.resourceType !== "file") {
    if (input.scannerKey === MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY)
      throw new EditableLayerError("Review one exact blank renewal-original PDF.", 400);
    return;
  }
  const rule = input.allowedTypes[0];
  if (
    input.scannerKey !== MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY ||
    input.allowedSpaces.length !== 1 ||
    input.allowedSpaces[0] !== "lease-renewals" ||
    input.allowedTypes.length !== 1 ||
    rule?.extension !== ".pdf" ||
    rule.maxBytes > 2 * mib ||
    rule.maxBytes < scope.byteSize ||
    rule.mimeTypes.length !== 1 ||
    rule.mimeTypes[0] !== "application/pdf" ||
    input.sensitivityCeiling !== "Low" ||
    input.expectedDefinitionRevision !== undefined ||
    scope.resourceId !==
      stablePublicationResourceId(
        input.connectorId,
        input.rootId,
        "lease-renewals",
        scope.path,
      )
  )
    throw new EditableLayerError(
      "Renewal-original publication requires its exact canonical file/family/hash/size, renewals Space, PDF-only limits and reviewed blank/no-client-record scope.",
      400,
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
