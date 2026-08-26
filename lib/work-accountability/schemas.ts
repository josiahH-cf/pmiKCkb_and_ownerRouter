import { z } from "zod";

import { WORK_SOURCE_TYPES, WORK_TASK_STATES } from "@/lib/work-accountability/types";

const opaqueId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const shortText = (maximum: number) => z.string().trim().min(1).max(maximum);
const isoDateTime = z.string().datetime({ offset: true });
const positiveVersion = z.number().int().positive();
const idempotencyKey = opaqueId;

const CreateTaskSchema = z
  .object({
    action: z.literal("create_task"),
    space_id: opaqueId,
    source: z
      .object({
        type: z.enum(WORK_SOURCE_TYPES),
        id: opaqueId.optional(),
      })
      .strict(),
    task_type: shortText(100),
    title: shortText(160),
    assignee_uid: opaqueId.optional(),
    next_action: shortText(240),
    work_location: shortText(240).optional(),
    materials_needed: shortText(1000).optional(),
    materials_purchased: shortText(1000).optional(),
    due_at: isoDateTime.optional(),
    expectation_key: shortText(160).optional(),
    idempotency_key: idempotencyKey,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source.type === "manual" && value.source.id !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["source", "id"],
        message: "Manual work has no linked source id.",
      });
    }
    if (value.source.type !== "manual" && value.source.id === undefined) {
      context.addIssue({
        code: "custom",
        path: ["source", "id"],
        message: "Linked work requires a source id.",
      });
    }
  });

const DeriveTaskSchema = z
  .object({
    action: z.literal("derive_task"),
    mapping_key: shortText(160),
    source_id: opaqueId,
    idempotency_key: idempotencyKey,
  })
  .strict();

const StartSessionSchema = z
  .object({
    action: z.literal("start_session"),
    task_id: opaqueId,
    expected_task_version: positiveVersion,
    idempotency_key: idempotencyKey,
  })
  .strict();

const HeartbeatSchema = z
  .object({
    action: z.literal("heartbeat"),
    session_id: opaqueId,
    expected_version: positiveVersion,
  })
  .strict();

const ReconcileSchema = z.object({ action: z.literal("reconcile") }).strict();
const ReconcileTeamSchema = z
  .object({
    action: z.literal("reconcile_team"),
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict();

const TransitionTaskSchema = z
  .object({
    action: z.literal("transition_task"),
    task_id: opaqueId,
    expected_version: positiveVersion,
    next_state: z.enum(WORK_TASK_STATES),
    reason: shortText(500).optional(),
    outcome_note: shortText(500).optional(),
    idempotency_key: idempotencyKey,
  })
  .strict();

const ReassignTaskSchema = z
  .object({
    action: z.literal("reassign_task"),
    task_id: opaqueId,
    expected_version: positiveVersion,
    assignee_uid: opaqueId,
    reason: shortText(500),
    idempotency_key: idempotencyKey,
  })
  .strict();

const CorrectSessionSchema = z
  .object({
    action: z.literal("correct_session"),
    session_id: opaqueId,
    expected_version: positiveVersion,
    effective_start_at: isoDateTime,
    effective_end_at: isoDateTime,
    task_id: opaqueId.optional(),
    reason: shortText(500),
    idempotency_key: idempotencyKey,
  })
  .strict();

const CreateExpectationSchema = z
  .object({
    action: z.literal("create_expectation"),
    expectation_key: shortText(160),
    task_type: shortText(100),
    space_id: opaqueId.optional(),
    minimum_minutes: z.number().int().positive(),
    maximum_minutes: z.number().int().positive(),
    rationale: shortText(500),
    idempotency_key: idempotencyKey,
  })
  .strict();

const RebaseExpectationSchema = z
  .object({
    action: z.literal("rebase_expectation"),
    task_id: opaqueId,
    expectation_key: shortText(160),
    expected_task_version: positiveVersion,
    reason: shortText(500),
    idempotency_key: idempotencyKey,
  })
  .strict();

const CreateMappingSchema = z
  .object({
    action: z.literal("create_mapping"),
    mapping_key: shortText(160),
    source_type: z.enum([
      "workflow_run",
      "renewal_lease",
      "maintenance_ticket",
      "approval_item",
    ]),
    actionable_unit: shortText(160),
    task_type: shortText(100),
    title: shortText(160),
    next_action: shortText(240),
    space_id: opaqueId.optional(),
    assignee_uid: opaqueId.optional(),
    rationale: shortText(500),
    idempotency_key: idempotencyKey,
  })
  .strict();

export const WorkMutationSchema = z.discriminatedUnion("action", [
  CreateTaskSchema,
  DeriveTaskSchema,
  StartSessionSchema,
  HeartbeatSchema,
  ReconcileSchema,
  ReconcileTeamSchema,
  TransitionTaskSchema,
  ReassignTaskSchema,
  CorrectSessionSchema,
  CreateExpectationSchema,
  RebaseExpectationSchema,
  CreateMappingSchema,
]);

export const WorkRetentionCandidateSchema = z
  .object({
    queue_id: opaqueId,
    target_collection: opaqueId,
    target_id: opaqueId,
    expires_at: isoDateTime,
    anchor_kind: z.enum(["record_time", "task_terminal"]),
    governing_task_id: opaqueId.optional(),
  })
  .strict();

export const WorkRetentionExecutionSchema = z
  .object({
    plan: z
      .object({
        as_of: isoDateTime,
        limit: z.number().int().min(1).max(250),
        candidates: z.array(WorkRetentionCandidateSchema).max(250),
        plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    confirmation_hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type WorkMutationInput = z.infer<typeof WorkMutationSchema>;
