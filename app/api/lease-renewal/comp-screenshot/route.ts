import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  authErrorResponse,
  requireCapabilityInSpace,
  type AuthenticatedUser,
} from "@/lib/auth/session";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
import {
  getRenewalCompScreenshotActionView,
  renewalCompScreenshotClosedResponse,
} from "@/lib/lease-renewal/comp-screenshot-action";
import { COMP_SCREENSHOT_MAX_BYTES } from "@/lib/lease-renewal/comp-screenshot-contract";
import { buildLiveCompScreenshotRuntime } from "@/lib/lease-renewal/comp-screenshot-runtime";
import {
  assertCompScreenshotExecutionAllowed,
  assertCompScreenshotRecoverySetup,
  commitCompScreenshot,
  compScreenshotErrorResponse,
  getCompScreenshotStatus,
  getCompScreenshotStatusForLease,
  previewCompScreenshot,
  reconcileCompScreenshot,
  resumeCompScreenshot,
  type CompScreenshotExecutionContext,
  type CompScreenshotServiceDeps,
} from "@/lib/lease-renewal/comp-screenshot-service";

const MAX_BASE64_CHARACTERS = Math.ceil(COMP_SCREENSHOT_MAX_BYTES / 3) * 4;
const MAX_REQUEST_BYTES = MAX_BASE64_CHARACTERS + 65_536;

const StoreScreenshotBodySchema = z
  .object({
    operation: z.literal("store"),
    // false issues an immutable preview; true requires and consumes that exact preview.
    confirm: z.boolean(),
    leaseId: z.string().trim().min(1).max(120),
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(100),
    base64: z.string().min(1).max(MAX_BASE64_CHARACTERS),
    executionId: z.string().min(1).max(120).optional(),
    previewHash: z.string().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.confirm && (!value.executionId || !value.previewHash)) {
      ctx.addIssue({
        code: "custom",
        message: "A confirmed upload requires the exact executionId and previewHash.",
      });
    }
    if (!value.confirm && (value.executionId || value.previewHash)) {
      ctx.addIssue({
        code: "custom",
        message: "A new preview cannot supply prior execution identifiers.",
      });
    }
  });

const ResumeScreenshotBodySchema = z
  .object({
    operation: z.literal("resume"),
    leaseId: z.string().trim().min(1).max(120),
    executionId: z
      .string()
      .regex(/^comp_store_[a-f0-9]{48}$/)
      .max(120),
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(100),
    base64: z.string().min(1).max(MAX_BASE64_CHARACTERS),
  })
  .strict();

const CompScreenshotPostBodySchema = z.union([
  StoreScreenshotBodySchema,
  ResumeScreenshotBodySchema,
]);

const StatusQuerySchema = z
  .object({
    executionId: z
      .string()
      .regex(/^comp_store_[a-f0-9]{48}$/)
      .max(120)
      .optional(),
    leaseId: z.string().trim().min(1).max(120).optional(),
    operation: z.enum(["status", "reconcile"]).default("status"),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.executionId) === Boolean(value.leaseId)) {
      ctx.addIssue({
        code: "custom",
        message: "Supply exactly one executionId or leaseId.",
      });
    }
    if (value.operation === "reconcile" && !value.executionId) {
      ctx.addIssue({
        code: "custom",
        message: "Reconcile requires an executionId.",
      });
    }
  });

export interface RenewalCompScreenshotRouteDeps {
  authenticate: () => Promise<AuthenticatedUser>;
  actionExecutable: () => boolean;
  buildRuntime: () => {
    deps: CompScreenshotServiceDeps;
    context: CompScreenshotExecutionContext;
  };
}

const DEFAULT_DEPS: RenewalCompScreenshotRouteDeps = {
  authenticate: () => requireCapabilityInSpace("edit", "renewals"),
  actionExecutable: () => getRenewalCompScreenshotActionView().executable,
  buildRuntime: buildLiveCompScreenshotRuntime,
};

/**
 * The handler factory is an offline test seam. Production uses the committed gate and Firestore/Drive
 * runtime below; tests may inject a fake-open registry and provider without editing governance state.
 */
