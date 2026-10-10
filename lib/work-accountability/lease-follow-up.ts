import { z } from "zod";
import { parseCalendarDate } from "@/lib/date-display";
export const LEASE_FOLLOW_UP_KINDS = ["pet", "insurance", "rhino", "other"] as const;
export const LEASE_FOLLOW_UP_LABELS = {
  pet: "Pet follow-up",
  insurance: "Insurance follow-up",
  rhino: "Rhino follow-up",
  other: "Other lease follow-up",
} as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const opaque = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const sourceId = z.string().regex(/^[1-9]\d{0,14}$/);
const cycle = z
  .string()
  .refine(
    (value) =>
      /^recorded_cycle:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      ) ||
      (/^(lease_end|review_date):\d{4}-\d{2}-\d{2}$/.test(value) &&
        parseCalendarDate(value.split(":")[1]) !== null),
    "A current source or recorded cycle is required.",
  );
const supportingReference = z
  .object({
    label: text(120),
    url: z
      .string()
      .url()
      .max(2048)
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }, "Use a supported HTTPS reference."),
  })
  .strict();
export const LeaseFollowUpInputSchema = z
  .object({
    lease_id: sourceId,
    expected_cycle_key: cycle,
    kind: z.enum(LEASE_FOLLOW_UP_KINDS),
    title: text(160),
    next_action: text(240),
    assignee_uid: opaque.optional(),
    due_at: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).default(""),
    supporting_references: z.array(supportingReference).max(5).default([]),
    distinct_reason: text(500).optional(),
    idempotency_key: opaque,
  })
  .strict();
export type CreateLeaseFollowUpInput = z.input<typeof LeaseFollowUpInputSchema>;
export interface FollowUpPolicyContext {
  product: "rhino";
  material_state: "approved" | "none" | "pending_only" | "ambiguous" | "unreadable";
  reference: string | null;
  version: string | null;
  publication_reference: string | null;
  content_hash: string | null;
  read_at: string;
  applicability: "unverified";
}
export interface LeaseFollowUpOrigin {
  schema_version: "lease-follow-up/v1";
  lease_id: string;
  cycle_key: string;
  cycle_label: string;
  recorded_cycle_id: string | null;
  kind: (typeof LEASE_FOLLOW_UP_KINDS)[number];
  notes: string;
  supporting_references: Array<{ label: string; url: string }>;
  distinct_reason?: string;
  match_key: string;
  policy_context?: FollowUpPolicyContext | null;
}
export const leaseFollowUpCycleLabel = (key: string) =>
  key.startsWith("recorded_cycle:")
    ? "Recorded lease-bound cycle (date not established)"
    : `${key.startsWith("lease_end:") ? "Lease end" : "Annual review"} ${key.split(":")[1]}`;
