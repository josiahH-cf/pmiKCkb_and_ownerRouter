import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/editable";
import {
  authErrorResponse,
  requireCapabilityInSpace,
  type AuthenticatedUser,
} from "@/lib/auth/session";
import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";
import { buildLiveVendorLifecycleServiceDeps } from "@/lib/vendor/live-lifecycle-runtime";
import {
  assertExplicitProductionLive,
  executeLiveVendorLifecycle,
  INTENTIONALLY_CLOSED_VENDOR_GMAIL_ACTION_KEYS,
  LiveVendorLifecycleError,
  prepareLiveVendorLifecycle,
  reconcileLiveVendorLifecycle,
  type LiveVendorLifecycleActionKey,
  type LiveVendorLifecycleServiceDeps,
} from "@/lib/vendor/live-lifecycle-service";

const boundedId = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\/\u0000-\u001f\u007f]/u.test(value), {
    message: "Must be one Firestore-safe document id segment.",
  });
const reason = z.string().trim().min(3).max(500);
const executionId = z.string().regex(/^exec_[a-f0-9]{40}$/);
const previewHash = z.string().regex(/^[a-f0-9]{64}$/);
const MAX_REQUEST_BYTES = 32 * 1024;

const InvitePrepareSchema = z
  .object({
    actionKey: z.literal("vendor.account.invite"),
    company: z.string().trim().min(1).max(160),
    email: z.email().trim().toLowerCase().max(320),
    operation: z.literal("prepare"),
    reason,
    ticketId: boundedId,
  })
  .strict();

const InviteExecuteSchema = InvitePrepareSchema.omit({ operation: true })
  .extend({
    confirmedPreviewHash: previewHash,
    executionId,
    operation: z.literal("execute"),
  })
  .strict();

const InviteReconcileSchema = InvitePrepareSchema.omit({ operation: true })
  .extend({
    executionId,
    operation: z.literal("reconcile"),
  })
  .strict();

const AssignmentPrepareSchema = z
  .object({
    actionKey: z.literal("vendor.assignment.change"),
    assignmentOperation: z.enum(["assign", "remove"]),
    operation: z.literal("prepare"),
    reason,
    ticketId: boundedId,
    vendorId: boundedId,
  })
  .strict();

const AssignmentExecuteSchema = AssignmentPrepareSchema.omit({ operation: true })
  .extend({
    confirmedPreviewHash: previewHash,
    executionId,
    operation: z.literal("execute"),
  })
  .strict();

const AssignmentReconcileSchema = AssignmentPrepareSchema.omit({
  operation: true,
})
  .extend({
    executionId,
    operation: z.literal("reconcile"),
  })
  .strict();

const DisablePrepareSchema = z
  .object({
    actionKey: z.literal("vendor.account.disable"),
    operation: z.literal("prepare"),
    reason,
    vendorId: boundedId,
  })
  .strict();

const DisableExecuteSchema = DisablePrepareSchema.omit({ operation: true })
  .extend({
    confirmedPreviewHash: previewHash,
    executionId,
    operation: z.literal("execute"),
  })
  .strict();

const DisableReconcileSchema = DisablePrepareSchema.omit({ operation: true })
  .extend({
    executionId,
    operation: z.literal("reconcile"),
  })
  .strict();

const IntentionallyClosedGmailSchema = z
  .object({
    actionKey: z.enum(INTENTIONALLY_CLOSED_VENDOR_GMAIL_ACTION_KEYS),
    operation: z.enum(["prepare", "execute", "reconcile"]),
  })
  .strict();

export const LiveVendorLifecycleBodySchema = z.union([
  InvitePrepareSchema,
  InviteExecuteSchema,
  InviteReconcileSchema,
  AssignmentPrepareSchema,
  AssignmentExecuteSchema,
  AssignmentReconcileSchema,
  DisablePrepareSchema,
  DisableExecuteSchema,
  DisableReconcileSchema,
  IntentionallyClosedGmailSchema,
]);

export interface LiveVendorLifecycleRouteDeps {
  readonly assertRuntimeExecutable: (
    actionKey: LiveVendorLifecycleActionKey,
  ) => Promise<void>;
  readonly authenticate: () => Promise<AuthenticatedUser>;
  readonly buildServiceDeps: () => LiveVendorLifecycleServiceDeps;
  readonly execute: typeof executeLiveVendorLifecycle;
  readonly prepare: typeof prepareLiveVendorLifecycle;
  readonly reconcile: typeof reconcileLiveVendorLifecycle;
  readonly resolveDescriptor: () => EnvironmentDescriptor;
}

