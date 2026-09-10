import { describe, expect, it } from "vitest";
import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";

function facts(channel: "owner" | "tenant"): RenewalMessageFacts {
  return {
    channel,
    names: ["Example <Tenant>"],
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
    expect(message.htmlBody).toContain("Example &lt;Tenant&gt;");
    expect(message.htmlBody).not.toContain("<Tenant>");
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
    input.charges.push(input.charges.find((charge) => charge.id === "insurance")!);
    expect(() => composeRenewalMessage(input)).toThrow(/only once/);
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
    expect(message.plainText).toContain("Your lease ends on 2026-10-31");
    expect(message.plainText).not.toMatch(
      /https:|\{\{|placeholder|example-staff@|\$1,150|Resident Benefits Package:/,
    );
    expect(message.htmlBody).not.toContain("href=");
  });

  it("keeps edited prose separate from facts and refuses executable or unresolved link content", () => {
    expect(
      composeRenewalMessage(facts("owner"), {
        responseRequest: "Please share your preferred next step.",
      }).plainText,
    ).toContain("Please share your preferred next step.");
    expect(() =>
      composeRenewalMessage(facts("owner"), { responseRequest: "Set rent to $900." }),
    ).toThrow();
    const input = facts("tenant");
    input.informationForm = { url: "javascript:alert(1)", source: "reviewed:invalid" };
    expect(() => composeRenewalMessage(input)).toThrow();
    input.informationForm.url = "https://user:secret@example.invalid/form";
    expect(() => composeRenewalMessage(input)).toThrow();
  });
});
