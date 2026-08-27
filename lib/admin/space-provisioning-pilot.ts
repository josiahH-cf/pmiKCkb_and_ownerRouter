import { createHash } from "node:crypto";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  SPACE_PROVISION_CONFIRMATION,
  SPACE_RETIRE_CONFIRMATION,
} from "@/lib/admin/space-provisioning-contract";
import type { SpaceProvisioningPlan } from "@/lib/admin/space-request-commands";
import { EditableLayerError } from "@/lib/firestore/errors";

export {
  SPACE_PROVISION_CONFIRMATION,
  SPACE_RETIRE_CONFIRMATION,
} from "@/lib/admin/space-provisioning-contract";

export const SpaceProvisioningPilotPacketSchema = z
  .object({
    requestId: z.string().uuid(),
    confirmedSpaceId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    sourceObjectUri: z.string().trim().max(1_000),
    approvalEvidenceRef: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .refine((value) => !/[\r\n<>]/.test(value)),
  })
  .strict();

export type SpaceProvisioningPilotPacket = z.infer<
  typeof SpaceProvisioningPilotPacketSchema
>;

export interface AuthorizedSpaceProvisioningPreview {
  plan: SpaceProvisioningPlan;
  requestId: string;
  sourceObjectUri: string;
  approvalEvidenceRef: string;
  previewHash: string;
}

/** Exact official-provider boundary; concrete adapters may only implement this fixed data-store plan. */
export interface FixedSpaceProvisioningProvider {
  listDataStoreIds(preview: AuthorizedSpaceProvisioningPreview): Promise<string[]>;
  readDataStore(
    preview: AuthorizedSpaceProvisioningPreview,
  ): Promise<{ id: string; displayName: string } | null>;
  provisionDataStoreAndImportSource(
    preview: AuthorizedSpaceProvisioningPreview,
  ): Promise<{ providerOperationRef: string }>;
  retireDataStore(
    preview: AuthorizedSpaceProvisioningPreview,
  ): Promise<{ providerOperationRef: string }>;
}

export interface SpaceProvisioningReceipt {
  id: string;
  operation: "provision" | "retire";
  attemptKey: string;
  previewHash: string;
  spaceId: string;
  dataStoreId: string;
  sourcePrefix: string;
  providerOperationRef: string;
  protectedDataStoreIds: string[];
  actorUid: string;
  createdAt: string;
  duplicate: boolean;
}

export interface SpaceProvisioningLedger {
  claim(input: {
    attemptKey: string;
    operation: "provision" | "retire";
    previewHash: string;
  }): Promise<
    | { status: "claimed" }
    | { status: "completed"; receipt: SpaceProvisioningReceipt }
    | { status: "in_progress" | "needs_attention" }
  >;
  complete(receipt: SpaceProvisioningReceipt): Promise<void>;
  needsAttention(input: {
    attemptKey: string;
    operation: "provision" | "retire";
    previewHash: string;
  }): Promise<void>;
}

export class MemorySpaceProvisioningLedger implements SpaceProvisioningLedger {
  readonly attempts = new Map<
    string,
    {
      operation: "provision" | "retire";
      previewHash: string;
      state: "claimed" | "completed" | "needs_attention";
      receipt?: SpaceProvisioningReceipt;
    }
  >();

  async claim(input: {
    attemptKey: string;
    operation: "provision" | "retire";
    previewHash: string;
  }): ReturnType<SpaceProvisioningLedger["claim"]> {
    const existing = this.attempts.get(input.attemptKey);
    if (existing) {
      if (
        existing.operation !== input.operation ||
        existing.previewHash !== input.previewHash
      ) {
        throw new EditableLayerError(
          "Space provisioning attempt key belongs to another exact preview.",
          409,
        );
      }
      if (existing.state === "completed" && existing.receipt) {
        return { status: "completed" as const, receipt: existing.receipt };
      }
      return {
        status:
          existing.state === "claimed"
            ? ("in_progress" as const)
            : ("needs_attention" as const),
      };
    }
    this.attempts.set(input.attemptKey, {
      operation: input.operation,
      previewHash: input.previewHash,
      state: "claimed",
    });
    return { status: "claimed" as const };
  }

  async complete(receipt: SpaceProvisioningReceipt) {
    this.attempts.set(receipt.attemptKey, {
      operation: receipt.operation,
      previewHash: receipt.previewHash,
      state: "completed",
      receipt,
    });
  }

