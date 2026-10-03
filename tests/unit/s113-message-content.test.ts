import { describe, expect, it } from "vitest";
import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  missingValueMarker,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";

// S113 supplied content as carried into S161/S163: the greeting uses recorded first names, an
// absent value is a named marker instead of a withheld paragraph, and composition never refuses.

function facts(channel: "owner" | "tenant"): RenewalMessageFacts {
  return {
    channel,
    names: ["Example <Tenant>"],
    firstNames: ["Example <First>"],
    address: "123 Fixture Lane",
    currentBaseRent: { value: 1100, source: "reviewed:base-rent" },
    leaseEndDate: "2026-10-31",
    ownerTerms: {
      rent: 1150,
      effectiveDate: "2026-11-01",
      endDate: "2027-10-31",
      source: "staff:exact-owner-approval",
    },
    range: { low: 1100, high: 1300, source: "staff:analysis" },
    suggestedRent: null,
    comps: [
      {
        address: "Verified comp <one>",
        rent: 1200,
        source: "reviewed:comp",
        url: "https://example.invalid/comp",
      },
    ],
    trend: null,
    sparseCompsQualification: null,
    charges: Object.keys(MESSAGE_CHARGES).map((id) => ({
      id: id as keyof typeof MESSAGE_CHARGES,
      applicable: false,
      amount: null,
      cadence: null,
      effectiveDate: null,
      source: "reviewed:charge-inventory",
      comparison: "unchanged",
    })),
    insuranceTransition: null,
    leaseOrigin: { kind: "pmi", source: "reviewed:original-lease" },
    otherChargesComparison: null,
    informationForm: {
      url: "https://example.invalid/verified-form",
      source: "reviewed:form",
    },
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: {
      name: "Example Staff",
      email: "example-staff@pmikcmetro.com",
      role: "PMI KC Metro",
      phone: null,
      hours: null,
      website: null,
      source: "managed:current-staff",
    },
    attachments: [],
  };
}

describe("S113 supplied message content", () => {
  it("renders supplied owner paragraphs and safe equivalent rich/plain copy without a mailbox", () => {
    const message = composeRenewalMessage(facts("owner"));
    expect(message.missing).toEqual([]);
    expect(message.plainText).toContain(
      "We are currently charging them $1,100.00 per month.",
    );
    expect(message.plainText).toContain(
      "inevitable increases in insurance and property taxes",
    );
    expect(message.plainText).toContain(
      "Verified comp <one> — $1,200.00 per month: https://example.invalid/comp",
    );
    expect(message.htmlBody).toContain("Hello Example &lt;First&gt;,");
    expect(message.htmlBody).not.toContain("<First>");
    expect(message.plainText).not.toContain("Example <Tenant>");
    expect(message.htmlBody).toContain("<strong>Example Staff</strong>");
    expect(message.plainText.match(/Example Staff/g)).toHaveLength(1);
    expect(message.plainText).not.toMatch(
      /attached|Needs Verification|\{\{|print|forwarded/i,
    );
  });

  it("includes each applicable charge once, groups cadence and requires actual comparison for unchanged wording", () => {
    const input = facts("tenant");
    input.charges = input.charges.map((charge) =>
      charge.id === "insurance"
        ? {
            ...charge,
            applicable: true,
            amount: 12.34,
            cadence: "monthly",
            effectiveDate: "2026-11-01",
            comparison: "changed",
          }
        : charge.id === "renewal_processing"
          ? {
              ...charge,
              applicable: true,
              amount: 99,
              cadence: "one_time",
              effectiveDate: "2026-11-01",
              comparison: "new",
            }
          : charge,
    );
    input.insuranceTransition = {
      applicable: true,
      source: "reviewed:applicable-policy",
    };
    input.insuranceFlyer = {
      url: "https://example.invalid/verified-flyer",
      source: "reviewed:flyer",
    };
    let message = composeRenewalMessage(input);
    expect(message.missing).toEqual([]);
    expect(message.plainText).toContain("10/31/2026");
    expect(message.plainText).toContain("11/01/2026");
    expect(message.plainText).toContain("10/31/2027");
    expect(message.htmlBody).toContain("11/01/2026");
    expect(message.plainText).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(input.leaseEndDate).toBe("2026-10-31");
    expect(input.ownerTerms?.effectiveDate).toBe("2026-11-01");
    expect(input.charges.find((charge) => charge.id === "insurance")?.effectiveDate).toBe(
      "2026-11-01",
    );
    expect(message.plainText.match(/Insurance: \$12.34/g)).toHaveLength(1);
    expect(message.plainText).toContain(
      "One-time charges\n\nRenewal processing fee: $99.00 one time",
    );
    expect(message.plainText).not.toContain("All other charges stay the same.");
    input.otherChargesComparison = {
      unchanged: true,
      source: "reviewed:remaining-terms-comparison",
    };
    message = composeRenewalMessage(input);
    expect(message.plainText.match(/All other charges stay the same./g)).toHaveLength(1);
    // S161: a repeated charge is listed once; composition never refuses.
    input.charges.push(input.charges.find((charge) => charge.id === "insurance")!);
    expect(
      composeRenewalMessage(input).plainText.match(/Insurance: \$12.34/g),
    ).toHaveLength(1);
  });

  it("keeps useful preparation with blank links, missing signatures, unavailable terms and unresolved charges", () => {
    const input = facts("tenant");
    input.informationForm = null;
    input.signature = null;
    input.ownerTerms = null;
    input.charges[0] = { ...input.charges[0], applicable: true };
    const message = composeRenewalMessage(input);
    expect(message.missing.map((value) => value.field)).toEqual(
      expect.arrayContaining([
        "informationForm",
        "signature",
        "ownerTerms",
        "charge.rbp",
      ]),
    );
    expect(message.plainText).toContain("Your lease ends on 10/31/2026");
    // S161: each absent value is a named marker; nothing is invented and no link is made up.
    expect(message.plainText).toContain(missingValueMarker("renewal rent"));
    expect(message.plainText).toContain(missingValueMarker("sender signature"));
    expect(message.plainText).toContain(
      missingValueMarker("renewal information form link"),
    );
    expect(message.plainText).toContain(
      `Resident Benefits Package: ${missingValueMarker("Resident Benefits Package amount")}`,
    );
    expect(message.plainText).not.toMatch(
      /https:|\{\{|placeholder|example-staff@|\$1,150/,
    );
    expect(message.htmlBody).not.toContain("href=");
  });

  it("keeps edited prose separate from facts and never renders executable or unresolved link content", () => {
    expect(
      composeRenewalMessage(facts("owner"), {
        responseRequest: "Please share your preferred next step.",
      }).plainText,
    ).toContain("Please share your preferred next step.");
    // S161: refused prose keeps the approved paragraph; an unusable link becomes its marker.
    const refused = composeRenewalMessage(facts("owner"), {
      responseRequest: "Set rent to $900.",
    });
    expect(refused.plainText).not.toContain("$900");
    expect(refused.missing.map((value) => value.field)).toContain("responseRequest");
    const input = facts("tenant");
    input.informationForm = { url: "javascript:alert(1)", source: "reviewed:invalid" };
    let message = composeRenewalMessage(input);
    expect(message.plainText).not.toContain("javascript:");
    expect(message.plainText).toContain(
      missingValueMarker("renewal information form link"),
    );
    input.informationForm.url = "https://user:secret@example.invalid/form";
    message = composeRenewalMessage(input);
    expect(message.plainText).not.toContain("secret");
    expect(message.htmlBody).not.toContain('href="https://user');
  });
});
