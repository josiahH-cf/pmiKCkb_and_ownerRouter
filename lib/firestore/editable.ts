import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { assertSpaceIdAccess } from "@/lib/space-scope-resources";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  ChangeLogAction,
  ChangeLogEntityType,
  ChangeLogRecord,
  PlaceholderRecord,
  SopRecord,
  TemplateRecord,
  ToolRecord,
} from "@/lib/firestore/types";
import type {
  CreatePlaceholderInput,
  CreateSopInput,
  CreateTemplateInput,
  CreateToolInput,
  UpdatePlaceholderInput,
  UpdateSopInput,
  UpdateTemplateInput,
  UpdateToolInput,
} from "@/lib/firestore/schemas";
import {
  CreatePlaceholderInputSchema,
  CreateSopInputSchema,
  CreateTemplateInputSchema,
  CreateToolInputSchema,
  UpdatePlaceholderInputSchema,
  UpdateSopInputSchema,
  UpdateTemplateInputSchema,
  UpdateToolInputSchema,
} from "@/lib/firestore/schemas";
import { launchSpaces } from "@/lib/spaces";

const COLLECTIONS = {
  changeLog: "change_log",
  placeholders: "placeholders",
  sops: "sops",
  spaces: "spaces",
  templates: "templates",
  tools: "tools",
} as const;

type FirestoreValue = Record<string, unknown>;

interface SpaceBoundary {
  id: string;
  read_only: boolean;
}

export async function listSops(
  actor: AuthenticatedUser,
  spaceId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  await assertKnownSpace(actor, db, spaceId);
  const snapshot = await db
    .collection(COLLECTIONS.sops)
    .where("space_id", "==", spaceId)
    .get();

  return snapshot.docs
    .map((doc) => readRecord<SopRecord>(doc.id, doc.data()))
    .filter(isActiveRecord);
}

export async function getSop(
  actor: AuthenticatedUser,
  sopId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.sops).doc(sopId).get();
  const record = readRequiredActiveRecord<SopRecord>(snapshot.id, snapshot.data(), "SOP");
  assertSpaceIdAccess(actor, record.space_id);
  return record;
}

export async function createSop(
  actor: AuthenticatedUser,
  spaceId: string,
  input: CreateSopInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = CreateSopInputSchema.parse(input);
  assertSopStatusAllowed(actor, parsedInput.status);
  validateSopState(parsedInput);

  const id = uuidv7();
  const { note, ...recordInput } = parsedInput;

  await db.runTransaction(async (transaction) => {
    await assertWritableSpace(actor, transaction, db, spaceId);
    const ref = db.collection(COLLECTIONS.sops).doc(id);
    const now = FieldValue.serverTimestamp();

    transaction.set(ref, {
      id,
      space_id: spaceId,
      ...stripUndefined(recordInput),
      created_at: now,
      updated_at: now,
    });
    createChangeLog(transaction, db, actor, "sop", id, "create", note);
  });

  return getSop(actor, id, db);
}

export async function updateSop(
  actor: AuthenticatedUser,
  sopId: string,
  input: UpdateSopInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = UpdateSopInputSchema.parse(input);
  const { note, ...updateInput } = parsedInput;
  const updates = stripUndefined(updateInput);
  assertHasUpdate(updates);

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.sops).doc(sopId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredActiveRecord<SopRecord>(
      snapshot.id,
      snapshot.data(),
      "SOP",
    );
    const next = { ...current, ...updates };

    assertSopStatusAllowed(actor, next.status);
    validateSopState(next);
    await assertWritableSpace(actor, transaction, db, next.space_id);

    transaction.update(ref, {
      ...updates,
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(
      transaction,
      db,
      actor,
      "sop",
      sopId,
      actionFromStatus(current.status, next.status),
      note,
      diffFor(updates),
    );
  });

  return getSop(actor, sopId, db);
}

export async function softDeleteSop(
  actor: AuthenticatedUser,
  sopId: string,
  note?: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "softDelete");

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.sops).doc(sopId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredActiveRecord<SopRecord>(
      snapshot.id,
      snapshot.data(),
      "SOP",
    );

    await assertWritableSpace(actor, transaction, db, current.space_id);
    transaction.update(ref, {
      deleted_at: FieldValue.serverTimestamp(),
      status: "Deprecated",
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(transaction, db, actor, "sop", sopId, "deprecate", note);
  });
}

