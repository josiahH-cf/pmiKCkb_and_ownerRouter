import { describe, expect, it, vi } from "vitest";

import {
  RENEWAL_COPY_TEMPLATE_SOURCES,
  defaultRenewalCopySelection,
} from "@/lib/lease-renewal/renewal-copy-contract";
import {
  assistGovernedRenewalCopy,
  createRenewalCopyTemplate,
  currentRenewalCopyTemplate,
  prepareGovernedRenewalCopy,
} from "@/lib/lease-renewal/renewal-copy-governance";
import { TEST_OWNER_DRAFT_ATTACHMENT } from "@/tests/helpers/renewal-draft-attachment";
import { buildOwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import { buildTenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";
import type { ModelProvider } from "@/lib/llm/model-provider";

const tenantRendered = buildTenantOfferDraft({
  tenantNameLabel: "Synthetic Tenant",
  leaseEndDateIso: "2026-12-31",
  ownerDecision: "increase",
  offeredRent: 1550,
  charges: { rbp: 25 },
});

const ownerRendered = buildOwnerRenewalDraft({
  addressLabel: "100 Synthetic Street",
  currentRent: 1400,
  currentRentEvidence: {
    agreement: "agree",
    currencyState: "fresh",
    readAtIso: "2026-08-30T00:00:00.000Z",
  },
  market: {
    rangeLow: 1450,
    rangeHigh: 1650,
    specificNumber: 1550,
    compScreenshotAttachment: TEST_OWNER_DRAFT_ATTACHMENT,
  },
});

const tenantRecipient = {
  to: "tenant@synthetic.example.test",
  sourceRef: "rentvine:lease:synthetic:tenants[0].email",
};
const workflowIdentity = {
  workflowId: "renewal-live:synthetic",
  workflowContext: "renewal:synthetic",
};

function approvedTemplate(channel: "owner" | "tenant") {
  return createRenewalCopyTemplate({
    source: RENEWAL_COPY_TEMPLATE_SOURCES[channel],
    publication: {
      status: "approved",
      approvedAtIso: "2026-08-30T00:00:00.000Z",
      evidenceRef: `client-approval:unit-${channel}`,
    },
  });
}

function provider(text: string): ModelProvider {
  return { generateText: vi.fn(async () => ({ text })) };
}

describe("S74 renewal copy governance", () => {
  it("keeps the current owner and tenant versions immutable, separate, and review-only", () => {
    const owner = currentRenewalCopyTemplate("owner");
    const tenant = currentRenewalCopyTemplate("tenant");

    expect(owner).toMatchObject({
      channel: "owner",
      ref: "owner-renewal:v1.0",
      version: "v1.0",
      publication: { status: "review_only" },
    });
    expect(tenant).toMatchObject({
      channel: "tenant",
      ref: "tenant-renewal:v1.0",
      version: "v1.0",
      publication: { status: "review_only" },
    });
    expect(owner.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tenant.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(owner.contentHash).not.toBe(tenant.contentHash);
    expect(Object.isFrozen(owner)).toBe(true);
    expect(Object.isFrozen(owner.regions)).toBe(true);
    expect(Object.isFrozen(owner.regions[0])).toBe(true);
    expect(owner.publication).not.toHaveProperty("approvedAtIso");
  });

  it("rejects a mismatched channel, duplicate region, or approval without exact evidence", () => {
    expect(() =>
      createRenewalCopyTemplate({
        source: {
          ...RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
          ref: "owner-renewal:v1.0",
        } as never,
        publication: { status: "review_only", reason: "Fixture." },
      }),
    ).toThrow(/exact channel/i);
    expect(() =>
      createRenewalCopyTemplate({
        source: {
          ...RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
          regions: [
            ...RENEWAL_COPY_TEMPLATE_SOURCES.tenant.regions,
            RENEWAL_COPY_TEMPLATE_SOURCES.tenant.regions[0],
          ],
        },
        publication: { status: "review_only", reason: "Fixture." },
      }),
    ).toThrow(/unique/i);
    expect(() =>
      createRenewalCopyTemplate({
        source: RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
        publication: {
          status: "approved",
          approvedAtIso: "not-a-date",
          evidenceRef: "client-approval:" as `client-approval:${string}`,
        },
      }),
    ).toThrow(/dated client-approval evidence/i);
    expect(() =>
      createRenewalCopyTemplate({
        source: {
          ...RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
          requiredLockedFactKeys: ["not_locked"],
        },
        publication: { status: "review_only", reason: "Fixture." },
      }),
    ).toThrow(/members of the locked-fact set/i);
    expect(() =>
      createRenewalCopyTemplate({
        source: RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
        publication: { status: "review_only", reason: "" },
      }),
    ).toThrow(/specific reason/i);
  });

  it("renders review-only copy but cannot turn it into an executable preview", () => {
    const result = prepareGovernedRenewalCopy({
      template: currentRenewalCopyTemplate("tenant"),
      rendered: tenantRendered,
      recipient: tenantRecipient,
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
      selection: defaultRenewalCopySelection("tenant"),
    });

    expect(result).toMatchObject({
      status: "review_only",
      template: { status: "review_only", ref: "tenant-renewal:v1.0" },
    });
    expect(result.subject).toContain("Dec 31, 2026");
    expect(result.body).toContain("$1,550");
    expect(result.reasons.join(" ")).toMatch(/client-approved wording/i);
  });

  it("blocks rather than relabeling a retired version as review-only", () => {
    const result = prepareGovernedRenewalCopy({
      template: createRenewalCopyTemplate({
        source: RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
        publication: { status: "retired", reason: "Superseded fixture." },
      }),
      rendered: tenantRendered,
      recipient: tenantRecipient,
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
    });

    expect(result).toMatchObject({ status: "blocked", template: { status: "retired" } });
    expect(result.reasons.join(" ")).toMatch(/retired/i);
  });

  it("changes only an approved editable region while the locked envelope stays exact", () => {
    const template = approvedTemplate("tenant");
    const selection = defaultRenewalCopySelection("tenant");
    selection.editableRegions.response_request =
      "Please reply when you can so the renewal team can continue.";

    const result = prepareGovernedRenewalCopy({
      template,
      rendered: tenantRendered,
      recipient: tenantRecipient,
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
      selection,
    });

    expect(result.status).toBe("ready");
    expect(result.subject).toBe(tenantRendered.channels.email.subject);
    expect(result.body).toContain(selection.editableRegions.response_request);
    expect(result.body).toContain("Synthetic Tenant");
    expect(result.body).toContain("Dec 31, 2026");
    expect(result.body).toContain("$1,550");
    expect(result.body).toContain("$25");
    expect(result.envelope.facts).toEqual(tenantRendered.facts);
    expect(result.envelope).toMatchObject({
      workflowId: "renewal-live:synthetic",
      workflowContext: "renewal:synthetic",
      reviewBanner: "Draft — Review before sending",
      recipient: tenantRecipient,
    });
    expect(result.envelope.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("blocks a missing required fact or recipient source before action construction", () => {
    const missingFact = prepareGovernedRenewalCopy({
      template: approvedTemplate("tenant"),
      rendered: {
        ...tenantRendered,
        facts: tenantRendered.facts.filter((fact) => fact.key !== "offered_rent"),
      },
      recipient: tenantRecipient,
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
    });
    const missingRecipientSource = prepareGovernedRenewalCopy({
      template: approvedTemplate("tenant"),
      rendered: tenantRendered,
      recipient: { ...tenantRecipient, sourceRef: "" },
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
    });

    expect(missingFact.status).toBe("blocked");
    expect(missingFact.reasons.join(" ")).toMatch(
      /missing required locked facts.*offered_rent/i,
    );
    expect(missingRecipientSource.status).toBe("blocked");
    expect(missingRecipientSource.reasons.join(" ")).toMatch(
      /authoritative primary recipient/i,
    );
  });

  it.each([
    ["amount", "We can make the rent $9,999."],
    ["date", "Please reply by 2027-01-01."],
    ["recipient", "Write tenant@synthetic.example.test."],
    ["url", "Use https://unsupported.example.test now."],
    ["promise", "We promise the renewal will be approved."],
    ["term", "A different lease term is available."],
    ["word amount", "The rent can be fifteen hundred."],
    ["word date", "Please reply next Friday."],
    ["evidence", "Delivery is confirmed by a receipt."],
    ["channel claim", "This message was sent by email and text."],
    ["commitment", "We will make this happen."],
    ["cross-channel claim", "Please ask the owner for a response."],
    ["placeholder", "Please accept {{offered_rent}}."],
    ["locked identity", "Synthetic Tenant should reply."],
  ])("rejects editable prose that adds a locked %s", (_label, regionText) => {
    const selection = defaultRenewalCopySelection("tenant");
    selection.editableRegions.response_request = regionText;
    const result = prepareGovernedRenewalCopy({
      template: approvedTemplate("tenant"),
      rendered: tenantRendered,
      recipient: tenantRecipient,
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
      selection,
    });

    expect(result.status).toBe("blocked");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("rejects an owner/tenant template collision before rendering", () => {
    const result = prepareGovernedRenewalCopy({
      template: approvedTemplate("owner"),
      rendered: tenantRendered,
      recipient: tenantRecipient,
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
      selection: defaultRenewalCopySelection("owner"),
    });
    expect(result.status).toBe("blocked");
    expect(result.reasons.join(" ")).toMatch(/owner.*tenant|tenant.*owner/i);
  });

  it("refuses review-only assistance before constructing model work", async () => {
    const model = provider('{"regions":{"response_request":"Safe prose."}}');
    const result = await assistGovernedRenewalCopy({
      template: currentRenewalCopyTemplate("tenant"),
      selection: defaultRenewalCopySelection("tenant"),
      provider: model,
      model: "fixture-model",
    });

    expect(result).toMatchObject({
      status: "refused",
      usedModel: false,
      refusedBeforeModel: true,
    });
    expect(model.generateText).not.toHaveBeenCalled();
  });

  it("sends only editable prose to the model and accepts a safe structured rewrite", async () => {
    const model = provider(
      JSON.stringify({
        regions: {
          response_request: "Please reply when convenient so the team can continue.",
        },
      }),
    );
    const result = await assistGovernedRenewalCopy({
      template: approvedTemplate("tenant"),
      selection: defaultRenewalCopySelection("tenant"),
      provider: model,
      model: "fixture-model",
    });

    expect(result).toMatchObject({ status: "ready", usedModel: true });
    const request = vi.mocked(model.generateText).mock.calls[0][0];
    expect(request.userContent).not.toMatch(
      /Synthetic Tenant|tenant@synthetic|1,550|2026-12-31|100 Synthetic/i,
    );
    expect(result.selection.templateRef).toBe("tenant-renewal:v1.0");
    if (result.selection.templateRef !== "tenant-renewal:v1.0") return;
    expect(result.selection.editableRegions.response_request).toContain(
      "when convenient",
    );
  });

  it.each([
    ['{"regions":{"response_request":"We promise approval at $9,999."}}'],
    ["not-json"],
    ['{"regions":{"owner_request":"Cross-channel replacement."}}'],
    [
      '{"regions":{"response_request":"Please reply when convenient."},"extra":"not allowed"}',
    ],
  ])("falls back byte-for-byte when model output is invalid or unsafe", async (text) => {
    const selection = defaultRenewalCopySelection("tenant");
    const result = await assistGovernedRenewalCopy({
      template: approvedTemplate("tenant"),
      selection,
      provider: provider(text),
      model: "fixture-model",
    });

    expect(result).toMatchObject({ status: "ready", usedModel: false });
    expect(result.selection).toEqual(selection);
  });

  it("keeps owner facts exact under safe owner-region tailoring", () => {
    const selection = defaultRenewalCopySelection("owner");
    selection.editableRegions.owner_request =
      "Please share your direction so the renewal team can continue.";
    const result = prepareGovernedRenewalCopy({
      template: approvedTemplate("owner"),
      rendered: ownerRendered,
      recipient: {
        to: "owner@synthetic.example.test",
        sourceRef: "rentvine:lease:synthetic:portfolio.owners[0].email",
      },
      ...workflowIdentity,
      sourceRefs: ["rentvine:lease:synthetic"],
      selection,
    });

    expect(result.status).toBe("ready");
    expect(result.body).toContain("100 Synthetic Street");
    expect(result.body).toContain("$1,400");
    expect(result.body).toContain("$1,450");
    expect(result.body).toContain("$1,650");
    expect(result.body).toContain("$1,550");
  });
});
