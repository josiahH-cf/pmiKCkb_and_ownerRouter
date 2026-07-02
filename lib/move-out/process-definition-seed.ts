// Seed the Move-Out + Deposit Disposition process definition (S13 Wave 2 / space-teeth E1b) as a
// non-executable Draft at a FIXED id. Mirrors the maintenance seed exactly: a pure builder reusing
// the spine's normalizeDefinitionFields + the shared generic writer (seedProcessDefinition), which
// refuses any executable reference. Seeds as Draft with empty source_links (activation independently
// blocked). The suggested deposit deduction is desk-side and owner-approval-gated — never here.

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { normalizeDefinitionFields } from "@/lib/firestore/workflows";
import {
  seedProcessDefinition,
  type SeedFirestore,
  type SeedResult,
  type SeedableDefinition,
} from "@/lib/lease-renewal/process-definition-seed";
import { buildMoveOutProcessTemplate } from "@/lib/move-out/process-template";

export const MOVE_OUT_DEFINITION_ID = "move-out-deposit-disposition";

export interface MoveOutDefinitionOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

/** Pure builder: the Move-Out definition as a Draft record at the fixed id. */
export function buildMoveOutDefinitionRecord(
  options: MoveOutDefinitionOptions,
): SeedableDefinition {
  const template = buildMoveOutProcessTemplate({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  const parsed = CreateProcessDefinitionInputSchema.parse(template);
  return {
    id: MOVE_OUT_DEFINITION_ID,
    ...normalizeDefinitionFields(parsed),
    status: "Draft",
    created_by_uid: options.ownerUid,
    updated_by_uid: options.ownerUid,
  };
}

/** Idempotent writer for the Move-Out definition (builds the record, then the generic writer). */
export async function seedMoveOutDefinition(options: {
  db: SeedFirestore;
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
  force?: boolean;
  now: string;
}): Promise<SeedResult> {
  const record = buildMoveOutDefinitionRecord({
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
