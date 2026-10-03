import { describe, expect, it } from "vitest";

import {
  composeRenewalMessage,
  hasMissingValueMarker,
  MESSAGE_CHARGES,
  missingValueMarker,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { projectMessageReadiness } from "@/lib/lease-renewal/message-readiness";
import {
  applyRefinedBody,
  STALE_REFINED_BODY_MESSAGE,
} from "@/lib/lease-renewal/refined-message";
import {
  composedBodyHash,
  resolveMessageBodyOverride,
} from "@/lib/firestore/renewal-message-body-overrides";
import { renewalRefinementFacts } from "@/lib/email-refinement/context";

// S161: an owner or tenant message is assembled from whatever is known. A value that is absent is a
// named marker in the text and one entry in the callout; nothing is invented and nothing refuses.
// Every value below is synthetic.

function emptyFacts(channel: "owner" | "tenant"): RenewalMessageFacts {
  return {
    channel,
    names: [],
    firstNames: [],
    address: null,
    currentBaseRent: null,
    leaseEndDate: null,
    ownerTerms: null,
    range: null,
    suggestedRent: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: Object.keys(MESSAGE_CHARGES).map((id) => ({
      id: id as keyof typeof MESSAGE_CHARGES,
      applicable: null,
      amount: null,
      cadence: null,
      effectiveDate: null,
      source: null,
      comparison: "unverified" as const,
    })),
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: null,
    attachments: [],
  };
}

describe("S161 composition from available information", () => {
  it("BEH-S161-3, BEH-S161-4, AC-S161-1: an owner message with no business values still composes, with each gap as a named marker", () => {
    const message = composeRenewalMessage(emptyFacts("owner"));
    expect(message.subject).toBe(
      `Lease Renewal for ${missingValueMarker("property address")}`,
    );
    expect(message.plainText).toContain(
      `We are currently charging them ${missingValueMarker("current rent")} per month.`,
    );
    expect(message.plainText).toContain(
      `ranging from ${missingValueMarker("low comparable rent")} to ${missingValueMarker("high comparable rent")}.`,
    );
    expect(message.plainText).toContain(missingValueMarker("comparable listings"));
    expect(message.plainText).toContain(missingValueMarker("sender signature"));
    expect(missingValueMarker("current rent")).toBe("[Needs Verification: current rent]");
    expect(hasMissingValueMarker(message.plainText)).toBe(true);
    expect(message.htmlBody).toContain("[Needs Verification: current rent]");
    // The callout names each gap once; no entry asks for a review or an approval.
    expect(message.missing.map((entry) => entry.field)).toEqual(
      expect.arrayContaining([
        "names",
        "address",
        "currentBaseRent",
        "range",
        "comps",
        "signature",
      ]),
    );
    expect(message.missing.map((entry) => entry.message).join(" ")).not.toMatch(
      /review|approv|verify/i,
    );
  });

  it("BEH-S161-2, AC-S161-1: a tenant message uses working terms with no owner response, and marks only the term that is unknown", () => {
    const facts = emptyFacts("tenant");
    facts.leaseEndDate = "2026-12-31";
    facts.ownerTerms = {
      rent: 1525,
      effectiveDate: "2027-01-01",
      endDate: null,
      source: "Working renewal terms",
    };
    const message = composeRenewalMessage(facts);
    expect(message.plainText).toContain(
      `Rent: $1,525.00 per month, effective 01/01/2027. Renewal term: 01/01/2027 through ${missingValueMarker("renewal end date")}.`,
    );
    expect(message.missing).toContainEqual({
      field: "ownerTerms",
      message: "The renewal end date is not entered yet.",
    });
    expect(message.missing.map((entry) => entry.message).join(" ")).not.toMatch(
      /owner approval/i,
    );
    // With no terms at all the offer sentence is still there, fully marked.
    const none = composeRenewalMessage(emptyFacts("tenant"));
    expect(none.plainText).toContain(
      `Rent: ${missingValueMarker("renewal rent")} per month, effective ${missingValueMarker("renewal start date")}.`,
    );
    expect(none.plainText).toContain(
      `Your lease ends on ${missingValueMarker("lease end date")}.`,
    );
  });

  it("BEH-S161-5: unanswered charge and lease-origin questions add no required interaction", () => {
    const message = composeRenewalMessage(emptyFacts("tenant"));
    const fields = message.missing.map((entry) => entry.field);
    expect(fields.some((field) => field.startsWith("charge."))).toBe(false);
    expect(fields).not.toContain("leaseOrigin");
    expect(fields).not.toContain("insuranceTransition");
  });

  it("BEH-S161-1, BEH-S161-6, AC-S161-2: a staff-entered working rent and working terms fill a newly prepared message with their labels", () => {
    const owner = emptyFacts("owner");
    owner.address = "410 Sample Court";
    owner.currentBaseRent = { value: 1480, source: "Staff working value" };
    const ownerMessage = composeRenewalMessage(owner);
    expect(ownerMessage.plainText).toContain(
      "We are currently charging them $1,480.00 per month.",
    );
    expect(ownerMessage.sourceRefs).toContain("Staff working value");
    const tenant = emptyFacts("tenant");
    tenant.ownerTerms = {
      rent: 1560,
      effectiveDate: "2027-02-01",
      endDate: "2028-01-31",
      source: "Working renewal terms",
    };
    const tenantMessage = composeRenewalMessage(tenant);
    expect(tenantMessage.plainText).toContain("Rent: $1,560.00 per month");
    expect(tenantMessage.sourceRefs).toContain("Working renewal terms");
    expect(renewalRefinementFacts(tenant)).toContainEqual({
      label: "Renewal rent",
      value: "$1,560.00",
    });
  });

  it("BEH-S161-8: supplied wording, recurring and one-time charge headings and the managed signature are preserved", () => {
    const facts = emptyFacts("tenant");
    facts.charges = facts.charges.map((charge) =>
      charge.id === "pet"
        ? {
            ...charge,
            applicable: true,
            amount: 35,
            cadence: "monthly",
            effectiveDate: "2027-01-01",
          }
        : charge.id === "renewal_processing"
          ? {
              ...charge,
              applicable: true,
              amount: 95,
              cadence: "one_time",
              effectiveDate: "2027-01-01",
            }
          : charge.id === "utilities"
            ? { ...charge, applicable: true }
            : charge,
    );
    facts.signature = {
      name: "Sample Sender",
      email: "sample.sender@pmikcmetro.com",
      role: "PMI KC Metro",
      phone: null,
      hours: null,
      website: null,
      source: "managed:sample",
    };
    const message = composeRenewalMessage(facts);
    expect(message.plainText).toContain(
      "Other monthly charges\n\nPet rent: $35.00 per month, effective 01/01/2027.",
    );
    expect(message.plainText).toContain(
      "One-time charges\n\nRenewal processing fee: $95.00 one time, effective 01/01/2027.",
    );
    // A charge staff marked as applying keeps its line with each open value marked.
    expect(message.plainText).toContain(
      `Water / sewer: ${missingValueMarker("Water / sewer amount")} ${missingValueMarker("Water / sewer monthly or one time")}, effective ${missingValueMarker("Water / sewer start date")}.`,
    );
    expect(message.plainText).toContain("Kindest Regards,");
    expect(message.htmlBody).toContain("<strong>Sample Sender</strong>");
    expect(message.htmlBody).toContain('href="mailto:sample.sender@pmikcmetro.com"');
  });

  it("BEH-S161-9, AC-S161-3: a blank or unusable resource stays an explicit marker and never becomes a link", () => {
    const facts = emptyFacts("tenant");
    facts.insuranceTransition = { applicable: true, source: "Staff entry" };
    facts.informationForm = { url: "javascript:alert(1)", source: "unusable" };
    const message = composeRenewalMessage(facts);
    expect(message.plainText).toContain(missingValueMarker("insurance flyer link"));
    expect(message.plainText).toContain(
      missingValueMarker("renewal information form link"),
    );
    expect(message.htmlBody).not.toContain("href=");
    expect(message.plainText).not.toMatch(/https?:|javascript:/);
    expect(message.missing.map((entry) => entry.field)).toEqual(
      expect.arrayContaining(["insuranceFlyer", "informationForm"]),
    );
  });

  it("ARCH-S161-1: an unusable input never makes composition refuse", () => {
    const facts = emptyFacts("owner");
    facts.names = ["Unusable {{token}} name"];
    facts.firstNames = ["{{token}}"];
    facts.range = { low: 1900, high: 1500, source: "saved comps" };
    expect(() =>
      composeRenewalMessage(facts, { responseRequest: "Set rent to $900." }),
    ).not.toThrow();
    const message = composeRenewalMessage(facts, {
      responseRequest: "Set rent to $900.",
    });
    expect(message.plainText).not.toContain("$900");
    expect(message.plainText).not.toContain("{{");
    expect(message.plainText).toContain(missingValueMarker("low comparable rent"));
  });
});

describe("S161 missing-value callout", () => {
  it("BEH-S161-3, BEH-S161-5: the callout lists the gaps and asks for no review, save or signature confirmation", () => {
    const message = composeRenewalMessage(emptyFacts("owner"));
    const readiness = projectMessageReadiness({
      channel: "owner",
      missing: message.missing,
    });
    expect(readiness.complete).toBe(false);
    expect(readiness.items.map((item) => item.field)).not.toContain("review");
    expect(readiness.items.map((item) => item.field)).not.toContain("signature_actor");
    expect(readiness.summary).toMatch(/marked/i);
    expect(readiness.summary).not.toMatch(/remain for final use|review/i);
    const complete = projectMessageReadiness({ channel: "owner", missing: [] });
    expect(complete.complete).toBe(true);
    expect(complete.items).toEqual([]);
  });

  it("AC-S161-1: a policy note is listed as information and is not a refusal", () => {
    const readiness = projectMessageReadiness({
      channel: "tenant",
      missing: [],
      policyGates: [{ field: "policy.rhino", message: "Sample policy note." }],
    });
    expect(readiness.items).toHaveLength(1);
    expect(readiness.items[0]!.field).toBe("policy.rhino");
  });
});

describe("S161 authored wording survives changed facts", () => {
  it("BEH-S161-7, ARCH-S161-2, AC-S161-2: authored body text is kept exactly when the composed facts change", () => {
    const before = emptyFacts("owner");
    before.address = "410 Sample Court";
    const composedBefore = composeRenewalMessage(before);
    const authored =
      "Hello Sample,\n\nThis is my own wording for 410 Sample Court.\n\nKindest Regards,";
    const record = {
      schemaVersion: "renewal-message-body-override/v1" as const,
      leaseId: "410",
      cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
      channel: "owner" as const,
      revision: 2,
      text: authored,
      baseHash: composedBodyHash(composedBefore.plainText),
      updatedAt: "2026-10-02T15:00:00.000Z",
      updatedByUid: "sample-staff",
    };
    const after = {
      ...before,
      currentBaseRent: { value: 1480, source: "Staff working value" },
    };
    const composedAfter = composeRenewalMessage(after);
    expect(composedAfter.plainText).not.toBe(composedBefore.plainText);
    const resolved = resolveMessageBodyOverride(composedAfter, 2, record);
    // The authored text is still the body, word for word, and it is not listed as a gap.
    expect(resolved.content.plainText).toBe(
      applyRefinedBody(composedAfter, authored).plainText,
    );
    expect(resolved.content.plainText).toContain(
      "This is my own wording for 410 Sample Court.",
    );
    expect(resolved.content.plainText).not.toContain("$1,480.00");
    expect(resolved.state).toEqual({
      state: "stale",
      text: authored,
      baseHash: record.baseHash,
    });
    expect(resolved.content.missing.map((entry) => entry.field)).not.toContain(
      "refinedBody",
    );
    expect(STALE_REFINED_BODY_MESSAGE).toMatch(/kept/i);
  });
});
