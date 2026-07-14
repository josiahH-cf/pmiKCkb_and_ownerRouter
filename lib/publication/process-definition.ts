import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getProcessDefinition } from "@/lib/firestore/workflows";
import { resolvePublicationPolicyForSpace } from "@/lib/publication/policy";
import { resolvePublicationScanner } from "@/lib/publication/provider";
import { publishTrustedContent } from "@/lib/publication/service";
import type { PublicationScanner } from "@/lib/publication/types";
import {
  assertProcessDefinitionRecordAccess,
  assertSpaceIdAccess,
  spaceIdForProcessDefinition,
} from "@/lib/space-scope-resources";

export const PublishProcessDefinitionSchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
    policy_id: z.string().trim().min(1).optional(),
  })
  .strict();

export type PublishProcessDefinitionInput = z.input<
  typeof PublishProcessDefinitionSchema
>;

export async function publishProcessDefinition(
  actor: AuthenticatedUser,
  definitionId: string,
  input: PublishProcessDefinitionInput = {},
  options: {
    db?: Firestore;
    scanner?: PublicationScanner;
  } = {},
) {
  const db = options.db ?? getAdminFirestore();
  const parsed = PublishProcessDefinitionSchema.parse(input);
  const definition = await getProcessDefinition(actor, definitionId, db);
  assertProcessDefinitionRecordAccess(actor, definition);
  const spaceId = spaceIdForProcessDefinition(definition);
  if (!spaceId) {
    throw new EditableLayerError(
      "Assign this process definition to a configured Space before publication.",
      409,
    );
  }
  assertSpaceIdAccess(actor, spaceId);
  if (definition.status === "Retired") {
    throw new EditableLayerError("Retired process definitions cannot be published.", 409);
  }
  if (definition.source_links.length === 0) {
    throw new EditableLayerError(
      "Process publication requires at least one source or documentation link.",
      409,
    );
  }

  const policy = await resolvePublicationPolicyForSpace(
    actor,
    spaceId,
    parsed.policy_id,
    db,
  );
  const scanner = options.scanner ?? resolvePublicationScanner(policy.scannerKey);
  const snapshot = {
    ...definition,
    active_version_id: undefined,
    pending_queue_item_id: undefined,
    status: "Active" as const,
  };
  const content = new TextEncoder().encode(JSON.stringify(snapshot));
  const actionKeys = definition.action_references.flatMap((reference) =>
    reference.action_registry_key ? [reference.action_registry_key] : [],
  );

  const registeredProcessActionKeys = await readRegisteredActionKeys(actionKeys, db);

  const publicationVersion = await publishTrustedContent(
    actor,
    policy,
    {
      loadContent: async () => content,
      metadata: {
        citationLabel: definition.source_links.map((source) => source.label).join(", "),
        connectorId: policy.connectorId,
        declaredByteSize: content.byteLength,
        declaredMimeType: "application/json",
        detectedMimeType: "application/json",
        fileName: `${definition.id}.json`,
        path: `process-definitions/${definition.id}.json`,
        processActionKeys: actionKeys,
        processStepIds: definition.steps.map((step) => step.id),
        resourceId: `process-definition:${definition.id}`,
        resourceType: "process_definition",
        rootId: policy.rootId,
        sourceState: "Verified Source",
        spaceId,
      },
    },
    scanner,
    {
      db,
      registeredProcessActionKeys,
      extendCommit: ({ transaction, versionId, versionNumber }) => {
        transaction.set(db.collection("process_definition_versions").doc(versionId), {
          id: versionId,
          activated_by_uid: actor.uid,
          created_at: FieldValue.serverTimestamp(),
          definition_id: definition.id,
          snapshot_json: JSON.stringify({
            ...snapshot,
            active_version_id: versionId,
          }),
          version_number: versionNumber,
        });
        transaction.update(db.collection("process_definitions").doc(definition.id), {
          active_version_id: versionId,
          activated_at: FieldValue.serverTimestamp(),
          activated_by_uid: actor.uid,
          pending_queue_item_id: FieldValue.delete(),
          status: "Active",
          updated_at: FieldValue.serverTimestamp(),
          updated_by_uid: actor.uid,
        });
      },
    },
  );

  return {
    definition: await getProcessDefinition(actor, definition.id, db),
    publicationVersion,
  };
}

async function readRegisteredActionKeys(actionKeys: readonly string[], db: Firestore) {
  const results = await Promise.all(
    Array.from(new Set(actionKeys)).map(async (key) => {
      const snapshot = await db.collection("action_registry").doc(key).get();
      return snapshot.exists ? key : null;
    }),
  );
  return new Set(results.filter((key): key is string => key !== null));
}
