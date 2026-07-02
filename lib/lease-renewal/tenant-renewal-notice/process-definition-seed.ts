// Seed the Tenant Renewal Notice + Dotloop follow-up process definition (S13 Wave 2 / space-teeth
// E3b) as a non-executable Draft at a FIXED id. Mirrors the maintenance seed: a pure builder reusing
// the spine's normalizeDefinitionFields + the shared generic writer (seedProcessDefinition), which
// refuses any executable reference. Its two Dotloop action references stay Needs Permission.

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import { normalizeDefinitionFields } from "@/lib/firestore/workflows";
import {
  seedProcessDefinition,
  type SeedFirestore,
  type SeedResult,
  type SeedableDefinition,
} from "@/lib/lease-renewal/process-definition-seed";
import { buildTenantRenewalNoticeProcessTemplate } from "@/lib/lease-renewal/tenant-renewal-notice/process-template";

export const TENANT_RENEWAL_NOTICE_DEFINITION_ID = "tenant-renewal-notice";

export interface TenantRenewalNoticeDefinitionOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

/** Pure builder: the Tenant Renewal Notice definition as a Draft record at the fixed id. */
export function buildTenantRenewalNoticeDefinitionRecord(
  options: TenantRenewalNoticeDefinitionOptions,
): SeedableDefinition {
  const template = buildTenantRenewalNoticeProcessTemplate({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  const parsed = CreateProcessDefinitionInputSchema.parse(template);
  return {
    id: TENANT_RENEWAL_NOTICE_DEFINITION_ID,
    ...normalizeDefinitionFields(parsed),
    status: "Draft",
    created_by_uid: options.ownerUid,
    updated_by_uid: options.ownerUid,
  };
}

/** Idempotent writer for the Tenant Renewal Notice definition. */
export async function seedTenantRenewalNoticeDefinition(options: {
  db: SeedFirestore;
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
  force?: boolean;
  now: string;
}): Promise<SeedResult> {
  const record = buildTenantRenewalNoticeDefinitionRecord({
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
