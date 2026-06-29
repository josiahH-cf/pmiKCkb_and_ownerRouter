// Seed the Maintenance Work Order Intake process definition (S4). Mirrors the lease-renewal seed: a pure
// builder at a FIXED id (so the seed is idempotent) reusing the spine's normalizeDefinitionFields (no
// id/step drift), and the shared generic writer (seedProcessDefinition) which refuses any executable
// reference. Seeds as Draft; the RentVine work-order writes stay non-executable until the activation
// lifecycle runs later.

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { normalizeDefinitionFields } from "@/lib/firestore/workflows";
import {
  seedProcessDefinition,
  type SeedFirestore,
  type SeedResult,
  type SeedableDefinition,
} from "@/lib/lease-renewal/process-definition-seed";
import { buildMaintenanceProcessTemplate } from "@/lib/maintenance/process-template";

export const MAINTENANCE_DEFINITION_ID = "maintenance-work-order-intake";

export interface MaintenanceDefinitionOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

/** Pure builder: the Maintenance Work Order Intake definition as a Draft record at the fixed id. */
export function buildMaintenanceDefinitionRecord(
  options: MaintenanceDefinitionOptions,
): SeedableDefinition {
  const template = buildMaintenanceProcessTemplate({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  const parsed = CreateProcessDefinitionInputSchema.parse(template);
  return {
    id: MAINTENANCE_DEFINITION_ID,
    ...normalizeDefinitionFields(parsed),
    status: "Draft",
    created_by_uid: options.ownerUid,
    updated_by_uid: options.ownerUid,
  };
}

/** Idempotent writer for the Maintenance definition (builds the record, then the generic writer). */
export async function seedMaintenanceDefinition(options: {
  db: SeedFirestore;
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
  force?: boolean;
  now: string;
}): Promise<SeedResult> {
  const record = buildMaintenanceDefinitionRecord({
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