const DEFAULT_DEPS: LiveVendorLifecycleRouteDeps = {
  assertRuntimeExecutable: assertProductionRuntimeActionExecutable,
  authenticate: () => requireCapabilityInSpace("manageAdmin", "maintenance"),
  buildServiceDeps: buildLiveVendorLifecycleServiceDeps,
  execute: executeLiveVendorLifecycle,
  prepare: prepareLiveVendorLifecycle,
  reconcile: reconcileLiveVendorLifecycle,
  resolveDescriptor: requireEnvironmentDescriptor,
};

export function createLiveVendorLifecyclePostHandler(
  overrides: Partial<LiveVendorLifecycleRouteDeps> = {},
) {
  const deps = { ...DEFAULT_DEPS, ...overrides };

  return async function POST(request: Request) {
    let actor: AuthenticatedUser;
    try {
      actor = await deps.authenticate();
    } catch (error) {
      return authErrorResponse(error);
    }

    try {
      const descriptor = deps.resolveDescriptor();
      assertExplicitProductionLive(descriptor);
      const body = await parseBoundedLifecycleBody(request);

      if (isIntentionallyClosedGmailBody(body)) {
        return NextResponse.json(
          {
            code: "vendor_gmail_lifecycle_intentionally_closed",
            error:
              "Vendor Gmail lifecycle actions are intentionally unavailable from this Admin route.",
          },
          { status: 409 },
        );
      }

      // Reconciliation remains reachable after a gate closes so an ambiguous consumed
      // attempt cannot be stranded. Prepare and execute both fail before runtime assembly.
      if (body.operation !== "reconcile") {
        await deps.assertRuntimeExecutable(body.actionKey);
      }

      const serviceDeps = deps.buildServiceDeps();
      const context = { descriptor };
      const outcome =
        body.operation === "prepare"
          ? await deps.prepare(actor, body, serviceDeps, context)
          : body.operation === "execute"
            ? await deps.execute(actor, body, serviceDeps, context)
            : await deps.reconcile(actor, body, serviceDeps, context);

      return NextResponse.json(outcome);
    } catch (error) {
      return liveVendorLifecycleErrorResponse(error);
    }
  };
}

export const POST = createLiveVendorLifecyclePostHandler();

function isIntentionallyClosedGmailBody(
  body: z.infer<typeof LiveVendorLifecycleBodySchema>,
): body is z.infer<typeof IntentionallyClosedGmailSchema> {
  return (INTENTIONALLY_CLOSED_VENDOR_GMAIL_ACTION_KEYS as readonly string[]).includes(
    body.actionKey,
  );
}

function liveVendorLifecycleErrorResponse(error: unknown) {
  if (error instanceof LiveVendorLifecycleError) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { status: error.status },
    );
  }
  if (
    error instanceof ActionNotExecutableError ||
    error instanceof ActionRuntimeSuspendedError
  ) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof EnvironmentContextError) {
    return NextResponse.json(
      { code: "environment_context_refused", error: error.message },
      { status: 409 },
    );
  }
  if (error instanceof EditableLayerError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return apiErrorResponse(error);
}

async function parseBoundedLifecycleBody(request: Request) {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new LiveVendorLifecycleError(
      "Live Vendor lifecycle requests require Content-Type: application/json.",
      415,
      "vendor_lifecycle_content_type_required",
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new LiveVendorLifecycleError(
      "The Live Vendor lifecycle request body is too large.",
      413,
      "vendor_lifecycle_body_too_large",
    );
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new LiveVendorLifecycleError(
      "The Live Vendor lifecycle request body is too large.",
      413,
      "vendor_lifecycle_body_too_large",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new LiveVendorLifecycleError(
      "Invalid JSON request body.",
      400,
      "vendor_lifecycle_invalid_json",
    );
  }
  const parsed = LiveVendorLifecycleBodySchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    throw new LiveVendorLifecycleError(
      `Invalid request body: ${issues.join("; ")}`,
      400,
      "vendor_lifecycle_invalid_body",
    );
  }
  return parsed.data;
}
