import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  getCurrentPacketSnapshot,
  savePacketSnapshot,
} from "@/lib/firestore/lease-document-packet-snapshots";
import { resolveLivePacketInput } from "@/lib/lease-documents/live-input";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import type { PacketEvaluationInput } from "@/lib/lease-documents/packet-types";

const PacketIdentitySchema = z
  .object({
    leaseId: z.string().trim().min(1).max(120),
    transactionId: z.string().trim().min(1).max(120),
  })
  .strict();

const EvaluatePacketSchema = PacketIdentitySchema.extend({
  action: z.literal("evaluate"),
  expectedCurrentSnapshotId: z.string().trim().min(1).max(160).nullable(),
}).strict();

export interface PacketTruthRouteDeps {
  requireCapabilityInSpace: typeof requireCapabilityInSpace;
  getCurrent: typeof getCurrentPacketSnapshot;
  save: typeof savePacketSnapshot;
  nowIso: () => string;
  resolveInput: (
    leaseId: string,
    transactionId: string,
    observedAt: string,
    actor?: AuthenticatedUser,
  ) => Promise<PacketEvaluationInput>;
}

/** Normal evaluation resolves current private mappings and S21 publications; a URL or browser assertion cannot provide legal content. */
async function resolveCurrentInput(
  leaseId: string,
  transactionId: string,
  observedAt: string,
  actor?: AuthenticatedUser,
): Promise<PacketEvaluationInput> {
  if (!actor) throw new Error("Authenticated packet resolver context is required.");
  return (await resolveLivePacketInput(actor, leaseId, transactionId, observedAt)).input;
}

const DEFAULT_DEPS: PacketTruthRouteDeps = {
  requireCapabilityInSpace,
  getCurrent: getCurrentPacketSnapshot,
  save: savePacketSnapshot,
  nowIso: () => new Date().toISOString(),
  resolveInput: resolveCurrentInput,
};

export async function GET(request: Request) {
  return createPacketTruthGetHandler()(request);
}

export async function POST(request: Request) {
  return createPacketTruthPostHandler()(request);
}

export function createPacketTruthGetHandler(
  overrides: Partial<PacketTruthRouteDeps> = {},
) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  return async function handlePacketTruthGet(request: Request) {
    try {
      const user = await deps.requireCapabilityInSpace(
        renewalRoleCapability("read_workspace"),
        "renewals",
      );
      const url = new URL(request.url);
      const identity = PacketIdentitySchema.parse({
        leaseId: url.searchParams.get("leaseId"),
        transactionId: url.searchParams.get("transactionId"),
      });
      const snapshot = await deps.getCurrent(
        user,
        identity.leaseId,
        identity.transactionId,
      );
      return NextResponse.json({ snapshot });
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}

export function createPacketTruthPostHandler(
  overrides: Partial<PacketTruthRouteDeps> = {},
) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  return async function handlePacketTruthPost(request: Request) {
    try {
      // Capability + Space refusal happens before catalog resolution, persistence, or any future
      // connector construction.
      const user = await deps.requireCapabilityInSpace(
        renewalRoleCapability("save_packet_truth"),
        "renewals",
      );
      if (isVerificationAccount(user))
        throw new EditableLayerError(
          "Verification accounts cannot save packet evaluations.",
          403,
        );
      assertMutationAllowed(requireEnvironmentDescriptor());
      const body = await parseJsonBody(request, EvaluatePacketSchema);
      const observedAt = deps.nowIso();
      const input = await deps.resolveInput(
        body.leaseId,
        body.transactionId,
        observedAt,
        user,
      );
      const evaluation = evaluateRenewalPacket(input);
      const snapshot = await deps.save(user, {
        evaluation,
        expectedCurrentSnapshotId: body.expectedCurrentSnapshotId,
        nowIso: observedAt,
      });
      return NextResponse.json({ snapshot });
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
