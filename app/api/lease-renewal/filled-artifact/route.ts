import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  approveDerivedArtifact,
  prepareDerivedArtifact,
  readDerivedArtifactContent,
  readDerivedArtifactStatus,
  readHistoricalDerivedArtifactContent,
  listDerivedArtifactHistory,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  ApproveDerivedArtifactSchema,
  DerivedArtifactRequestSchema,
  PrepareDerivedArtifactSchema,
} from "@/lib/lease-documents/derived-artifact-contract";

const Query = z.union([
  DerivedArtifactRequestSchema.extend({
    derivedId: z.string().min(1).max(100).optional(),
  }).strict(),
  DerivedArtifactRequestSchema.extend({
    derivedId: z.string().min(1).max(100),
    historical: z.literal("true"),
    original: z.literal("true").optional(),
  }).strict(),
  z
    .object({ leaseId: z.string().regex(/^[1-9]\d*$/), history: z.literal("true") })
    .strict(),
]);
const Body = z.discriminatedUnion("action", [
  PrepareDerivedArtifactSchema,
  ApproveDerivedArtifactSchema,
]);
const defaults = {
  requireCapabilityInSpace,
  prepare: prepareDerivedArtifact,
  approve: approveDerivedArtifact,
  read: readDerivedArtifactStatus,
  content: readDerivedArtifactContent,
  historicalContent: readHistoricalDerivedArtifactContent,
  history: listDerivedArtifactHistory,
};
export function createFilledArtifactHandlers(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  return {
    GET: async (request: Request) => {
      try {
        const actor = await deps.requireCapabilityInSpace(
          renewalRoleCapability("read_workspace"),
          "renewals",
        );
        const query = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
        if ("history" in query)
          return NextResponse.json(await deps.history(actor, query.leaseId), {
            headers: { "Cache-Control": "private, no-store" },
          });
        if (query.derivedId) {
          const { file, record } =
            "historical" in query
              ? await deps.historicalContent(actor, query).then((result) => ({
                  file: query.original ? result.original : result,
                  record: result.record,
                }))
              : await deps
                  .content(actor, {
                    ...query,
                    derivedId: query.derivedId,
                  })
                  .then((result) => ({ file: result, record: result.record }));
          return new Response(new Uint8Array(file.content), {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "X-Artifact-SHA256":
                "original" in query ? record.originalHash : record.outputHash,
            },
          });
        }
        return NextResponse.json(
          {
            ...(await deps.read(actor, query)),
            canPrepare: can(actor.role, "edit") && !isVerificationAccount(actor),
            canApprove:
              can(actor.role, renewalRoleCapability("approve_filled_artifact")) &&
              !isVerificationAccount(actor),
          },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      } catch (error) {
        return apiErrorResponse(error);
      }
    },
    POST: async (request: Request) => {
      try {
        const input = await parseJsonBody(request, Body);
        const actor = await deps.requireCapabilityInSpace(
          input.action === "prepare"
            ? renewalRoleCapability("prepare_filled_artifact")
            : renewalRoleCapability("approve_filled_artifact"),
          "renewals",
        );
        const record =
          input.action === "prepare"
            ? await deps.prepare(actor, input)
            : await deps.approve(actor, input);
        return NextResponse.json(
          { record },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      } catch (error) {
        return apiErrorResponse(error);
      }
    },
  };
}
export async function GET(request: Request) {
  return createFilledArtifactHandlers().GET(request);
}
export async function POST(request: Request) {
  return createFilledArtifactHandlers().POST(request);
}
