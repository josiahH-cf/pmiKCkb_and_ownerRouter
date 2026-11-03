import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { EditableLayerError } from "./errors";
import { CreateProcessDefinitionInputSchema } from "./schemas";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "./types";
import {
  isRetiredMaintenanceWorkflow,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";
import {
  assertProcessDefinitionRecordAccess,
  assertWorkflowRunAccess,
  spaceIdForProcessDefinition,
} from "@/lib/space-scope-resources";

type RunBinding = Pick<
  WorkflowRunRecord,
  "definition_id" | "definition_version_id" | "space_id"
>;
type RunDefinition = Pick<
  ProcessDefinitionRecord,
  "id" | "space_id" | "name" | "default_approver_uid" | "steps"
>;

function unavailable(): never {
  throw new EditableLayerError(
    "This run's immutable process version is unavailable or inconsistent. No current definition was substituted.",
    409,
  );
}

/** Metadata may identify a retired run; none of its operational history is an active surface. */
export function assertWorkflowRunHistoryAvailable(
  run: Pick<WorkflowRunRecord, "definition_id" | "space_id">,
) {
  if (isRetiredMaintenanceWorkflow(run.space_id, run.definition_id))
    throw new EditableLayerError(MAINTENANCE_RETIREMENT_MESSAGE, 410);
}

/** Existing pinned versions are the run's content owner; legacy unpinned runs keep their meaning. */
export async function readWorkflowRunDefinition(
  actor: AuthenticatedUser,
  run: RunBinding,
  db: Firestore,
  transaction?: Transaction,
): Promise<RunDefinition> {
  if (!can(actor.role, "read"))
    throw new EditableLayerError("Workflow read access is required.", 403);
  assertWorkflowRunAccess(actor, run);
  assertWorkflowRunHistoryAvailable(run);
  let definition: RunDefinition;
  if (run.definition_version_id === undefined) {
    const ref = db.collection("process_definitions").doc(run.definition_id);
    const snapshot = transaction ? await transaction.get(ref) : await ref.get();
    if (!snapshot.exists)
      throw new EditableLayerError("Process definition not found.", 404);
    definition = { ...snapshot.data(), id: snapshot.id } as RunDefinition;
  } else {
    const versionId = run.definition_version_id;
    if (typeof versionId !== "string" || !versionId.trim() || versionId.includes("/"))
      unavailable();
    const ref = db.collection("process_definition_versions").doc(versionId);
    const snapshot = transaction ? await transaction.get(ref) : await ref.get();
    const version = snapshot.data();
    if (
      !snapshot.exists ||
      version?.id !== versionId ||
      version.definition_id !== run.definition_id ||
      !Number.isInteger(version.version_number) ||
      version.version_number < 1 ||
      typeof version.snapshot_json !== "string"
    )
      unavailable();
    let content: unknown;
    try {
      content = JSON.parse(version.snapshot_json);
    } catch {
      unavailable();
    }
    if (!content || typeof content !== "object" || Array.isArray(content)) unavailable();
    const value = content as Record<string, unknown>;
    if (
      value.id !== run.definition_id ||
      value.active_version_id !== versionId ||
      value.status !== "Active" ||
      !CreateProcessDefinitionInputSchema.safeParse(value).success
    )
      unavailable();
    definition = value as unknown as RunDefinition;
    if (
      definition.steps.some((step) => typeof step.id !== "string" || !step.id.trim()) ||
      new Set(definition.steps.map((step) => step.id)).size !== definition.steps.length
    )
      unavailable();
  }
  if (
    definition.id !== run.definition_id ||
    (run.space_id !== undefined &&
      spaceIdForProcessDefinition(definition) !== run.space_id)
  )
    unavailable();
  assertProcessDefinitionRecordAccess(actor, definition);
  return definition;
}
