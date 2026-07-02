// Seed the Owner Renewal Outreach process definition (S13 Wave 2 / space-teeth E4a) as a
// non-executable Draft at a FIXED id. Mirrors the maintenance seed: a pure builder reusing the
// spine's normalizeDefinitionFields + the shared generic writer (seedProcessDefinition). No action
// references (Gmail draft only).

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { normalizeDefinitionFields } from "@/lib/firestore/workflows";
import {
  seedProcessDefinition,
  type SeedFirestore,
  type SeedResult,
  type SeedableDefinition,
} from "@/lib/lease-renewal/process-definition-seed";
import { buildOwnerRenewalOutreachProcessTemplate } from "@/lib/lease-renewal/owner-renewal-outreach/process-template";

export const OWNER_RENEWAL_OUTREACH_DEFINITION_ID = "owner-renewal-outreach";

export interface OwnerRenewalOutreachDefinitionOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

/** Pure builder: the Owner Renewal Outreach definition as a Draft record at the fixed id. */
export function buildOwnerRenewalOutreachDefinitionRecord(
  options: OwnerRenewalOutreachDefinitionOptions,
): SeedableDefinition {
  const template = buildOwnerRenewalOutreachProcessTemplate({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  const parsed = CreateProcessDefinitionInputSchema.parse(template);
  return {
    id: OWNER_RENEWAL_OUTREACH_DEFINITION_ID,
    ...normalizeDefinitionFields(parsed),
    status: "Draft",
    created_by_uid: options.ownerUid,
    updated_by_uid: options.ownerUid,
  };
}

/** Idempotent writer for the Owner Renewal Outreach definition. */
export async function seedOwnerRenewalOutreachDefinition(options: {
  db: SeedFirestore;
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
  force?: boolean;
  now: string;
}): Promise<SeedResult> {
  const record = buildOwnerRenewalOutreachDefinitionRecord({
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
