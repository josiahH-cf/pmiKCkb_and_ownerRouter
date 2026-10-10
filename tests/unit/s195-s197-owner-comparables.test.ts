import { projectMessageMarketEvidence } from "@/lib/lease-renewal/message-market-evidence";
import { communicationMessageFromRenewalContent } from "@/lib/gmail-hub/renewal-composition";
import { renderCommunicationMessage } from "@/lib/gmail-hub/sequence-model";
import { describe, it, expect } from "vitest";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
const facts = (): RenewalMessageFacts => ({
  channel: "owner",
  names: ["Synthetic owner"],
  firstNames: ["Synthetic"],
  address: "123 Test Lane",
  currentBaseRent: { value: 1111, source: "fixture:rent" },
  leaseEndDate: "2026-12-31",
  ownerTerms: null,
  range: { low: 1200, high: 2100, source: "fixture:observation" },
  suggestedRent: { value: 1250, source: "fixture:reviewed" },
  comps: [1600, 0, 1200, 2100, 1500, 1400, 1800, 1900].map((rent, index) => ({
    address: `Provider order ${index}`,
    rent,
    source: "fixture:observation",
    distanceMiles: index === 0 ? 1.26 : index === 2 ? 0 : undefined,
  })),
  trend: null,
  sparseCompsQualification: null,
  charges: [],
  insuranceTransition: null,
  leaseOrigin: null,
  otherChargesComparison: null,
  informationForm: null,
  insuranceFlyer: null,
  rbpFlyer: null,
  signature: null,
  attachments: [],
});
describe("S195/S197 exact owner comparable presentation", () => {
  it("shows only the first five usable entries in provider order while keeping the full retained input", () => {
    const input = facts(),
      before = structuredClone(input);
    const message = composeRenewalMessage(input);
    expect(message.plainText.match(/Provider order \d/g)).toEqual([
      "Provider order 0",
      "Provider order 2",
      "Provider order 3",
      "Provider order 4",
      "Provider order 5",
    ]);
    expect(message.htmlBody).not.toContain("Provider order 6");
    expect(input).toEqual(before);
  });
  it("displays distance to one decimal, retaining precision and distinguishing unknown from zero", () => {
    const input = facts();
    const output = composeRenewalMessage(input);
    expect(output.plainText).toContain("1.3 mi");
    expect(output.htmlBody).toContain("0.0 mi");
    expect(output.plainText).toContain("distance unavailable");
    expect(input.comps[0].distanceMiles).toBe(1.26);
  });
  it("keeps the property address and dollar values bold through HTML while plain text remains continuous", () => {
    const output = composeRenewalMessage(facts());
    expect(output.htmlBody).toContain("<strong>123 Test Lane</strong>");
    expect(output.htmlBody).toContain("<strong>$1,111.00</strong>");
    expect(output.plainText).toContain("We have a renewal coming up for 123 Test Lane.");
    expect(output.plainText).toContain(
      "We are currently charging them $1,111.00 per month.",
    );
    expect(output.plainText).not.toMatch(/<strong>|\*\*/);
  });
});

it("S197 composed HTML/plain meaning survives the actual Communications handoff, including styled links and signature lines", () => {
  const input = facts();
  input.comps[0].url = "https://example.invalid/comparable";
  input.signature = {
    name: "Synthetic Staff",
    email: "synthetic@pmikcmetro.com",
    role: "Property manager",
    phone: null,
    hours: null,
    website: null,
    source: "fixture:managed-profile",
  };
  const content = composeRenewalMessage(input),
    output = renderCommunicationMessage(communicationMessageFromRenewalContent(content));
  expect(output.plainText).toBe(content.plainText);
  expect(output.plainText.match(/https:\/\/example.invalid\/comparable/g)).toHaveLength(
    1,
  );
  expect(
    output.htmlBody.match(/href="https:\/\/example.invalid\/comparable"/g),
  ).toHaveLength(1);
  expect(output.htmlBody).toContain("<strong>123 Test Lane</strong>");
  expect(output.htmlBody).toContain("<strong>$1,600.00</strong>");
  expect(output.plainText).toContain(
    "Synthetic Staff\nProperty manager\nsynthetic@pmikcmetro.com",
  );
  expect(output.plainText).not.toContain("mailto:");
});

it("S183/S195 one staff-selected working offer reaches the new owner message without a second number approval", () => {
  const preparation = {
    market: {
      pmiNumber: 1550,
      recommendationBasis: "provider" as const,
      provider: {
        source: "RentCast",
        rangeLow: 1450,
        rangeHigh: 1650,
        pointEstimate: 1550,
        compCount: 3,
        retrievedAt: "2026-10-09T12:00:00Z",
      },
    },
    source: "Retained observation",
    recordedAt: "2026-10-09T12:00:00Z",
    recordedByUid: "operator",
    revision: 1,
  };
  const evidence = projectMessageMarketEvidence({
    preparation,
    currentBaseRent: 1200,
    approvedSuggestionValue: null,
    selectedWorkingOffer: { value: 1300, source: "Working renewal terms" },
  });
  expect(evidence.suggestedRent).toMatchObject({
    value: 1300,
    kind: "working_offer",
    source: "Working renewal terms",
  });
  expect(evidence.notices).toEqual([]);
  const reference = projectMessageMarketEvidence({
    preparation,
    currentBaseRent: 1200,
    approvedSuggestionValue: null,
  });
  expect(reference.suggestedRent).toMatchObject({
    value: 1550,
    kind: "provider_reference",
  });
});
