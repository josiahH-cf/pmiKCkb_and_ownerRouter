// S201 public data contracts. A collection contains reviewed lease/cycle identities, never a chat.
import { z } from "zod";
export const CollectionLeaseIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
export const CollectionBasisSchema = z
  .object({
    mode: z.enum(["period", "explicit"]),
    origin: z.enum(["worklist", "assistant", "explicit"]),
    dateField: z.enum(["lease_end", "annual_review"]),
    from: z.string().date(),
    through: z.string().date(),
    criteria: z.string().max(4096),
    selectedLeaseIds: z.array(CollectionLeaseIdSchema).max(2000),
  })
  .strict()
  .refine(
    (v) =>
      v.from <= v.through &&
      (Date.parse(v.through) - Date.parse(v.from)) / 86400000 <= 366,
    { message: "Choose an ordered period of at most 367 days." },
  )
  .refine((v) => new Set(v.selectedLeaseIds).size === v.selectedLeaseIds.length, {
    message: "Choose each lease once.",
  });
export const CollectionMemberSchema = z
  .object({
    leaseId: CollectionLeaseIdSchema,
    cycleKey: z.string().min(1).max(160),
    cycleDate: z.string().date().nullable(),
  })
  .strict();
export type CollectionBasis = z.infer<typeof CollectionBasisSchema>;
export type CollectionMember = z.infer<typeof CollectionMemberSchema>;
export interface SharedLeaseCollection {
  schemaVersion: "shared-renewal-collection/v1";
  id: string;
  name: string;
  basis: CollectionBasis;
  members: CollectionMember[];
  version: number;
  createdAt: string;
  createdByUid: string;
  updatedAt: string;
  updatedByUid: string;
  sourceReadAt: string;
}
export interface CollectionStatus {
  member: CollectionMember;
  state: "current" | "cycle_changed" | "unavailable";
  label: string;
  href: string | null;
  lifecycle: string | null;
  workStatus: string | null;
  currentCycle: CollectionMember | null;
}
export interface CollectionSource {
  complete: boolean;
  readAt: string | null;
  issues: string[];
  records: Array<{
    member: CollectionMember;
    label: string;
    href: string;
    lifecycle: string;
    workStatus: string;
  }>;
  matches: (basis: CollectionBasis) => readonly string[];
}
export interface CollectionReview {
  id: string;
  collectionId: string;
  expectedVersion: number;
  name: string;
  basis: CollectionBasis;
  members: CollectionMember[];
  added: CollectionMember[];
  removed: CollectionMember[];
  sourceReadAt: string;
  createdAt: string;
  expiresAt: string;
}
export const CollectionPrepareSchema = z
  .object({
    action: z.literal("review"),
    collectionId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(160),
    basis: CollectionBasisSchema,
    reviewId: z.string().uuid(),
  })
  .strict();
export const CollectionConfirmSchema = z
  .object({
    action: z.literal("save"),
    reviewId: z.string().uuid(),
    operationId: z.string().uuid(),
  })
  .strict();
export const CollectionRenameSchema = z
  .object({
    action: z.literal("rename"),
    collectionId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    operationId: z.string().uuid(),
  })
  .strict();
export const CollectionMutationSchema = z.discriminatedUnion("action", [
  CollectionPrepareSchema,
  CollectionConfirmSchema,
  CollectionRenameSchema,
]);
export function collectionMemberIdentity(member: CollectionMember) {
  return `${member.leaseId}:${member.cycleKey}`;
}
export function collectionDifference(
  before: readonly CollectionMember[],
  after: readonly CollectionMember[],
) {
  const a = new Set(before.map(collectionMemberIdentity)),
    b = new Set(after.map(collectionMemberIdentity));
  return {
    added: after.filter((m) => !a.has(collectionMemberIdentity(m))),
    removed: before.filter((m) => !b.has(collectionMemberIdentity(m))),
  };
}
export function projectCollectionStatuses(
  collection: SharedLeaseCollection,
  source: CollectionSource,
): CollectionStatus[] {
  const byId = new Map(source.records.map((r) => [r.member.leaseId, r]));
  return collection.members.map((member) => {
    const current = byId.get(member.leaseId);
    if (!current)
      return {
        member,
        state: "unavailable",
        label: "Stored member unavailable in this source read",
        href: null,
        lifecycle: null,
        workStatus: null,
        currentCycle: null,
      };
    return {
      member,
      state: current.member.cycleKey === member.cycleKey ? "current" : "cycle_changed",
      label: current.label,
      href: current.href,
      lifecycle: current.lifecycle,
      workStatus: current.workStatus,
      currentCycle: current.member,
    };
  });
}
export function sharedCollectionEntryHref(
  ids: readonly string[],
  origin: "assistant" | "worklist",
  criteria = "",
) {
  return `/lease-renewal/collections?${new URLSearchParams({ members: [...new Set(ids)].join(","), origin, ...(criteria ? { criteria } : {}) })}`;
}