  async needsAttention(input: {
    attemptKey: string;
    operation: "provision" | "retire";
    previewHash: string;
  }) {
    this.attempts.set(input.attemptKey, { ...input, state: "needs_attention" });
  }
}

export function buildAuthorizedSpaceProvisioningPreview(
  plan: SpaceProvisioningPlan,
  packetInput: SpaceProvisioningPilotPacket,
): AuthorizedSpaceProvisioningPreview {
  const packet = SpaceProvisioningPilotPacketSchema.parse(packetInput);
  if (!plan.readyForAuthorization || !plan.sourcePrefix) {
    throw new EditableLayerError(
      `The fixed Space plan is not ready: ${plan.blockers.join(" ")}`,
      409,
    );
  }
  if (packet.confirmedSpaceId !== plan.spaceId) {
    throw new EditableLayerError(
      "The pilot packet does not name the exact derived Space.",
      409,
    );
  }
  const sourcePattern = new RegExp(
    `^${escapeRegExp(plan.sourcePrefix)}[A-Za-z0-9._-]+\\.jsonl$`,
  );
  if (!sourcePattern.test(packet.sourceObjectUri)) {
    throw new EditableLayerError(
      "The first source must be one exact JSONL object inside the isolated Space prefix.",
      409,
    );
  }
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        planPreviewHash: plan.previewHash,
        requestId: packet.requestId,
        confirmedSpaceId: packet.confirmedSpaceId,
        sourceObjectUri: packet.sourceObjectUri,
        approvalEvidenceRef: packet.approvalEvidenceRef,
      }),
      "utf8",
    )
    .digest("hex");
  return {
    plan,
    requestId: packet.requestId,
    sourceObjectUri: packet.sourceObjectUri,
    approvalEvidenceRef: packet.approvalEvidenceRef,
    previewHash,
  };
}

export async function provisionFixedSpacePilot(input: {
  actor: AuthenticatedUser;
  preview: AuthorizedSpaceProvisioningPreview;
  confirmation: string;
  attemptKey: string;
  provisioningEnabled: boolean;
  provider: FixedSpaceProvisioningProvider;
  ledger: SpaceProvisioningLedger;
  now?: string;
}): Promise<SpaceProvisioningReceipt> {
  assertAdminAndExecutionBoundary(input.actor, input.provisioningEnabled);
  if (input.confirmation !== SPACE_PROVISION_CONFIRMATION) {
    throw new EditableLayerError("The exact Space preview is not confirmed.", 409);
  }
  assertAttemptKey(input.attemptKey);
  const claim = await input.ledger.claim({
    attemptKey: input.attemptKey,
    operation: "provision",
    previewHash: input.preview.previewHash,
  });
  if (claim.status === "completed") return { ...claim.receipt, duplicate: true };
  if (claim.status !== "claimed") {
    throw new EditableLayerError(
      "The prior provider attempt is unresolved. Reconcile it before another attempt.",
      409,
    );
  }
  try {
    const before = await input.provider.listDataStoreIds(input.preview);
    assertProtectedDataStores(input.preview.plan, before);
    if (before.includes(input.preview.plan.dataStoreId)) {
      throw new EditableLayerError("The pilot data store already exists.", 409);
    }
    const providerResult = await input.provider.provisionDataStoreAndImportSource(
      input.preview,
    );
    const [observed, after] = await Promise.all([
      input.provider.readDataStore(input.preview),
      input.provider.listDataStoreIds(input.preview),
    ]);
    if (
      !observed ||
      observed.id !== input.preview.plan.dataStoreId ||
      observed.displayName !== input.preview.plan.displayName ||
      !after.includes(input.preview.plan.dataStoreId)
    ) {
      throw new Error("Pilot data-store readback did not match the exact plan.");
    }
    assertProtectedDataStores(input.preview.plan, after);
    const receipt = buildReceipt({
      operation: "provision",
      actor: input.actor,
      attemptKey: input.attemptKey,
      preview: input.preview,
      providerOperationRef: providerResult.providerOperationRef,
      now: input.now,
    });
    await input.ledger.complete(receipt);
    return receipt;
  } catch (error) {
    await input.ledger.needsAttention({
      attemptKey: input.attemptKey,
      operation: "provision",
      previewHash: input.preview.previewHash,
    });
    throw error;
  }
}

