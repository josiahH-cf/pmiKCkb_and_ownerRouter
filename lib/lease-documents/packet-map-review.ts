// S268 R-S268-2 (ARCH-S268-2): the shape of the first packet's private map review. Each unresolved
// field or signing decision is recorded by form, page, meaning, approved source, responsible role
// and the exact answer it needs, and the review is bound to the exact original and map it was made
// against. The review itself lives in the existing private proposal outside Git, beside the U1/U2
// holds; this module only checks its shape and says, per family, which items still wait. A
// decision made against other bytes is never an answer for these: a changed original or map holds
// that family's decisions alone. Nothing here approves a map, fills a form or signs anything, and
// no real form value, decision or person belongs in Git. Pure.

import { z } from "zod";

import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import {
  LEASE_ARTIFACT_KINDS,
  type LeaseArtifactKind,
} from "@/lib/lease-documents/packet-types";

const PUBLICATION_REFERENCE = /^publication:[A-Za-z0-9-]{8,80}$/;
const CONTENT_HASH = /^[a-f0-9]{64}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const bounded = (max: number) => z.string().trim().min(1).max(max);

/** What kind of decision an item waits on. */
export const MAP_DECISION_KINDS = [
  "field_meaning",
  "signing",
  "applicability",
  "form_version",
] as const;

export const PacketMapDecisionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    family: z.enum(LEASE_ARTIFACT_KINDS),
    kind: z.enum(MAP_DECISION_KINDS),
    /** The form as the drafter knows it. */
    form: bounded(120),
    /** The 1-based page the item is on. */
    page: z.number().int().min(1).max(40),
    /** What the field or signing area means on that page. */
    meaning: bounded(300),
    /** Where the approved answer has to come from. */
    approvedSource: bounded(200),
    /** Who answers it, by role. */
    responsibleRole: bounded(120),
    /** The exact answer the item needs. */
    expectedAnswer: bounded(300),
    status: z.enum(["pending", "decided"]),
    /** Present only once decided: the answer, who decided, on what authority and when. */
    decision: z
      .object({
        answer: bounded(500),
        decidedByRole: bounded(120),
        authorityRef: bounded(200),
        recordedAt: z.string().datetime(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.status === "decided" && !item.decision)
      ctx.addIssue({
        code: "custom",
        path: ["decision"],
        message: "A decided item names its answer, who decided, the authority and when.",
      });
    if (item.status === "pending" && item.decision)
      ctx.addIssue({
        code: "custom",
        path: ["decision"],
        message: "A pending item carries no decision.",
      });
  });
export type PacketMapDecision = z.infer<typeof PacketMapDecisionSchema>;

export const PacketMapReviewSchema = z
  .object({
    schemaVersion: z.literal("packet-map-review/v1"),
    /** The private reference to the reviewed lease and cycle; never a customer value in Git. */
    caseRef: bounded(120),
    /** The exact originals and maps the review was made against, one per family. */
    originals: z
      .array(
        z
          .object({
            family: z.enum(LEASE_ARTIFACT_KINDS),
            publication: z.string().regex(PUBLICATION_REFERENCE),
            contentHash: z.string().regex(CONTENT_HASH),
            mapVersion: z.string().regex(VERSION).optional(),
            mapHash: z.string().regex(CONTENT_HASH).optional(),
          })
          .strict(),
      )
      .max(LEASE_ARTIFACT_KINDS.length),
    decisions: z.array(PacketMapDecisionSchema).max(200),
  })
  .strict()
  .superRefine((review, ctx) => {
    const families = review.originals.map((original) => original.family);
    if (new Set(families).size !== families.length)
      ctx.addIssue({
        code: "custom",
        path: ["originals"],
        message: "Each family names its reviewed original once.",
      });
    const ids = review.decisions.map((item) => item.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["decisions"],
        message: "Each decision is recorded once.",
      });
    review.decisions.forEach((item, index) => {
      if (!families.includes(item.family))
        ctx.addIssue({
          code: "custom",
          path: ["decisions", index, "family"],
          message: "A decision belongs to a family whose reviewed original is named.",
        });
    });
  });
export type PacketMapReview = z.infer<typeof PacketMapReviewSchema>;

export interface PacketMapReviewFamily {
  readonly family: LeaseArtifactKind;
  /** True while the current original and map are exactly the ones the review was made against. */
  readonly bound: boolean;
  /** Why the review no longer binds this family; null while it does. */
  readonly reason: string | null;
  /** Items still waiting on their answer. A changed original or map returns every item here. */
  readonly pending: readonly PacketMapDecision[];
  /** Items answered with their authority, for exactly this original and map. */
  readonly decided: readonly PacketMapDecision[];
}

/** Per family, which recorded decisions still wait, against the current approved intake. */
export function projectPacketMapReview(
  review: PacketMapReview,
  manifest: ArtifactIntakeManifest,
): PacketMapReviewFamily[] {
  return review.originals.map((original): PacketMapReviewFamily => {
    const current = manifest.entries[original.family];
    const reason = !current?.publication
      ? "This form has no current original."
      : current.publication.reference !== original.publication ||
          current.publication.contentHash !== original.contentHash
        ? "The original changed since the review."
        : (original.mapVersion !== undefined &&
              current.fieldMap?.mapVersion !== original.mapVersion) ||
            (original.mapHash !== undefined && current.mapHash !== original.mapHash)
          ? "The map changed since the review."
          : null;
    const items = review.decisions.filter((item) => item.family === original.family);
    return {
      family: original.family,
      bound: reason === null,
      reason,
      pending:
        reason === null ? items.filter((item) => item.status === "pending") : items,
      decided: reason === null ? items.filter((item) => item.status === "decided") : [],
    };
  });
}

/** One item as the drafter and the person who answers it read it, ready to copy. */
export function mapDecisionLine(item: PacketMapDecision): string {
  return `${item.form}, page ${item.page}: ${item.meaning}. Approved source: ${item.approvedSource}. Who answers: ${item.responsibleRole}. Needs: ${item.expectedAnswer}.`;
}