export async function listTemplates(
  actor: AuthenticatedUser,
  spaceId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  await assertKnownSpace(actor, db, spaceId);
  const snapshot = await db
    .collection(COLLECTIONS.templates)
    .where("space_id", "==", spaceId)
    .get();

  return snapshot.docs
    .map((doc) => readRecord<TemplateRecord>(doc.id, doc.data()))
    .filter(isActiveRecord);
}

export async function getTemplate(
  actor: AuthenticatedUser,
  templateId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.templates).doc(templateId).get();
  const record = readRequiredActiveRecord<TemplateRecord>(
    snapshot.id,
    snapshot.data(),
    "template",
  );
  assertSpaceIdAccess(actor, record.space_id);
  return record;
}

export async function createTemplate(
  actor: AuthenticatedUser,
  spaceId: string,
  input: CreateTemplateInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = CreateTemplateInputSchema.parse(input);
  assertTemplateStatusAllowed(actor, parsedInput.status);

  const id = uuidv7();
  const { note, ...recordInput } = parsedInput;
  // F-TMPL-7: every template has an owner; default to the creator when the caller omits it. When a
  // template is created directly as Approved, stamp the approver server-side (never a client input),
  // so the approval audit trail cannot be forged.
  const record = {
    ...recordInput,
    owner_uid: recordInput.owner_uid ?? actor.uid,
    ...(recordInput.status === "Approved" ? { approved_by_uid: actor.uid } : {}),
  };
  validateTemplateState(record);

  await db.runTransaction(async (transaction) => {
    await assertWritableSpace(actor, transaction, db, spaceId);
    await assertUniqueTemplateName(transaction, db, spaceId, record.name);
    const ref = db.collection(COLLECTIONS.templates).doc(id);
    const now = FieldValue.serverTimestamp();

    transaction.set(ref, {
      id,
      space_id: spaceId,
      ...stripUndefined(record),
      created_at: now,
      updated_at: now,
    });
    createChangeLog(transaction, db, actor, "template", id, "create", note);
  });

  return getTemplate(actor, id, db);
}

export async function updateTemplate(
  actor: AuthenticatedUser,
  templateId: string,
  input: UpdateTemplateInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = UpdateTemplateInputSchema.parse(input);
  const { note, ...updateInput } = parsedInput;
  const updates = stripUndefined(updateInput);
  assertHasUpdate(updates);

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.templates).doc(templateId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredActiveRecord<TemplateRecord>(
      snapshot.id,
      snapshot.data(),
      "template",
    );
    // F-TMPL-7 (audit integrity): whenever this update sets status to Approved, stamp the approver to
    // the acting user server-side. approved_by_uid is not a client input, so it cannot be forged or
    // pre-seeded onto a Draft; the acting approver is always recorded as the approver.
    const stampedUpdates =
      updates.status === "Approved"
        ? { ...updates, approved_by_uid: actor.uid }
        : updates;
    const next = { ...current, ...stampedUpdates };

    assertTemplateStatusAllowed(actor, next.status);
    validateTemplateState(next);
    await assertWritableSpace(actor, transaction, db, next.space_id);
    if (typeof stampedUpdates.name === "string") {
      await assertUniqueTemplateName(
        transaction,
        db,
        next.space_id,
        stampedUpdates.name,
        templateId,
      );
    }

    transaction.update(ref, {
      ...stampedUpdates,
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(
      transaction,
      db,
      actor,
      "template",
      templateId,
      actionFromStatus(current.status, next.status),
      note,
      diffFor(stampedUpdates),
    );
  });

  return getTemplate(actor, templateId, db);
}

export async function softDeleteTemplate(
  actor: AuthenticatedUser,
  templateId: string,
  note?: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "softDelete");

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.templates).doc(templateId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredActiveRecord<TemplateRecord>(
      snapshot.id,
      snapshot.data(),
      "template",
    );

    await assertWritableSpace(actor, transaction, db, current.space_id);
    transaction.update(ref, {
      deleted_at: FieldValue.serverTimestamp(),
      status: "Deprecated",
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(transaction, db, actor, "template", templateId, "deprecate", note);
  });
}

export async function listPlaceholders(
  actor: AuthenticatedUser,
  spaceId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  await assertKnownSpace(actor, db, spaceId);
  const snapshot = await db
    .collection(COLLECTIONS.placeholders)
    .where("space_id", "==", spaceId)
    .get();

  return snapshot.docs
    .map((doc) => readRecord<PlaceholderRecord>(doc.id, doc.data()))
    .filter(isActiveRecord)
    .sort(comparePlaceholders);
}

export async function getPlaceholder(
  actor: AuthenticatedUser,
  placeholderId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.placeholders).doc(placeholderId).get();
  const record = readRequiredActiveRecord<PlaceholderRecord>(
    snapshot.id,
    snapshot.data(),
    "placeholder",
  );
  assertSpaceIdAccess(actor, record.space_id);
  return record;
}

