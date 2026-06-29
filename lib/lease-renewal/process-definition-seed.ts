// Seed the Lease Renewal process definition (R3 wiring). Promotes lease-renewal off the standalone
// demo into a REAL Draft process definition the spine recognizes, at a FIXED id so the seed is
// idempotent (createProcessDefinition's uuidv7 id can't be re-applied). It seeds as Draft with every
// action reference non-executable; activation runs later through the existing tested
// Draft -> Testing -> Pending Approval -> Active lifecycle. The builder is pure (no timestamps, no
// Firestore import — reuses the spine's normalizeDefinitionFields so step/action ids cannot drift);
// the writer stamps ISO created_at/updated_at and preserves created_at on a forced update.

import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";
import { normalizeDefinitionFields } from "@/lib/firestore/workflows";
import { buildLeaseRenewalProcessTemplate } from "@/lib/lease-renewal/process-template";

export const LEASE_RENEWAL_DEFINITION_ID = "lease-renewal";
const PROCESS_DEFINITIONS_COLLECTION = "process_definitions";

export interface LeaseRenewalDefinitionOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

/** A process-definition record minus the timestamps the writer stamps. */
export type SeedableDefinition = Omit<ProcessDefinitionRecord, "created_at" | "updated_at">;

/** Pure builder: the Lease Renewal definition as a Draft record at the fixed id, steps + action
 *  references normalized exactly as createProcessDefinition does. No timestamps, no Firestore. */
export function buildLeaseRenewalDefinitionRecord(
  options: LeaseRenewalDefinitionOptions,
): SeedableDefinition {
  const template = buildLeaseRenewalProcessTemplate({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  const parsed = CreateProcessDefinitionInputSchema.parse(template);
  return {
    id: LEASE_RENEWAL_DEFINITION_ID,
    ...normalizeDefinitionFields(parsed),
    status: "Draft",
    created_by_uid: options.ownerUid,
    updated_by_uid: options.ownerUid,
  };
}

/** Governance guard: the renewal definition must seed as a non-executable Draft. Refuse to write if
 *  any action reference is 'Approved for Execution' (the readiness that could gate a real write). */
export function assertNoExecutableReferences(record: SeedableDefinition): void {
  const executable = record.action_references.filter(
    (reference) => reference.readiness === "Approved for Execution",
  );
  if (executable.length > 0) {
    throw new Error(
      `Refusing to seed: ${executable.length} action reference(s) are 'Approved for Execution'. ` +
        "The Lease Renewal definition seeds as a non-executable Draft; executable actions require an approved per-action spec.",
    );
  }
}

/** Minimal Firestore surface the seed needs — satisfied by firebase-admin's Firestore and by the
 *  in-memory fake in tests, so the writer needs no firebase-admin import. */
export interface SeedFirestore {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>): Promise<unknown>;
    };
  };
}

export interface SeedResult {
  id: string;
  action: "created" | "updated" | "skipped";
}

/** Idempotent writer. Existing + !force -> skip. force -> update, preserving the original created_at.
 *  ISO timestamps come from `now` (injectable for deterministic tests). */
export async function seedLeaseRenewalDefinition(options: {
  db: SeedFirestore;
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
  force?: boolean;
  now: string;
}): Promise<SeedResult> {
  const record = buildLeaseRenewalDefinitionRecord({
    ownerUid: options.ownerUid,
    approverUid: options.approverUid,
    sourceLinks: options.sourceLinks,
  });
  assertNoExecutableReferences(record);

  const ref = options.db.collection(PROCESS_DEFINITIONS_COLLECTION).doc(record.id);
  const snapshot = await ref.get();
  if (snapshot.exists && !options.force) {
    return { id: record.id, action: "skipped" };
  }

  const existing = snapshot.data();
  const createdAt =
    snapshot.exists && typeof existing?.created_at === "string"
      ? (existing.created_at as string)
      : options.now;
  await ref.set({ ...record, created_at: createdAt, updated_at: options.now });
  return { id: record.id, action: snapshot.exists ? "updated" : "created" };
}
