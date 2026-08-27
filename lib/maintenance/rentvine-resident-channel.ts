import { createHash } from "node:crypto";
import { z } from "zod";

import { EditableLayerError } from "@/lib/firestore/errors";

export const RENTVINE_RESIDENT_CHANNEL_CONFIRMATION =
  "I confirm this exact verified resident-channel preview.";
export const RENTVINE_RESIDENT_CHANNEL_ROLLBACK_CONFIRMATION =
  "I confirm rollback of only this exact resident-channel invitation.";

/**
 * Opaque client/vendor-supplied contract references. No endpoint, template, mapping, event, or auth
 * scheme is inferred by the app; the eventual official adapter must resolve every reference.
 */
export const RentvineResidentChannelContractSchema = z
  .object({
    contractVersionRef: z.string().trim().min(3).max(200),
    accountRef: z.string().trim().min(1).max(200),
    propertyMappingRef: z.string().trim().min(1).max(200),
    residentIdentityMappingRef: z.string().trim().min(1).max(200),
    invitationTemplateRef: z.string().trim().min(1).max(200),
    replyEventContractRef: z.string().trim().min(1).max(200),
    webhookAuthenticationRef: z.string().trim().min(1).max(200),
    correctionContractRef: z.string().trim().min(1).max(200),
    rollbackContractRef: z.string().trim().min(1).max(200),
  })
  .strict();

export const RentvineResidentChannelPreviewInputSchema = z
  .object({
    ticketRef: z.string().trim().min(1).max(200),
    verifiedResidentRef: z.string().trim().min(1).max(200),
    verifiedPropertyRef: z.string().trim().min(1).max(200),
    verificationEvidenceRef: z.string().trim().min(3).max(300),
    purpose: z.literal("maintenance_intake_invitation"),
    contract: RentvineResidentChannelContractSchema,
  })
  .strict();

export type RentvineResidentChannelContract = z.infer<
  typeof RentvineResidentChannelContractSchema
>;
export type RentvineResidentChannelPreviewInput = z.infer<
  typeof RentvineResidentChannelPreviewInputSchema
>;

export interface RentvineResidentChannelPreview extends RentvineResidentChannelPreviewInput {
  previewHash: string;
}

export interface RentvineResidentChannelState {
  providerRef: string;
  ticketRef: string;
  residentRef: string;
  propertyRef: string;
  templateRef: string;
  contractVersionRef: string;
  state: "active" | "corrected" | "rolled_back";
}

export interface RentvineResidentChannelReceipt {
  previewHash: string;
  idempotencyKey: string;
  providerRef: string;
  stateHash: string;
  outcome: "invited" | "corrected" | "rolled_back";
  duplicate: boolean;
  createdAt: string;
}