export function createRenewalCompScreenshotRouteHandlers(
  overrides: Partial<RenewalCompScreenshotRouteDeps> = {},
) {
  const routeDeps = { ...DEFAULT_DEPS, ...overrides };

  return {
    async POST(request: Request) {
      let actor: AuthenticatedUser;
      try {
        actor = await routeDeps.authenticate();
      } catch (error) {
        return authErrorResponse(error);
      }

      // Preserve the defense-in-depth refusal order: auth, committed named action gate, explicit
      // environment/setup, request body, durable claim, and only then lazy Drive construction.
      if (!routeDeps.actionExecutable()) {
        return NextResponse.json(renewalCompScreenshotClosedResponse(), {
          status: 409,
        });
      }

      try {
        const runtime = routeDeps.buildRuntime();
        assertCompScreenshotExecutionAllowed(runtime.context, "recovery");
        assertCompScreenshotRecoverySetup(runtime.deps);

        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
          return NextResponse.json(
            {
              action_key: "google_drive.renewal_comp_screenshot.store",
              error: "Screenshot payload too large.",
              error_type: "invalid_file",
            },
            { status: 413 },
          );
        }
        const body = await parseJsonBody(request, CompScreenshotPostBodySchema);
        const outcome =
          body.operation === "resume"
            ? await resumeCompScreenshot(
                actor,
                {
                  leaseId: body.leaseId,
                  executionId: body.executionId,
                  filename: body.filename,
                  mimeType: body.mimeType,
                  base64: body.base64,
                },
                runtime.deps,
                runtime.context,
              )
            : body.confirm
              ? await commitCompScreenshot(
                  actor,
                  {
                    leaseId: body.leaseId,
                    filename: body.filename,
                    mimeType: body.mimeType,
                    base64: body.base64,
                    executionId: body.executionId!,
                    previewHash: body.previewHash!,
                  },
                  runtime.deps,
                  runtime.context,
                )
              : await previewCompScreenshot(
                  actor,
                  {
                    leaseId: body.leaseId,
                    filename: body.filename,
                    mimeType: body.mimeType,
                    base64: body.base64,
                  },
                  runtime.deps,
                  runtime.context,
                );
        return NextResponse.json(outcome);
      } catch (error) {
        return routeErrorResponse(error);
      }
    },

    async GET(request: Request) {
      try {
        await routeDeps.authenticate();
      } catch (error) {
        return authErrorResponse(error);
      }

      try {
        const url = new URL(request.url);
        const parsed = StatusQuerySchema.safeParse({
          executionId: url.searchParams.get("executionId") ?? undefined,
          leaseId: url.searchParams.get("leaseId") ?? undefined,
          operation: url.searchParams.get("operation") ?? "status",
        });
        if (!parsed.success) {
          return NextResponse.json(
            {
              action_key: "google_drive.renewal_comp_screenshot.store",
              error: "A valid screenshot execution id is required.",
              error_type: "invalid_request",
            },
            { status: 400 },
          );
        }
        const runtime = routeDeps.buildRuntime();
        const outcome = parsed.data.leaseId
          ? await getCompScreenshotStatusForLease(
              parsed.data.leaseId,
              runtime.deps,
              runtime.context,
            )
          : parsed.data.operation === "reconcile"
            ? await reconcileCompScreenshot(
                parsed.data.executionId!,
                runtime.deps,
                runtime.context,
              )
            : await getCompScreenshotStatus(
                parsed.data.executionId!,
                runtime.deps,
                runtime.context,
              );
        return NextResponse.json(outcome);
      } catch (error) {
        return routeErrorResponse(error);
      }
    },
  };
}

function routeErrorResponse(error: unknown) {
  if (error instanceof ActionNotExecutableError) {
    return NextResponse.json(renewalCompScreenshotClosedResponse(), {
      status: error.status,
    });
  }
  const contract = compScreenshotErrorResponse(error);
  if (contract) {
    return NextResponse.json(contract.body, { status: contract.status });
  }
  return apiErrorResponse(error);
}

export const { POST, GET } = createRenewalCompScreenshotRouteHandlers();
