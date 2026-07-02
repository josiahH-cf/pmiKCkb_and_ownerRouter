// Seed the Move-In process definition (S13 Wave 2 / space-teeth E1a) as a non-executable Draft at a
// FIXED id, so it appears in the /processes catalog and the Move-In Space recognizes it as a real
// Process. Mirrors the maintenance seed exactly: a pure builder reusing the spine's
// normalizeDefinitionFields (no id/step drift) + the shared generic writer (seedProcessDefinition),
// which refuses any executable reference. Seeds as Draft with empty source_links, so the activation
// lifecycle (Draft -> Testing -> Pending Approval -> Active) independently blocks activation.

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { normalizeDefinitionFields } from "@/lib/firestore/workflows";
import {
  seedProcessDefinition,
  type SeedFirestore,
  type SeedResult,
  type SeedableDefinition,
} from "@/lib/lease-renewal/process-definition-seed";
import { buildMoveInProcessTemplate } from "@/lib/move-in/process-template";

export const MOVE_IN_DEFINITION_ID = "move-in";

export interface MoveInDefinitionOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

/** Pure builder: the Move-In definition as a Draft record at the fixed id. */
export function buildMoveInDefinitionRecord(
  options: MoveInDefinitionOptions,
): SeedableDefinition {
  const template = buildMoveInProcessTemplate({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  const parsed = CreateProcessDefinitionInputSchema.parse(template);
  return {
    id: MOVE_IN_DEFINITION_ID,
    ...normalizeDefinitionFields(parsed),
    status: "Draft",
    created_by_uid: options.ownerUid,
    updated_by_uid: options.ownerUid,
  };
}

/** Idempotent writer for the Move-In definition (builds the record, then the generic writer). */
export async function seedMoveInDefinition(options: {
  db: SeedFirestore;
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
  force?: boolean;
  now: string;
}): Promise<SeedResult> {
  const record = buildMoveInDefinitionRecord({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  return seedProcessDefinition({
    db: options.db,
    record,
    force: options.force,
    now: options.now,
  });
}
