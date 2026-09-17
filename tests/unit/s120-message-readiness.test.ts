import { describe, expect, it } from "vitest";

import {
  MESSAGE_CONTROL_IDS,
  messageInputTarget,
  projectMessageReadiness,
  resourceEntryHref,
} from "@/lib/lease-renewal/message-readiness";
import {
  composeRenewalMessage,
  RESPONSE_REQUEST_PLACEMENT,
  responseRequestParagraph,
  SUPPLIED_RENEWAL_COPY,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";

// S120 (R120.4, R120.5): one output-readiness result routes every genuine missing requirement to
// its own control and governs the final body exports; the optional response-request wording
// replaces exactly one specified paragraph. Values are synthetic.

function baseReadiness(channel: "owner" | "tenant") {
  return {
    channel,
    missing: [] as Array<{ field: string; message: string }>,
    contentError: "",
    saved: true,
    dirty: false,
    needsReview: false,
    signatureMatchesActor: true,
    signatureSaved: true,
  };
}

function tenantFacts(): RenewalMessageFacts {
  const inputs = emptyMessagePreparationInputs();
  return {
    channel: "tenant",
    names: ["Fixture Tenant"],
    address: "701 Fixture Lane",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
    ownerTerms: {
      rent: 1100,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      source: "staff:reviewed-owner-terms",
    },
    range: null,
    suggestedRent: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: inputs.charges.map((charge) => ({
      ...charge,
      applicable: false,
      source: "reviewed:charges",
    })),
    insuranceTransition: null,
    leaseOrigin: { kind: "pmi", source: "reviewed:lease" },
    otherChargesComparison: null,
    informationForm: { url: "https://fixture-rental.net/form", source: "reviewed:form" },
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: {
      name: "Fixture Staff",
      email: "fixture-staff@pmikcmetro.com",
      source: "reviewed:staff",
      role: null,
      phone: null,
      hours: null,
      website: null,
    },
    attachments: [],
  };
}

function ownerFacts(): RenewalMessageFacts {
  return {
    ...tenantFacts(),
    channel: "owner",
    names: ["Fixture Owner"],
    currentBaseRent: { value: 1000, source: "reviewed:current-rent" },
    range: { low: 1000, high: 1200, source: "reviewed:range" },
    comps: [{ address: "Comparable 1", rent: 1100, source: "reviewed:comps" }],
    ownerTerms: null,
  };
}

describe("S120 message readiness", () => {
  it("AC-S120-4: every actual missing field routes to its own reachable control or the exact shared-resource entry", () => {
    const cases: Array<[string, string]> = [
      ["names", "renewal-section-lease-details"],
      ["address", "renewal-section-lease-details"],
      ["leaseEndDate", "renewal-section-lease-details"],
      ["currentBaseRent", "renewal-rent-and-charges"],
      ["range", "renewal-section-comps"],
      ["comps", "renewal-section-comps"],
      ["attachment", MESSAGE_CONTROL_IDS.attachment],
      ["ownerTerms", "renewal-manual-owner_response"],
      ["leaseOrigin", MESSAGE_CONTROL_IDS.origin("tenant")],
      ["charge.pet", MESSAGE_CONTROL_IDS.charge("tenant", "pet")],
      ["charge.insurance", MESSAGE_CONTROL_IDS.charge("tenant", "insurance")],
      ["insuranceTransition", MESSAGE_CONTROL_IDS.insurance("tenant")],
      ["signature", MESSAGE_CONTROL_IDS.signature("tenant")],
    ];
    for (const [field, id] of cases) {
      const target = messageInputTarget("tenant", field);
      expect(target.kind, field).toBe("control");
      expect(target.kind === "control" ? target.id : "", field).toBe(id);
      expect(target.label.trim().length, field).toBeGreaterThan(0);
    }
    for (const [field, resourceId] of [
      ["insuranceFlyer", "insurance_flyer"],
      ["rbpFlyer", "rbp_flyer"],
      ["informationForm", "renewal_information_form"],
    ] as const) {
      const target = messageInputTarget("tenant", field);
      expect(target.kind, field).toBe("route");
      expect(target.kind === "route" ? target.href : "", field).toBe(
        resourceEntryHref(resourceId),
      );
      expect(resourceEntryHref(resourceId)).toBe(
        `/connections#renewal-resource-entry-${resourceId}`,
      );
    }
    // Every control target is a page anchor the dashboard focus helper can open; none is a
    // generic link-settings destination.
    for (const [field] of cases) {
      const target = messageInputTarget("owner", field);
      if (target.kind === "control") expect(target.id.startsWith("renewal-")).toBe(true);
      expect(JSON.stringify(target)).not.toContain("Open shared resource link boxes");
    }
  });

  it("AC-S120-4: the body is ready only when content, current review and the sender requirement are all satisfied; optional omissions never block", () => {
    const ready = projectMessageReadiness(baseReadiness("tenant"));
    expect(ready.bodyReady).toBe(true);
    expect(ready.items).toEqual([]);
    expect(ready.summary).toMatch(/ready/i);

    const missing = projectMessageReadiness({
      ...baseReadiness("tenant"),
      missing: [
        { field: "leaseOrigin", message: "Review the lease origin." },
        { field: "charge.pet", message: "Review whether Pet rent applies." },
      ],
    });
    expect(missing.bodyReady).toBe(false);
    expect(missing.items.map((item) => item.field)).toEqual([
      "leaseOrigin",
      "charge.pet",
    ]);
    expect(missing.summary).toBe("2 inputs remain for final use");

    const unsavedEdits = projectMessageReadiness({
      ...baseReadiness("owner"),
      dirty: true,
    });
    expect(unsavedEdits.bodyReady).toBe(false);
    expect(unsavedEdits.items.map((item) => item.field)).toEqual(["review"]);
    expect(unsavedEdits.items[0].target).toEqual({
      kind: "control",
      id: MESSAGE_CONTROL_IDS.reviewed("owner"),
      label: expect.any(String),
    });

    const stale = projectMessageReadiness({
      ...baseReadiness("owner"),
      needsReview: true,
    });
    expect(stale.bodyReady).toBe(false);
    expect(stale.items.map((item) => item.field)).toEqual(["review"]);

    const neverSaved = projectMessageReadiness({
      ...baseReadiness("owner"),
      saved: false,
      needsReview: true,
      signatureMatchesActor: false,
      signatureSaved: false,
    });
    // An unsaved preparation reports the one review item; it does not also blame the sender.
    expect(neverSaved.items.map((item) => item.field)).toEqual(["review"]);

    const otherSender = projectMessageReadiness({
      ...baseReadiness("tenant"),
      signatureMatchesActor: false,
    });
    expect(otherSender.bodyReady).toBe(false);
    expect(otherSender.items.map((item) => item.field)).toEqual(["signature_actor"]);
    expect(otherSender.items[0].target).toEqual({
      kind: "control",
      id: MESSAGE_CONTROL_IDS.adoptSignature("tenant"),
      label: expect.any(String),
    });

    const invalid = projectMessageReadiness({
      ...baseReadiness("tenant"),
      contentError: "Use plain text without control characters or template tokens.",
    });
    expect(invalid.bodyReady).toBe(false);
    expect(invalid.items[0].field).toBe("content");
  });

  it("AC-S120-4: a starting band cannot satisfy the comparison evidence, while optional wording and signature decorations are never listed", () => {
    // The S118 evidence projection replaces the range message; the readiness keeps that exact
    // requirement and routes it to comp preparation rather than treating the band as evidence.
    const band = projectMessageReadiness({
      ...baseReadiness("owner"),
      missing: [
        {
          field: "range",
          message:
            "Review a sourced low and high comparable rent; the starting band is not evidence.",
        },
      ],
    });
    expect(band.bodyReady).toBe(false);
    expect(band.items[0].target).toMatchObject({ id: "renewal-section-comps" });

    const facts = ownerFacts();
    const content = composeRenewalMessage(facts, { responseRequest: "" });
    expect(content.missing).toEqual([]);
    const withoutDecorations = composeRenewalMessage(
      { ...facts, signature: { ...facts.signature!, role: null, website: null } },
      { responseRequest: "" },
    );
    expect(withoutDecorations.missing).toEqual([]);
  });

  it("AC-S120-5: the response-request wording replaces exactly the specified paragraph and blank restores the approved default", () => {
    const owner = ownerFacts();
    const ownerDefault = composeRenewalMessage(owner, { responseRequest: "" });
    const ownerText = ownerDefault.paragraphs.map((runs) => runs[0].text);
    const marketIndex = ownerText.findIndex((text) =>
      text.startsWith("I am seeing similar"),
    );
    expect(ownerText[marketIndex + 1]).toBe(SUPPLIED_RENEWAL_COPY.owner.request);
    expect(ownerText[marketIndex + 2]).toMatch(/^Comparable 1/);
    const ownerEdited = composeRenewalMessage(owner, {
      responseRequest: "Please tell us how you would like to proceed this year.",
    });
    const editedText = ownerEdited.paragraphs.map((runs) => runs[0].text);
    expect(editedText[marketIndex + 1]).toBe(
      "Please tell us how you would like to proceed this year.",
    );
    expect(editedText.filter((text, index) => index !== marketIndex + 1)).toEqual(
      ownerText.filter((text, index) => index !== marketIndex + 1),
    );
    expect(ownerEdited.subject).toBe(ownerDefault.subject);
    expect(ownerEdited.missing).toEqual([]);

    const tenant = tenantFacts();
    const tenantDefault = composeRenewalMessage(tenant, { responseRequest: "" });
    const tenantText = tenantDefault.paragraphs.map((runs) => runs[0].text);
    const responseIndex = tenantText.indexOf(SUPPLIED_RENEWAL_COPY.tenant.response);
    expect(responseIndex).toBeGreaterThan(
      tenantText.findIndex((t) => t.startsWith("Rent:")),
    );
    expect(tenantText[responseIndex + 1]).toBe(
      SUPPLIED_RENEWAL_COPY.tenant.informationForm,
    );
    const tenantEdited = composeRenewalMessage(tenant, {
      responseRequest: "Let us know your plans when you can.",
    });
    expect(tenantEdited.paragraphs[responseIndex][0].text).toBe(
      "Let us know your plans when you can.",
    );
    expect(tenantEdited.plainText).toContain("$1,100.00");

    expect(responseRequestParagraph("owner", { responseRequest: "" })).toEqual({
      text: SUPPLIED_RENEWAL_COPY.owner.request,
      isDefault: true,
    });
    expect(
      responseRequestParagraph("tenant", { responseRequest: "  Custom.  " }),
    ).toEqual({
      text: "Custom.",
      isDefault: false,
    });
    expect(RESPONSE_REQUEST_PLACEMENT.owner).toMatch(/market/i);
    expect(RESPONSE_REQUEST_PLACEMENT.owner).toMatch(/comparable/i);
    expect(RESPONSE_REQUEST_PLACEMENT.tenant).toMatch(/information form/i);
    // Facts stay in their labeled fields: prose with amounts, dates or links is still refused.
    expect(() =>
      composeRenewalMessage(tenant, {
        responseRequest: "Rent is $1,300 from 2027-01-01.",
      }),
    ).toThrow();
  });
});