export async function createPlaceholder(
  actor: AuthenticatedUser,
  spaceId: string,
  input: CreatePlaceholderInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = CreatePlaceholderInputSchema.parse(input);
  assertPlaceholderStatusAllowed(actor, parsedInput.status);
  validatePlaceholderState(parsedInput);

  const id = uuidv7();
  const { note, ...recordInput } = parsedInput;

  await db.runTransaction(async (transaction) => {
    await assertWritableSpace(actor, transaction, db, spaceId);
    await assertRelatedSop(transaction, db, spaceId, parsedInput.related_sop_id);

    const ref = db.collection(COLLECTIONS.placeholders).doc(id);
    const now = FieldValue.serverTimestamp();

    transaction.set(ref, {
      id,
      space_id: spaceId,
      ...stripUndefined(recordInput),
      created_at: now,
      updated_at: now,
    });
    createChangeLog(transaction, db, actor, "placeholder", id, "create", note);
  });

  return getPlaceholder(actor, id, db);
}

export async function updatePlaceholder(
  actor: AuthenticatedUser,
  placeholderId: string,
  input: UpdatePlaceholderInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = UpdatePlaceholderInputSchema.parse(input);
  const { note, ...updateInput } = parsedInput;
  const updates = stripUndefined(updateInput);
  assertHasUpdate(updates);

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.placeholders).doc(placeholderId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredActiveRecord<PlaceholderRecord>(
      snapshot.id,
      snapshot.data(),
      "placeholder",
    );
    if (current.status === "Resolved" && updates.status === "Resolved") {
      throw new EditableLayerError("This placeholder is already resolved.", 409);
    }
    const next = { ...current, ...updates };

    assertPlaceholderStatusAllowed(actor, next.status);
    validatePlaceholderState(next);
    await assertWritableSpace(actor, transaction, db, next.space_id);
    await assertRelatedSop(transaction, db, next.space_id, next.related_sop_id);

    transaction.update(ref, {
      ...updates,
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(
      transaction,
      db,
      actor,
      "placeholder",
      placeholderId,
      "update",
      note,
      diffFor(updates),
    );
  });

  return getPlaceholder(actor, placeholderId, db);
}

export async function softDeletePlaceholder(
  actor: AuthenticatedUser,
  placeholderId: string,
  note?: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "softDelete");

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.placeholders).doc(placeholderId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredActiveRecord<PlaceholderRecord>(
      snapshot.id,
      snapshot.data(),
      "placeholder",
    );

    await assertWritableSpace(actor, transaction, db, current.space_id);
    transaction.update(ref, {
      deleted_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(
      transaction,
      db,
      actor,
      "placeholder",
      placeholderId,
      "deprecate",
      note,
    );
  });
}

export async function listTools(actor: AuthenticatedUser, db = getAdminFirestore()) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.tools).get();

  return snapshot.docs
    .map((doc) => readRecord<ToolRecord>(doc.id, doc.data()))
    .filter(isActiveRecord);
}

export async function getTool(
  actor: AuthenticatedUser,
  toolId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.tools).doc(toolId).get();
  return readRequiredActiveRecord<ToolRecord>(snapshot.id, snapshot.data(), "tool");
}

export async function createTool(
  actor: AuthenticatedUser,
  input: CreateToolInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = CreateToolInputSchema.parse(input);

  const id = uuidv7();
  const { note, ...recordInput } = parsedInput;

  await db.runTransaction(async (transaction) => {
    await assertUniqueToolName(transaction, db, parsedInput.name);
    const ref = db.collection(COLLECTIONS.tools).doc(id);
    const now = FieldValue.serverTimestamp();

    transaction.set(ref, {
      id,
      ...stripUndefined(recordInput),
      created_at: now,
      updated_at: now,
    });
    createChangeLog(transaction, db, actor, "tool", id, "create", note);
  });

  return getTool(actor, id, db);
}

export async function updateTool(
  actor: AuthenticatedUser,
  toolId: string,
  input: UpdateToolInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsedInput = UpdateToolInputSchema.parse(input);
  const { note, ...updateInput } = parsedInput;
  const updates = stripUndefined(updateInput);
  assertHasUpdate(updates);

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.tools).doc(toolId);
    const snapshot = await transaction.get(ref);
    readRequiredActiveRecord<ToolRecord>(snapshot.id, snapshot.data(), "tool");

    if (typeof updates.name === "string") {
      await assertUniqueToolName(transaction, db, updates.name, toolId);
    }

    transaction.update(ref, {
      ...updates,
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(
      transaction,
      db,
      actor,
      "tool",
      toolId,
      "update",
      note,
      diffFor(updates),
    );
  });

  return getTool(actor, toolId, db);
}

