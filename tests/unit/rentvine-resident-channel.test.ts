import { describe, expect, it, vi } from "vitest";

import {
  RENTVINE_RESIDENT_CHANNEL_CONFIRMATION,
  RENTVINE_RESIDENT_CHANNEL_ROLLBACK_CONFIRMATION,
  buildRentvineResidentChannelPreview,
  correctRentvineResidentChannel,
  inviteThroughRentvineResidentChannel,
  rollbackRentvineResidentChannel,
  type RentvineResidentChannelProvider,
  type RentvineResidentChannelState,
} from "@/lib/maintenance/rentvine-resident-channel";

function preview() {
  return buildRentvineResidentChannelPreview({
    ticketRef: "verified-ticket-1",
    verifiedResidentRef: "verified-resident-1",
    verifiedPropertyRef: "verified-property-1",
    verificationEvidenceRef: "staff-review:1",
    purpose: "maintenance_intake_invitation",
    contract: {
      contractVersionRef: "rentvine-contract-vendor-approved-v1",
      accountRef: "account-map-1",
      propertyMappingRef: "property-map-1",
      residentIdentityMappingRef: "resident-map-1",
      invitationTemplateRef: "template-approved-1",
      replyEventContractRef: "reply-event-contract-1",
      webhookAuthenticationRef: "webhook-auth-contract-1",
      correctionContractRef: "correction-contract-1",
      rollbackContractRef: "rollback-contract-1",
    },
  });
}

function harness() {
  let state: RentvineResidentChannelState | null = null;
  const byKey = new Map<string, RentvineResidentChannelState>();
  const provider: RentvineResidentChannelProvider = {
    readByIdempotencyKey: vi.fn(async (key) => byKey.get(key) ?? null),
    read: vi.fn(async (ref) => (state?.providerRef === ref ? state : null)),
    invite: vi.fn(async (input) => {
      state = {
        providerRef: "channel-1",
        ticketRef: input.ticketRef,
        residentRef: input.residentRef,
        propertyRef: input.propertyRef,
        templateRef: input.templateRef,
        contractVersionRef: input.contractVersionRef,
        state: "active",
      };
      byKey.set(input.idempotencyKey, state);
      return { providerRef: state.providerRef, applied: true };
    }),
    correct: vi.fn(async (input) => {
      state = { ...state!, state: "corrected" };
      return { providerRef: input.providerRef, applied: true };
    }),
    rollback: vi.fn(async (input) => {
      state = { ...state!, state: "rolled_back" };
      return { providerRef: input.providerRef, applied: true };
    }),
  };
  return { provider };
}

describe("preferred RentVine resident-channel activation seam", () => {
  it("fails closed before provider when the official contract is absent or preview drifts", async () => {
    const exact = preview();
    const { provider } = harness();
    await expect(
      inviteThroughRentvineResidentChannel({
        preview: exact,
        confirmedPreviewHash: exact.previewHash,
        confirmation: RENTVINE_RESIDENT_CHANNEL_CONFIRMATION,
        idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
        providerContractEnabled: false,
        provider,
        beforeState: null,
      }),
    ).rejects.toThrow(/not configured/i);
    expect(provider.invite).not.toHaveBeenCalled();
  });

  it("previews, confirms, idempotently invites, reads back, corrects, and rolls back", async () => {
    const exact = preview();
    const { provider } = harness();
    const receipt = await inviteThroughRentvineResidentChannel({
      preview: exact,
      confirmedPreviewHash: exact.previewHash,
      confirmation: RENTVINE_RESIDENT_CHANNEL_CONFIRMATION,
      idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
      providerContractEnabled: true,
      provider,
      beforeState: null,
      now: "2026-08-27T12:00:00.000Z",
    });
    expect(receipt).toMatchObject({ outcome: "invited", duplicate: false });
    await expect(
      inviteThroughRentvineResidentChannel({
        preview: exact,
        confirmedPreviewHash: exact.previewHash,
        confirmation: RENTVINE_RESIDENT_CHANNEL_CONFIRMATION,
        idempotencyKey: receipt.idempotencyKey,
        providerContractEnabled: true,
        provider,
        beforeState: null,
      }),
    ).resolves.toMatchObject({ duplicate: true });
    expect(provider.invite).toHaveBeenCalledTimes(1);

    const corrected = await correctRentvineResidentChannel({
      preview: exact,
      priorReceipt: receipt,
      confirmedPreviewHash: exact.previewHash,
      confirmation: RENTVINE_RESIDENT_CHANNEL_CONFIRMATION,
      idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f52",
      providerContractEnabled: true,
      provider,
    });
    expect(corrected.outcome).toBe("corrected");

    await expect(
      rollbackRentvineResidentChannel({
        preview: exact,
        priorReceipt: corrected,
        confirmedPreviewHash: exact.previewHash,
        confirmation: RENTVINE_RESIDENT_CHANNEL_ROLLBACK_CONFIRMATION,
        idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f53",
        providerContractEnabled: true,
        provider,
      }),
    ).resolves.toMatchObject({ outcome: "rolled_back" });
  });

  it("rejects arbitrary contract properties and source identity drift", async () => {
    expect(() =>
      buildRentvineResidentChannelPreview({
        ...preview(),
        endpoint: "https://guessed.example",
      } as never),
    ).toThrow(/unrecognized/i);

    const exact = preview();
    const { provider } = harness();
    provider.read = vi.fn().mockResolvedValue({
      providerRef: "channel-1",
      ticketRef: "another-ticket",
      residentRef: exact.verifiedResidentRef,
      propertyRef: exact.verifiedPropertyRef,
      templateRef: exact.contract.invitationTemplateRef,
      contractVersionRef: exact.contract.contractVersionRef,
      state: "active",
    });
    await expect(
      inviteThroughRentvineResidentChannel({
        preview: exact,
        confirmedPreviewHash: exact.previewHash,
        confirmation: RENTVINE_RESIDENT_CHANNEL_CONFIRMATION,
        idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f54",
        providerContractEnabled: true,
        provider,
        beforeState: null,
      }),
    ).rejects.toThrow(/readback/i);
  });
});
