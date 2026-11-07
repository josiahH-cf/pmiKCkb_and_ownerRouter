import { describe, expect, it } from "vitest";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  outgoingRenewalReasons,
  SIGNATURE_SETUP_REQUIRED,
} from "@/lib/lease-renewal/outgoing-message-readiness";
import { communicationMessageFromRenewalContent } from "@/lib/gmail-hub/renewal-composition";
import { renderCommunicationMessage } from "@/lib/gmail-hub/sequence-model";

const facts: RenewalMessageFacts = {
  channel: "owner",
  outgoingContract: true,
  ownerIntent: "renew_or_not",
  signatureConfigured: true,
  names: [],
  address: "Synthetic lease",
  currentBaseRent: null,
  leaseEndDate: null,
  ownerTerms: null,
  range: null,
  suggestedRent: null,
  comps: [],
  sparseCompsQualification: null,
  trend: null,
  charges: [],
  insuranceTransition: null,
  leaseOrigin: null,
  otherChargesComparison: null,
  insuranceFlyer: null,
  informationForm: null,
  rbpFlyer: null,
  signature: null,
  attachments: [],
};

describe("S224 and S249 outgoing renewal facts", () => {
  it("keeps the assisted renewal question ready before rent with a saved blank signature", () => {
    const content = composeRenewalMessage(facts);
    expect(content.plainText).toContain("Would you like to renew");
    expect(content.missing.map((value) => value.field)).not.toContain("signature");
    expect(
      outgoingRenewalReasons({ content, signatureConfigured: true, reply: false }),
    ).toEqual([]);
    expect(
      outgoingRenewalReasons({ content, signatureConfigured: false, reply: false }),
    ).toEqual([SIGNATURE_SETUP_REQUIRED]);
    expect(
      renderCommunicationMessage(communicationMessageFromRenewalContent(content)),
    ).toEqual({
      plainText: content.plainText,
      htmlBody: content.htmlBody,
    });
  });

  it("keeps a working recommendation copyable but cannot release it without the rent it uses", () => {
    const content = composeRenewalMessage({ ...facts, ownerIntent: "recommend_rent" });
    expect(content.plainText).toContain("rent to recommend");
    expect(
      outgoingRenewalReasons({ content, signatureConfigured: true, reply: false }),
    ).toContain("Enter the rent to recommend before releasing the owner message.");
    expect(
      outgoingRenewalReasons({ content, signatureConfigured: true, reply: true }),
    ).toEqual([]);
  });
});
