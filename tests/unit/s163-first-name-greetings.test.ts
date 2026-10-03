import { describe, expect, it } from "vitest";

import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import {
  greetingPartyNames,
  projectRenewalDeskIdentity,
} from "@/lib/lease-renewal/desk-identity";
import { resolveSeparatedRenewalDraftRecipient } from "@/lib/lease-renewal/execution/renewal-draft-preview";
import {
  composeRenewalMessage,
  greetingFirstNames,
  MESSAGE_CHARGES,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { applyRefinedBody } from "@/lib/lease-renewal/refined-message";
import { renewalRefinementProtectedPhrases } from "@/lib/email-refinement/context";

// S163: greetings use the first names the lease roster records, for owners and tenants alike. A
// first name is never split out of a display or company name, a person without one is named in the
// callout, and recipients are untouched. All names and addresses are synthetic.

function facts(
  channel: "owner" | "tenant",
  names: string[],
  firstNames: Array<string | null>,
): RenewalMessageFacts {
  return {
    channel,
    names,
    firstNames,
    address: "88 Sample Row",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
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

function leaseView() {
  const [view] = leaseViewsFromExport([
    {
      lease: {
        leaseID: 8800,
        tenants: [
          {
            contactID: 11,
            firstName: "Jordan",
            lastName: "Sampleton",
            email: "jordan.s@fixture-rental.net",
          },
          {
            contactID: 12,
            name: "Riley Q Sampleton",
            email: "riley.s@fixture-rental.net",
          },
        ],
      },
      property: { streetNumber: "88", streetName: "Sample Row" },
      portfolio: {
        owners: [
          {
            contactID: 21,
            name: "Avery Example-Owner",
            firstName: "Avery",
            email: "avery.o@fixture-rental.net",
          },
          {
            contactID: 22,
            companyName: "Sample Row Holdings LLC",
            email: "office@fixture-rental.net",
          },
        ],
      },
      unit: { rent: "1400.00" },
    },
  ]);
  return view!;
}

describe("S163 first-name greetings", () => {
  it("BEH-S163-1, ARCH-S163-1: an owner greeting uses the recorded first name, not the full name", () => {
    const message = composeRenewalMessage(
      facts("owner", ["Avery Example-Owner"], ["Avery"]),
    );
    expect(message.plainText.split("\n\n")[0]).toBe("Hello Avery,");
    expect(message.plainText).not.toContain("Example-Owner");
    expect(message.missing.map((entry) => entry.field)).not.toContain("names");
  });

  it("BEH-S163-2, BEH-S163-3, AC-S163-1: tenants get the same behavior and several people keep the existing joining", () => {
    const message = composeRenewalMessage(
      facts(
        "tenant",
        ["Jordan Sampleton", "Casey Sampleton", "Devon Sampleton"],
        ["Jordan", "Casey", "Devon"],
      ),
    );
    expect(message.plainText.split("\n\n")[0]).toBe("Hello Jordan and Casey and Devon,");
    expect(message.htmlBody).toContain("Hello Jordan and Casey and Devon,");
  });

  it("BEH-S163-4, BEH-S163-5, AC-S163-2: a display or company name is never split; the greeting stays honest and the message still composes", () => {
    const company = composeRenewalMessage(
      facts("owner", ["Sample Row Holdings LLC"], [null]),
    );
    expect(company.plainText.split("\n\n")[0]).toBe("Hello,");
    expect(company.plainText).not.toMatch(/Hello Sample/);
    expect(company.missing).toContainEqual({
      field: "names",
      message:
        "No first name is recorded for Sample Row Holdings LLC, so the greeting is general.",
    });
    // No first-name list at all is the same as none recorded: nothing is taken from the label.
    const unlisted = composeRenewalMessage({
      ...facts("tenant", ["Riley Q Sampleton"], []),
      firstNames: undefined,
    });
    expect(unlisted.plainText.split("\n\n")[0]).toBe("Hello,");
    const mixed = composeRenewalMessage(
      facts("tenant", ["Jordan Sampleton", "Riley Q Sampleton"], ["Jordan", null]),
    );
    expect(mixed.plainText.split("\n\n")[0]).toBe("Hello Jordan,");
    expect(mixed.missing).toContainEqual({
      field: "names",
      message:
        "No first name is recorded for Riley Q Sampleton, so the greeting leaves that name out.",
    });
    expect(
      greetingFirstNames({ names: ["Riley Q Sampleton"], firstNames: [null] }),
    ).toEqual({ known: [], unknown: ["Riley Q Sampleton"] });
  });

  it("BEH-S163-1, BEH-S163-4: the roster projection carries the provider's first-name field and nothing derived", () => {
    const identity = projectRenewalDeskIdentity(leaseView());
    expect(identity.tenants[0]!.firstName).toEqual({
      label: "Jordan",
      sourceRef: "rentvine:lease:8800:tenants[0].firstName",
    });
    expect(identity.tenants[1]!.firstName).toBeUndefined();
    expect(identity.owners[0]!.firstName?.label).toBe("Avery");
    expect(identity.owners[1]!.firstName).toBeUndefined();
    expect(greetingPartyNames(identity.tenants)).toEqual({
      names: ["Jordan Sampleton", "Riley Q Sampleton"],
      firstNames: ["Jordan", null],
    });
    expect(greetingPartyNames(identity.owners)).toEqual({
      names: ["Avery Example-Owner", "Sample Row Holdings LLC"],
      firstNames: ["Avery", null],
    });
  });

  it("BEH-S163-6, AC-S163-3: an edited greeting is authored wording and stays exactly as written when the roster changes", () => {
    const before = composeRenewalMessage(
      facts("tenant", ["Jordan Sampleton"], ["Jordan"]),
    );
    const authored = before.plainText.replace("Hello Jordan,", "Hi Jordan and Riley,");
    const after = composeRenewalMessage(
      facts("tenant", ["Jordan Sampleton", "Casey Sampleton"], ["Jordan", "Casey"]),
    );
    expect(after.plainText.split("\n\n")[0]).toBe("Hello Jordan and Casey,");
    const shown = applyRefinedBody(after, authored);
    expect(shown.plainText.split("\n\n")[0]).toBe("Hi Jordan and Riley,");
  });

  it("BEH-S163-7, ARCH-S163-2, AC-S163-1, AC-S163-3: first names change nothing about To and Cc", () => {
    const lease = leaseView();
    const withoutFirstNames = JSON.parse(JSON.stringify(lease)) as typeof lease;
    for (const tenant of withoutFirstNames.tenants as Array<Record<string, unknown>>)
      delete tenant.firstName;
    for (const channel of ["owner", "tenant"] as const) {
      const first = resolveSeparatedRenewalDraftRecipient({ lease, channel });
      const second = resolveSeparatedRenewalDraftRecipient({
        lease: withoutFirstNames,
        channel,
      });
      expect(first.status).toBe("ready");
      expect(second).toEqual(first);
      if (first.status !== "ready") throw new Error("expected resolved recipients");
      expect([first.resolution.to, ...(first.resolution.cc ?? [])]).toHaveLength(2);
    }
  });

  it("BEH-S163-5: refinement protects the greeting's first names, the address and the sender name", () => {
    const tenant = facts(
      "tenant",
      ["Jordan Sampleton", "Riley Q Sampleton"],
      ["Jordan", null],
    );
    tenant.signature = {
      name: "Sample Sender",
      email: "sample.sender@pmikcmetro.com",
      role: null,
      phone: null,
      hours: null,
      website: null,
      source: "managed:sample",
    };
    expect(renewalRefinementProtectedPhrases(tenant)).toEqual([
      "Jordan",
      "88 Sample Row",
      "Sample Sender",
    ]);
  });
});
