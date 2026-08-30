import { describe, expect, it } from "vitest";

import {
  RenewalNoticeDraftRequestSchema,
  bindRenewalDraftPreview,
  isRenewalDraftPreviewCurrent,
  type RenewalNoticeDraftRequest,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { defaultRenewalCopySelection } from "@/lib/lease-renewal/renewal-copy-contract";

const EXECUTION_ID = `exec_${"a".repeat(40)}`;
const PREVIEW_HASH = "b".repeat(64);

const tenantRequest = {
  leaseId: "lease-42",
  copy: defaultRenewalCopySelection("tenant"),
  offer: {
    channel: "tenant",
    ownerDecision: "increase",
    offeredRent: 1550.25,
    charges: { rbp: 25, insurance: 0 },
    infoFormUrl: "https://pmikcmetro.com/renewal-info",
  },
} satisfies RenewalNoticeDraftRequest;

const ownerRequest = {
  leaseId: "lease-42",
  copy: defaultRenewalCopySelection("owner"),
  offer: {
    channel: "owner",
    market: {
      specificNumber: 1550.25,
      rangeLow: 1450,
      rangeHigh: 1650,
      compsScreenshotRef: "drive:comps-42",
    },
  },
} satisfies RenewalNoticeDraftRequest;

const preview = {
  status: "preview" as const,
  channel: "tenant" as const,
  recipient: {
    to: "tenant42@northend-apts.com",
    sourceRef: "rentvine:lease:42:tenants[0].email",
  },
  subject: "Preview",
  body: "Preview body",
  executionId: EXECUTION_ID,
  previewHash: PREVIEW_HASH,
  template: {
    ref: "tenant-renewal:v1.0" as const,
    version: "v1.0" as const,
    contentHash: "c".repeat(64),
    status: "approved" as const,
  },
};

describe("renewal notice draft shared contract", () => {
  it("accepts preview omission and exact confirmation while rejecting booleans", () => {
    expect(RenewalNoticeDraftRequestSchema.safeParse(tenantRequest).success).toBe(true);
    expect(
      RenewalNoticeDraftRequestSchema.safeParse({
        ...tenantRequest,
        confirm: { executionId: EXECUTION_ID, previewHash: PREVIEW_HASH },
      }).success,
    ).toBe(true);
    for (const confirm of [true, false]) {
      expect(
        RenewalNoticeDraftRequestSchema.safeParse({ ...tenantRequest, confirm }).success,
      ).toBe(false);
    }
  });

  it.each([
    ["numeric string", "1550"],
    ["boolean", true],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["zero", 0],
    ["negative", -1],
  ])("rejects an invalid tenant money value: %s", (_label, offeredRent) => {
    expect(
      RenewalNoticeDraftRequestSchema.safeParse({
        ...tenantRequest,
        offer: { ...tenantRequest.offer, offeredRent },
      }).success,
    ).toBe(false);
  });

  it("rejects an inverted owner range and confirm/reconcile ambiguity", () => {
    expect(
      RenewalNoticeDraftRequestSchema.safeParse({
        ...ownerRequest,
        offer: {
          ...ownerRequest.offer,
          market: { ...ownerRequest.offer.market, rangeLow: 1700, rangeHigh: 1500 },
        },
      }).success,
    ).toBe(false);
    expect(
      RenewalNoticeDraftRequestSchema.safeParse({
        ...tenantRequest,
        confirm: { executionId: EXECUTION_ID, previewHash: PREVIEW_HASH },
        reconcile: { executionId: EXECUTION_ID },
      }).success,
    ).toBe(false);
  });

  it("invalidates a preview binding for every tenant-controlled field", () => {
    const binding = bindRenewalDraftPreview(tenantRequest, preview);
    expect(isRenewalDraftPreviewCurrent(binding, tenantRequest)).toBe(true);

    const mutations: RenewalNoticeDraftRequest[] = [
      { ...tenantRequest, leaseId: "lease-43" },
      {
        ...tenantRequest,
        offer: { ...tenantRequest.offer, ownerDecision: "custom" },
      },
      { ...tenantRequest, offer: { ...tenantRequest.offer, offeredRent: 1600 } },
      {
        ...tenantRequest,
        offer: { ...tenantRequest.offer, charges: { rbp: 30, insurance: 0 } },
      },
      {
        ...tenantRequest,
        offer: {
          ...tenantRequest.offer,
          infoFormUrl: "https://pmikcmetro.com/renewal-info-v2",
        },
      },
      ownerRequest,
      {
        ...tenantRequest,
        copy: {
          ...tenantRequest.copy,
          editableRegions: {
            response_request: "Please reply when convenient.",
          },
        },
      },
    ];

    for (const changed of mutations) {
      expect(isRenewalDraftPreviewCurrent(binding, changed)).toBe(false);
    }
  });

  it("invalidates a preview binding for every owner market field", () => {
    const ownerPreview = { ...preview, channel: "owner" as const };
    const binding = bindRenewalDraftPreview(ownerRequest, ownerPreview);
    const market =
      ownerRequest.offer.channel === "owner" ? ownerRequest.offer.market : {};
    const mutations: RenewalNoticeDraftRequest[] = [
      {
        ...ownerRequest,
        offer: {
          channel: "owner",
          market: { ...market, specificNumber: 1600 },
        },
      },
      {
        ...ownerRequest,
        offer: { channel: "owner", market: { ...market, rangeLow: 1500 } },
      },
      {
        ...ownerRequest,
        offer: { channel: "owner", market: { ...market, rangeHigh: 1700 } },
      },
      {
        ...ownerRequest,
        offer: {
          channel: "owner",
          market: { ...market, compsScreenshotRef: "drive:comps-43" },
        },
      },
      tenantRequest,
      {
        ...ownerRequest,
        copy: {
          ...ownerRequest.copy,
          editableRegions: {
            ...ownerRequest.copy.editableRegions,
            owner_request: "Please share your direction when convenient.",
          },
        },
      },
    ];

    for (const changed of mutations) {
      expect(isRenewalDraftPreviewCurrent(binding, changed)).toBe(false);
    }
  });
});