/** Official-provider boundary; implementation is intentionally absent until the exact contract exists. */
export interface RentvineResidentChannelProvider {
  readByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<RentvineResidentChannelState | null>;
  read(providerRef: string): Promise<RentvineResidentChannelState | null>;
  invite(input: {
    ticketRef: string;
    residentRef: string;
    propertyRef: string;
    templateRef: string;
    contractVersionRef: string;
    expectedBeforeStateHash: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; applied: boolean }>;
  correct(input: {
    providerRef: string;
    correctionContractRef: string;
    expectedStateHash: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; applied: boolean }>;
  rollback(input: {
    providerRef: string;
    rollbackContractRef: string;
    expectedStateHash: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; applied: boolean }>;
}

export function buildRentvineResidentChannelPreview(
  input: RentvineResidentChannelPreviewInput,
): RentvineResidentChannelPreview {
  const parsed = RentvineResidentChannelPreviewInputSchema.parse(input);
  return {
    ...parsed,
    previewHash: hash(parsed),
  };
}

export async function inviteThroughRentvineResidentChannel(input: {
  preview: RentvineResidentChannelPreview;
  confirmedPreviewHash: string;
  confirmation: string;
  idempotencyKey: string;
  providerContractEnabled: boolean;
  provider: RentvineResidentChannelProvider;
  beforeState: RentvineResidentChannelState | null;
  now?: string;
}): Promise<RentvineResidentChannelReceipt> {
  assertExecutable(input);
  const duplicate = await input.provider.readByIdempotencyKey(input.idempotencyKey);
  if (duplicate) {
    assertExactState(input.preview, duplicate, "active");
    return makeReceipt(input, duplicate, "invited", true);
  }
  const expectedBeforeStateHash = hash(input.beforeState);
  const result = await input.provider.invite({
    ticketRef: input.preview.ticketRef,
    residentRef: input.preview.verifiedResidentRef,
    propertyRef: input.preview.verifiedPropertyRef,
    templateRef: input.preview.contract.invitationTemplateRef,
    contractVersionRef: input.preview.contract.contractVersionRef,
    expectedBeforeStateHash,
    idempotencyKey: input.idempotencyKey,
  });
  if (!result.applied) {
    throw new EditableLayerError(
      "The RentVine resident-channel state changed before invitation.",
      409,
    );
  }
  const observed = await input.provider.read(result.providerRef);
  assertExactState(input.preview, observed, "active");
  return makeReceipt(input, observed!, "invited", false);
}

export async function correctRentvineResidentChannel(input: {
  preview: RentvineResidentChannelPreview;
  priorReceipt: RentvineResidentChannelReceipt;
  confirmedPreviewHash: string;
  confirmation: string;
  idempotencyKey: string;
  providerContractEnabled: boolean;
  provider: RentvineResidentChannelProvider;
  now?: string;
}): Promise<RentvineResidentChannelReceipt> {
  assertExecutable(input);
  assertPriorReceipt(input.preview, input.priorReceipt);
  const current = await input.provider.read(input.priorReceipt.providerRef);
  assertExactState(input.preview, current, "active");
  const result = await input.provider.correct({
    providerRef: input.priorReceipt.providerRef,
    correctionContractRef: input.preview.contract.correctionContractRef,
    expectedStateHash: hash(current),
    idempotencyKey: input.idempotencyKey,
  });
  const observed = await input.provider.read(result.providerRef);
  if (!result.applied) {
    throw new EditableLayerError(
      "The exact resident-channel correction was refused.",
      409,
    );
  }
  assertExactState(input.preview, observed, "corrected");
  return makeReceipt(input, observed!, "corrected", false);
}

export async function rollbackRentvineResidentChannel(input: {
  preview: RentvineResidentChannelPreview;
  priorReceipt: RentvineResidentChannelReceipt;
  confirmedPreviewHash: string;
  confirmation: string;
  idempotencyKey: string;
  providerContractEnabled: boolean;
  provider: RentvineResidentChannelProvider;
  now?: string;
}): Promise<RentvineResidentChannelReceipt> {
  if (input.confirmation !== RENTVINE_RESIDENT_CHANNEL_ROLLBACK_CONFIRMATION) {
    throw new EditableLayerError(
      "The exact resident-channel rollback is not confirmed.",
      409,
    );
  }
  assertExecutable({ ...input, confirmation: RENTVINE_RESIDENT_CHANNEL_CONFIRMATION });
  assertPriorReceipt(input.preview, input.priorReceipt);
  const current = await input.provider.read(input.priorReceipt.providerRef);
  if (!current || !["active", "corrected"].includes(current.state)) {
    throw new EditableLayerError(
      "The exact resident-channel effect is not reversible.",
      409,
    );
  }
  const result = await input.provider.rollback({
    providerRef: input.priorReceipt.providerRef,
    rollbackContractRef: input.preview.contract.rollbackContractRef,
    expectedStateHash: hash(current),
    idempotencyKey: input.idempotencyKey,
  });
  const observed = await input.provider.read(result.providerRef);
  if (!result.applied) {
    throw new EditableLayerError("The exact resident-channel rollback was refused.", 409);
  }
  assertExactState(input.preview, observed, "rolled_back");
  return makeReceipt(input, observed!, "rolled_back", false);
}

function assertExecutable(input: {
  preview: RentvineResidentChannelPreview;
  confirmedPreviewHash: string;
  confirmation: string;
  idempotencyKey: string;
  providerContractEnabled: boolean;
}): void {
  if (!input.providerContractEnabled) {
    throw new EditableLayerError(
      "The official RentVine resident-channel contract is not configured.",
      409,
    );
  }
  if (
    input.confirmation !== RENTVINE_RESIDENT_CHANNEL_CONFIRMATION ||
    input.confirmedPreviewHash !== input.preview.previewHash
  ) {
    throw new EditableLayerError(
      "The exact resident-channel preview is not confirmed.",
      409,
    );
  }
  if (!z.string().uuid().safeParse(input.idempotencyKey).success) {
    throw new EditableLayerError("The resident-channel attempt key is invalid.", 409);
  }
}

function assertPriorReceipt(
  preview: RentvineResidentChannelPreview,
  receipt: RentvineResidentChannelReceipt,
): void {
  if (
    receipt.previewHash !== preview.previewHash ||
    receipt.outcome === "rolled_back" ||
    !receipt.providerRef.trim()
  ) {
    throw new EditableLayerError(
      "The prior resident-channel receipt does not match.",
      409,
    );
  }
}

function assertExactState(
  preview: RentvineResidentChannelPreview,
  state: RentvineResidentChannelState | null,
  expectedState: RentvineResidentChannelState["state"],
): void {
  if (
    !state ||
    state.ticketRef !== preview.ticketRef ||
    state.residentRef !== preview.verifiedResidentRef ||
    state.propertyRef !== preview.verifiedPropertyRef ||
    state.templateRef !== preview.contract.invitationTemplateRef ||
    state.contractVersionRef !== preview.contract.contractVersionRef ||
    state.state !== expectedState
  ) {
    throw new EditableLayerError(
      "RentVine resident-channel readback did not match the exact preview.",
      409,
    );
  }
}

function makeReceipt(
  input: {
    preview: RentvineResidentChannelPreview;
    idempotencyKey: string;
    now?: string;
  },
  state: RentvineResidentChannelState,
  outcome: RentvineResidentChannelReceipt["outcome"],
  duplicate: boolean,
): RentvineResidentChannelReceipt {
  return {
    previewHash: input.preview.previewHash,
    idempotencyKey: input.idempotencyKey,
    providerRef: state.providerRef,
    stateHash: hash(state),
    outcome,
    duplicate,
    createdAt: input.now ?? new Date().toISOString(),
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
