import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => ({ status: "clear" })),
}));

import { DRAFT_BANNER } from "@/lib/constants";
import { type RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { buildRenewalNoticeDraftPreview } from "@/lib/lease-renewal/execution/renewal-draft-preview";
import { executeRenewalNoticeDraft } from "@/lib/lease-renewal/execution/renewal-draft-request";
import { RENEWAL_COPY_TEMPLATE_SOURCES } from "@/lib/lease-renewal/renewal-copy-contract";
import { createRenewalCopyTemplate } from "@/lib/lease-renewal/renewal-copy-governance";
import {
  TEST_OWNER_DRAFT_ATTACHMENT,
  TEST_RENEWAL_ATTACHMENT_IDENTITY,
} from "@/tests/helpers/renewal-draft-attachment";

const MAILBOX = { email: "workflow@pmikcmetro.com", sourceRef: "session:mailbox" };

const approvedCopy = {
  owner: createRenewalCopyTemplate({
    source: RENEWAL_COPY_TEMPLATE_SOURCES.owner,
    publication: {
      status: "approved",
      approvedAtIso: "2026-08-30T00:00:00.000Z",
      evidenceRef: "client-approval:unit-owner",
    },
  }),
  tenant: createRenewalCopyTemplate({
    source: RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
    publication: {
      status: "approved",
      approvedAtIso: "2026-08-30T00:00:00.000Z",
      evidenceRef: "client-approval:unit-tenant",
    },
  }),
};

const common = {
  mailbox: MAILBOX,
  workflowId: "renewal-run-live-7",
  actionId: "draft-7",
  workflowContext: "renewal:lease-7",
  sourceRefs: ["source:live-renewal-run"],
};

const tenantLease = {
  leaseID: 7,
  tenants: [{ name: "Ada Rowan", email: "tenant7@northend-apts.com" }],
};

const ownerLease = {
  leaseID: 7,
  property: { owner: { name: "Cedar Holdings LLC", email: "owner7@cedar-holdings.com" } },
};

const tenantDecision = {
  tenantNameLabel: "Ada Rowan",
  leaseEndDateIso: "2026-09-30",
  ownerDecision: "increase" as const,
  offeredRent: 1550,
};

const ownerDecision = {
  addressLabel: "200 Cedar Ct",
  currentRent: 1400,
  currentRentEvidence: {
    agreement: "agree" as const,
    currencyState: "fresh" as const,
    readAtIso: "2026-08-26T13:00:00.000Z",
  },
  market: {
    rangeLow: 1450,
    rangeHigh: 1650,
    specificNumber: 1550,
    compScreenshotAttachment: TEST_OWNER_DRAFT_ATTACHMENT,
  },
};

describe("buildRenewalNoticeDraftPreview", () => {
  it("produces a ready tenant preview with a banner-applied body and an executable action", () => {
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      copyTemplate: approvedCopy.tenant,
      lease: tenantLease,
      decision: tenantDecision,
    });

    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") return;
    expect(preview.recipient).toEqual({
      to: "tenant7@northend-apts.com",
      sourceRef: "rentvine:lease:7:tenants[0].email",
    });
    expect(preview.subject.length).toBeGreaterThan(0);
    expect(preview.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
    expect(preview.action.actionKey).toBe("gmail.renewal_notice.draft_create");
    expect(preview.action.values.template_ref).toBe("tenant-renewal:v1.0");
    expect(preview.action.values.copy_template_hash).toBe(
      approvedCopy.tenant.contentHash,
    );
    expect(preview.action.values.copy_envelope_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.action.values.to).toBe("tenant7@northend-apts.com");
    expect(preview.action.values.recipient_source_ref).toBe(
      "rentvine:lease:7:tenants[0].email",
    );
  });

  it("changes the locked envelope hash when a non-visible decision fact changes", () => {
    const increase = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      copyTemplate: approvedCopy.tenant,
      lease: tenantLease,
      decision: tenantDecision,
    });
    const custom = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      copyTemplate: approvedCopy.tenant,
      lease: tenantLease,
      decision: { ...tenantDecision, ownerDecision: "custom" },
    });

    expect(increase.status).toBe("ready");
    expect(custom.status).toBe("ready");
    if (increase.status !== "ready" || custom.status !== "ready") return;
    expect(custom.body).toBe(increase.body);
    expect(custom.action.values.copy_envelope_hash).not.toBe(
      increase.action.values.copy_envelope_hash,
    );
  });

  it("surfaces co-tenant Cc on a multi-tenant lease, To and Cc both authoritative (F-LEASE-6)", () => {
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      copyTemplate: approvedCopy.tenant,
      lease: {
        leaseID: 7,
        tenants: [
          { name: "Ada Rowan", email: "tenant7@northend-apts.com" },
          { name: "Ben Rowan", email: "cotenant7@northend-apts.com" },
        ],
      },
      decision: tenantDecision,
    });

    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") return;
    expect(preview.recipient).toEqual({
      to: "tenant7@northend-apts.com",
      sourceRef: "rentvine:lease:7:tenants[0].email",
      cc: ["cotenant7@northend-apts.com"],
    });
    expect(preview.action.values.to).toBe("tenant7@northend-apts.com");
    expect(preview.action.values.cc).toBe("cotenant7@northend-apts.com");
    expect(preview.action.values.cc_source_refs).toBe(
      "rentvine:lease:7:tenants[1].email",
    );
  });

  it("produces a ready owner preview from the joined property.owner email", () => {
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "owner",
      copyTemplate: approvedCopy.owner,
      lease: ownerLease,
      decision: ownerDecision,
      attachment: TEST_RENEWAL_ATTACHMENT_IDENTITY,
    });

    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") return;
    expect(preview.recipient.to).toBe("owner7@cedar-holdings.com");
    expect(preview.action.values.template_ref).toBe("owner-renewal:v1.0");
    expect(preview.action.values.attachment_receipt_id).toBe(
      TEST_RENEWAL_ATTACHMENT_IDENTITY.receiptId,
    );
    expect(preview.attachment).toMatchObject({
      filename: TEST_RENEWAL_ATTACHMENT_IDENTITY.filename,
      mimeType: "image/png",
      sizeBytes: TEST_RENEWAL_ATTACHMENT_IDENTITY.sizeBytes,
    });
    expect(preview.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
  });

  it("blocks (never invents) when the recipient email is not verifiable", () => {
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      copyTemplate: approvedCopy.tenant,
      lease: { leaseID: 7, tenants: [{ name: "No Email" }] },
      decision: tenantDecision,
    });
    expect(preview.status).toBe("blocked");
    if (preview.status !== "blocked") return;
    expect(preview.reasons.join(" ")).toMatch(/needs verification/i);
  });

  it("blocks with the composer's reasons when the notice inputs are incomplete", () => {
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "owner",
      copyTemplate: approvedCopy.owner,
      lease: ownerLease,
      // Missing the market range/specific number/comps screenshot the owner notice requires.
      decision: { addressLabel: "200 Cedar Ct", currentRent: 1400 },
    });
    expect(preview.status).toBe("blocked");
    if (preview.status !== "blocked") return;
    expect(preview.reasons.length).toBeGreaterThan(0);
  });

  it("hands a ready action straight to executeRenewalNoticeDraft (no diagnostic opt-out needed)", async () => {
    const createDraft = vi.fn(async () => ({ draftId: "draft-from-preview-1" }));
    const client: RenewalDraftGmailClient = {
      subject: MAILBOX.email,
      createDraft,
    };
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      copyTemplate: approvedCopy.tenant,
      lease: tenantLease,
      decision: tenantDecision,
    });
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") return;

    const receipt = await executeRenewalNoticeDraft(() => client, preview.action);
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(receipt.providerRef).toBe("draft-from-preview-1");
    expect(receipt.outcome).toBe("succeeded");
  });
});