export async function softDeleteTool(
  actor: AuthenticatedUser,
  toolId: string,
  note?: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "softDelete");

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.tools).doc(toolId);
    const snapshot = await transaction.get(ref);
    readRequiredActiveRecord<ToolRecord>(snapshot.id, snapshot.data(), "tool");

    transaction.update(ref, {
      deleted_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    createChangeLog(transaction, db, actor, "tool", toolId, "deprecate", note);
  });
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested editable-layer action.",
      403,
    );
  }
}

async function assertKnownSpace(
  actor: AuthenticatedUser,
  db: Firestore,
  spaceId: string,
) {
  // SPACE-1/TMPL-4: a scope-restricted principal may only read/write editable-layer records in a
  // Space they can access; an unscoped principal (scopes === undefined) still reaches every Space.
  assertSpaceIdAccess(actor, spaceId);
  const snapshot = await db.collection(COLLECTIONS.spaces).doc(spaceId).get();

  if (snapshot.exists || launchSpaces.some((space) => space.id === spaceId)) {
    return;
  }

  throw new EditableLayerError("Space was not found.", 404);
}

async function assertWritableSpace(
  actor: AuthenticatedUser,
  transaction: Transaction,
  db: Firestore,
  spaceId: string,
) {
  // SPACE-1/TMPL-4: enforce space scope before any write, using the record's own space id for the
  // id-based item routes (which carry no spaceId of their own).
  assertSpaceIdAccess(actor, spaceId);
  const space = await readSpaceBoundary(transaction, db, spaceId);

  if (space.read_only) {
    throw new EditableLayerError("This Space is read-only.", 403);
  }
}

async function readSpaceBoundary(
  transaction: Transaction,
  db: Firestore,
  spaceId: string,
): Promise<SpaceBoundary> {
  const snapshot = await transaction.get(db.collection(COLLECTIONS.spaces).doc(spaceId));

  if (snapshot.exists) {
    const data = snapshot.data() ?? {};
    return {
      id: snapshot.id,
      read_only: data.read_only === true,
    };
  }

  const launchSpace = launchSpaces.find((space) => space.id === spaceId);

  if (launchSpace) {
    return {
      id: launchSpace.id,
      read_only: launchSpace.readOnly === true,
    };
  }

  throw new EditableLayerError("Space was not found.", 404);
}

async function assertRelatedSop(
  transaction: Transaction,
  db: Firestore,
  spaceId: string,
  sopId?: string,
) {
  if (!sopId) {
    return;
  }

  const snapshot = await transaction.get(db.collection(COLLECTIONS.sops).doc(sopId));
  const sop = readRequiredActiveRecord<SopRecord>(snapshot.id, snapshot.data(), "SOP");

  if (sop.space_id !== spaceId) {
    throw new EditableLayerError(
      "Placeholder related SOP must belong to the same Space.",
      400,
    );
  }
}

async function assertUniqueToolName(
  transaction: Transaction,
  db: Firestore,
  name: string,
  exceptToolId?: string,
) {
  const snapshot = await transaction.get(db.collection(COLLECTIONS.tools));
  const normalizedName = normalizeName(name);
  const duplicate = snapshot.docs
    .map((doc) => readRecord<ToolRecord>(doc.id, doc.data()))
    .find(
      (tool) =>
        tool.id !== exceptToolId &&
        isActiveRecord(tool) &&
        normalizeName(tool.name) === normalizedName,
    );

  if (duplicate) {
    throw new EditableLayerError("An active tool with this name already exists.", 409);
  }
}

// F-TMPL-7: template names must be unique WITHIN a Space (unlike tools, which are global). Scoped by
// space_id so the same name may exist in different Spaces. Reads inside the transaction before writes.
async function assertUniqueTemplateName(
  transaction: Transaction,
  db: Firestore,
  spaceId: string,
  name: string,
  exceptTemplateId?: string,
) {
  const snapshot = await transaction.get(db.collection(COLLECTIONS.templates));
  const normalizedName = normalizeName(name);
  const duplicate = snapshot.docs
    .map((doc) => readRecord<TemplateRecord>(doc.id, doc.data()))
    .find(
      (template) =>
        template.id !== exceptTemplateId &&
        template.space_id === spaceId &&
        isActiveRecord(template) &&
        normalizeName(template.name) === normalizedName,
    );

  if (duplicate) {
    throw new EditableLayerError(
      "An active template with this name already exists in this Space.",
      409,
    );
  }
}