export async function retireFixedSpacePilot(input: {
  actor: AuthenticatedUser;
  preview: AuthorizedSpaceProvisioningPreview;
  confirmation: string;
  attemptKey: string;
  provisioningEnabled: boolean;
  provider: FixedSpaceProvisioningProvider;
  ledger: SpaceProvisioningLedger;
  now?: string;
}): Promise<SpaceProvisioningReceipt> {
  assertAdminAndExecutionBoundary(input.actor, input.provisioningEnabled);
  if (input.confirmation !== SPACE_RETIRE_CONFIRMATION) {
    throw new EditableLayerError("The exact pilot retirement is not confirmed.", 409);
  }
  assertAttemptKey(input.attemptKey);
  const claim = await input.ledger.claim({
    attemptKey: input.attemptKey,
    operation: "retire",
    previewHash: input.preview.previewHash,
  });
  if (claim.status === "completed") return { ...claim.receipt, duplicate: true };
  if (claim.status !== "claimed") {
    throw new EditableLayerError(
      "The prior retirement attempt is unresolved. Reconcile it before another attempt.",
      409,
    );
  }
  try {
    const before = await input.provider.listDataStoreIds(input.preview);
    assertProtectedDataStores(input.preview.plan, before);
    if (!before.includes(input.preview.plan.dataStoreId)) {
      throw new EditableLayerError("The exact pilot data store is already absent.", 409);
    }
    const providerResult = await input.provider.retireDataStore(input.preview);
    const [observed, after] = await Promise.all([
      input.provider.readDataStore(input.preview),
      input.provider.listDataStoreIds(input.preview),
    ]);
    if (observed || after.includes(input.preview.plan.dataStoreId)) {
      throw new Error("Pilot data store is still present after retirement.");
    }
    assertProtectedDataStores(input.preview.plan, after);
    const receipt = buildReceipt({
      operation: "retire",
      actor: input.actor,
      attemptKey: input.attemptKey,
      preview: input.preview,
      providerOperationRef: providerResult.providerOperationRef,
      now: input.now,
    });
    await input.ledger.complete(receipt);
    return receipt;
  } catch (error) {
    await input.ledger.needsAttention({
      attemptKey: input.attemptKey,
      operation: "retire",
      previewHash: input.preview.previewHash,
    });
    throw error;
  }
}

function assertAdminAndExecutionBoundary(
  actor: AuthenticatedUser,
  enabled: boolean,
): void {
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Only an Admin can provision the pilot Space.", 403);
  }
  if (!enabled) {
    throw new EditableLayerError(
      "Space provisioning is closed until the exact owner-approved pilot packet is ready.",
      409,
    );
  }
}

function assertAttemptKey(value: string): void {
  if (!z.string().uuid().safeParse(value).success) {
    throw new EditableLayerError("Space provider attempt key is invalid.", 409);
  }
}

function assertProtectedDataStores(plan: SpaceProvisioningPlan, observed: string[]) {
  const present = new Set(observed);
  const missing = plan.protectedDataStoreIds.filter((id) => !present.has(id));
  if (missing.length) {
    throw new Error(
      `Protected predecessor data-store readback is incomplete: ${missing.join(", ")}`,
    );
  }
}

function buildReceipt(input: {
  operation: "provision" | "retire";
  actor: AuthenticatedUser;
  attemptKey: string;
  preview: AuthorizedSpaceProvisioningPreview;
  providerOperationRef: string;
  now?: string;
}): SpaceProvisioningReceipt {
  const createdAt = input.now ?? new Date().toISOString();
  return {
    id: createHash("sha256")
      .update(
        `${input.operation}:${input.attemptKey}:${input.preview.previewHash}`,
        "utf8",
      )
      .digest("hex"),
    operation: input.operation,
    attemptKey: input.attemptKey,
    previewHash: input.preview.previewHash,
    spaceId: input.preview.plan.spaceId,
    dataStoreId: input.preview.plan.dataStoreId,
    sourcePrefix: input.preview.plan.sourcePrefix!,
    providerOperationRef: input.providerOperationRef,
    protectedDataStoreIds: [...input.preview.plan.protectedDataStoreIds],
    actorUid: input.actor.uid,
    createdAt,
    duplicate: false,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