function assertSopStatusAllowed(actor: AuthenticatedUser, status?: unknown) {
  if (status === "Approved" && !can(actor.role, "approve")) {
    throw new EditableLayerError("Editor role cannot approve SOPs.", 403);
  }
}

function assertTemplateStatusAllowed(actor: AuthenticatedUser, status?: unknown) {
  if (status === "Approved" && !can(actor.role, "approve")) {
    throw new EditableLayerError("Editor role cannot approve templates.", 403);
  }
}

function assertPlaceholderStatusAllowed(actor: AuthenticatedUser, status?: unknown) {
  if (status === "Resolved" && !can(actor.role, "resolvePlaceholder")) {
    throw new EditableLayerError("Editor role cannot resolve placeholders.", 403);
  }
}

function validateSopState(
  sop: Pick<SopRecord, "body_md" | "owner_uid" | "status" | "title"> & {
    last_reviewed_at?: string;
  },
) {
  if (
    sop.status === "Approved" &&
    (!sop.title || !sop.owner_uid || !sop.body_md || !sop.last_reviewed_at)
  ) {
    throw new EditableLayerError(
      "Approved SOPs require title, owner, body, and last_reviewed_at.",
      400,
    );
  }
}

function validateTemplateState(
  template: Pick<TemplateRecord, "body" | "name" | "status"> & {
    owner_uid?: string;
    approved_by_uid?: string;
    last_reviewed_at?: string;
  },
) {
  if (
    template.status === "Approved" &&
    (!template.name ||
      !template.body ||
      !template.owner_uid ||
      !template.approved_by_uid ||
      !template.last_reviewed_at)
  ) {
    throw new EditableLayerError(
      "Approved templates require name, body, owner, approved_by_uid, and last_reviewed_at.",
      400,
    );
  }
}

function validatePlaceholderState(
  placeholder: Pick<PlaceholderRecord, "missing_detail" | "owner_uid" | "status"> & {
    resolution?: string;
  },
) {
  if (
    placeholder.status === "Resolved" &&
    (!placeholder.missing_detail || !placeholder.owner_uid || !placeholder.resolution)
  ) {
    throw new EditableLayerError(
      "Resolved placeholders require missing_detail, owner, and resolution.",
      400,
    );
  }
}

function createChangeLog(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  entityType: ChangeLogEntityType,
  entityId: string,
  action: ChangeLogAction,
  note?: string,
  diff?: string,
) {
  const id = uuidv7();
  const record: Omit<ChangeLogRecord, "created_at"> & {
    created_at: FieldValue;
  } = {
    id,
    action,
    entity_id: entityId,
    entity_type: entityType,
    editor_uid: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    ...stripUndefined({ diff, note }),
  };

  transaction.set(db.collection(COLLECTIONS.changeLog).doc(id), record);
}

function actionFromStatus(
  previousStatus: string | undefined,
  nextStatus: string | undefined,
): ChangeLogAction {
  if (previousStatus !== nextStatus && nextStatus === "Approved") {
    return "approve";
  }

  if (previousStatus !== nextStatus && nextStatus === "Deprecated") {
    return "deprecate";
  }

  if (previousStatus === "In Review" && nextStatus === "Draft") {
    return "reject";
  }

  return "update";
}

function readRequiredActiveRecord<T extends { deleted_at?: string }>(
  id: string,
  data: FirestoreValue | undefined,
  entityLabel: string,
) {
  if (!data) {
    throw new EditableLayerError(`${entityLabel} was not found.`, 404);
  }

  const record = readRecord<T>(id, data);

  if (!isActiveRecord(record)) {
    throw new EditableLayerError(`${entityLabel} was not found.`, 404);
  }

  return record;
}

function readRecord<T>(id: string, data: FirestoreValue) {
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;

    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        normalizeFirestoreValue(childValue),
      ]),
    );
  }

  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function assertHasUpdate(updates: Record<string, unknown>) {
  if (Object.keys(updates).length === 0) {
    throw new EditableLayerError("At least one editable field is required.", 400);
  }
}

function diffFor(updates: Record<string, unknown>) {
  return JSON.stringify(updates);
}

function isActiveRecord<T extends { deleted_at?: string }>(record: T) {
  return !record.deleted_at;
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function comparePlaceholders(left: PlaceholderRecord, right: PlaceholderRecord) {
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const priorityDelta = priorityOrder[left.priority] - priorityOrder[right.priority];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31");
}
