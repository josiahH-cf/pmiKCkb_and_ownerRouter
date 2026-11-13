import { describe, expect, it } from "vitest";

import {
  MESSAGE_CHARGES,
  OWNER_RENEWAL_COPY_V2_1,
  SUPPLIED_RENEWAL_COPY,
  composeRenewalMessage,
  responseRequestParagraph,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { outgoingRenewalReasons } from "@/lib/lease-renewal/outgoing-message-readiness";
import {
  ENTER_RENEWAL_DATES_LABEL,
  WORKING_END_FIELD_ID,
  WORKING_START_FIELD_ID,
  projectMessageReadiness,
} from "@/lib/lease-renewal/message-readiness";
import {
  KICKOFF_FIX_TARGETS,
  projectRenewalPreparation,
  sendReady,
  withLiveKickoff,
  type RenewalKickoffFacts,
} from "@/lib/lease-renewal/renewal-preparation";
import {
  OWNER_TERM_INPUT_KEYS,
  OWNER_WORDING_READY_LINE,
  OWNER_WORDING_UPDATED_LINE,
  isOwnerWordingChange,
  ownerCopyVersionInUse,
  ownerTermContentBasis,
  ownerWordingPublishConsequence,
} from "@/lib/lease-renewal/owner-copy-version";
import { renewalReviewedInputs } from "@/lib/gmail-hub/renewal-reviewed-inputs";
import {
  OWNER_WORDING_UPDATED_INPUT,
  changedInputLine,
  changedReviewedInputs,
  reviewedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import { predatesChangeLine } from "@/lib/gmail-hub/communication-state";
import { unsentDifferenceLine } from "@/lib/lease-renewal/unsent-message";
import { sequenceHash } from "@/lib/gmail-hub/sequence-store";
import { heldOnOwnerWordingPublish } from "@/lib/firestore/renewal-owner-copy-publication";
import { ownerCopyV21Publication } from "@/lib/firestore/renewal-owner-copy-document";
import { suppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";

// S285 R-S285-2, R-S285-3 and R-S285-6 (ARCH-S285-2, BEH-S285-2, AC-S285-2): owner copy v2.1 states
// the proposed term after the recommendation and asks about the rent and the term; v2.0 is
// unchanged and stays in use until v2.1's own publication reads back approved; under v2.1 a missing
// date holds Review, Schedule and the Gmail draft with one "Renewal dates" line, and the dates join
// the reviewed content basis. Synthetic values only.

const TERM_SENTENCE = "The renewal term would run from 01/01/2027 through 12/31/2027.";
const RECOMMENDATION = "Our reviewed rental analysis suggests $1,425.00 per month.";

function ownerFacts(overrides: Partial<RenewalMessageFacts> = {}): RenewalMessageFacts {
  return {
    outgoingContract: true,
    ownerIntent: "recommend_rent",
    signatureConfigured: true,
    channel: "owner",
    names: ["Jordan Sample"],
    firstNames: ["Jordan"],
    address: "101 Sample Pl",
    currentBaseRent: { value: 1400, source: "reviewed:base-rent" },
    leaseEndDate: "2026-12-31",
    ownerTerms: {
      rent: null,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      source: "Working renewal terms",
    },
    range: { low: 1350, high: 1500, source: "RentCast comparison" },
    suggestedRent: {
      value: 1425,
      source: "Comparable-rent recommendation",
      kind: "proposal",
    },
    comps: [
      {
        address: "Comparable 1",
        rent: 1420,
        source: "reviewed:comp",
        url: "https://example.invalid/comp-1",
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
      comparison: "unchanged" as const,
    })),
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: {
      name: "Example Staff",
      email: "example-staff@pmikcmetro.com",
      role: null,
      phone: null,
      hours: null,
      website: null,
      source: "managed:current-staff",
    },
    attachments: [],
    ...overrides,
  };
}

describe("AC-S285-2 v2.0 stays in use until v2.1 reads back approved", () => {
  it("R-S285-6: the copy in use is the newest approved version, and the renew-or-not question keeps v2.0", () => {
    expect(
      ownerCopyVersionInUse({ v21Approved: false, ownerIntent: "recommend_rent" }),
    ).toBe("v2.0");
    expect(
      ownerCopyVersionInUse({ v21Approved: true, ownerIntent: "recommend_rent" }),
    ).toBe("v2.1");
    expect(
      ownerCopyVersionInUse({ v21Approved: true, ownerIntent: "renew_or_not" }),
    ).toBe("v2.0");
  });

  it("AC-S285-2: under v2.0 the owner message is exactly as before: no term sentence and no Renewal dates line", () => {
    const before = composeRenewalMessage(ownerFacts({ ownerCopyVersion: undefined }));
    const v20 = composeRenewalMessage(ownerFacts({ ownerCopyVersion: "v2.0" }));
    expect(v20).toEqual(before);
    expect(v20.version).toBe("v2.0");
    expect(v20.plainText).not.toContain("The renewal term would run");
    expect(v20.plainText).toContain(SUPPLIED_RENEWAL_COPY.owner.request);
    // With no dates saved, v2.0 holds nothing for them.
    const noDates = composeRenewalMessage(
      ownerFacts({ ownerCopyVersion: "v2.0", ownerTerms: null }),
    );
    expect(noDates.missing.some((entry) => entry.field.startsWith("renewalDates"))).toBe(
      false,
    );
  });

  it("AC-S285-2: v2.1 is its own record with its own name and hash; v2.0's record is unchanged", () => {
    const v20 = suppliedRenewalPublication("owner");
    const v21 = ownerCopyV21Publication();
    expect(v21.name).not.toBe(v20.name);
    expect(v21.contentHash).not.toBe(v20.contentHash);
    expect(v20.name).toBe("Renewal owner — supplied September 10 2026 v2.0");
    expect(v21.name).toBe("Renewal owner — rent and term ask November 12 2026 v2.1");
    expect(JSON.parse(v20.body).copy.request).toBe(SUPPLIED_RENEWAL_COPY.owner.request);
    expect(JSON.parse(v21.body).copy.request).toBe(OWNER_RENEWAL_COPY_V2_1.owner.request);
    // The draft path's governed family is unchanged; the record names its own copy version.
    expect(v21.ref).toBe("owner-renewal:v2.0");
    expect(v21.copyRef).toBe("owner-renewal:v2.1");
  });
});

describe("BEH-S285-2 v2.1 states the term and asks about the rent and the term", () => {
  it("BEH-S285-2: the term sentence follows the recommendation once, in the HTML and the plain text", () => {
    const content = composeRenewalMessage(ownerFacts({ ownerCopyVersion: "v2.1" }));
    expect(content.version).toBe("v2.1");
    const text = content.plainText;
    expect(text.split(TERM_SENTENCE)).toHaveLength(2);
    expect(text.indexOf(TERM_SENTENCE)).toBeGreaterThan(text.indexOf(RECOMMENDATION));
    expect(text.indexOf(TERM_SENTENCE)).toBeLessThan(
      text.indexOf(SUPPLIED_RENEWAL_COPY.owner.consideration),
    );
    expect(content.htmlBody.split(TERM_SENTENCE)).toHaveLength(2);
    expect(text).toContain(OWNER_RENEWAL_COPY_V2_1.owner.request);
    expect(OWNER_RENEWAL_COPY_V2_1.owner.request).toBe(
      "Take a look below at similar units currently available in that price range and let us know how you want to proceed with this year's rent and whether the renewal term works for you.",
    );
    expect(content.missing.some((entry) => entry.field.startsWith("renewalDates"))).toBe(
      false,
    );
  });

  it("AC-S285-2: a custom response request keeps the term sentence", () => {
    const content = composeRenewalMessage(ownerFacts({ ownerCopyVersion: "v2.1" }), {
      responseRequest: "Let us know how you want to proceed.",
    });
    expect(content.plainText).toContain("Let us know how you want to proceed.");
    expect(content.plainText).not.toContain(OWNER_RENEWAL_COPY_V2_1.owner.request);
    expect(content.plainText.split(TERM_SENTENCE)).toHaveLength(2);
    expect(responseRequestParagraph("owner", { responseRequest: "" }, "v2.1").text).toBe(
      OWNER_RENEWAL_COPY_V2_1.owner.request,
    );
    expect(responseRequestParagraph("owner", { responseRequest: "" }).text).toBe(
      SUPPLIED_RENEWAL_COPY.owner.request,
    );
  });

  it("AC-S285-2: an assisted (renew or not) owner message and the tenant offer are unchanged under either version", () => {
    const assisted = (version: "v2.0" | "v2.1") =>
      composeRenewalMessage(
        ownerFacts({ ownerIntent: "renew_or_not", ownerCopyVersion: version }),
      );
    expect(assisted("v2.1")).toEqual(assisted("v2.0"));
    expect(assisted("v2.1").plainText).not.toContain("The renewal term would run");
    const tenant = (version: "v2.0" | "v2.1") =>
      composeRenewalMessage(ownerFacts({ channel: "tenant", ownerCopyVersion: version }));
    expect(tenant("v2.1")).toEqual(tenant("v2.0"));
  });
});

describe("BEH-S285-2 / R-S285-3 the renewal dates before the owner review", () => {
  it("BEH-S285-2: with no dates saved, the readiness list shows 'Renewal dates: enter the start and end' and the review is held", () => {
    const content = composeRenewalMessage(
      ownerFacts({ ownerCopyVersion: "v2.1", ownerTerms: null }),
    );
    const entry = content.missing.find((item) => item.field === "renewalDates");
    expect(entry?.message).toBe("Renewal dates: enter the start and end");
    expect(content.plainText).toContain(
      "The renewal term would run from [Needs Verification: renewal start date] through [Needs Verification: renewal end date].",
    );
    // Held as a missing amount is: an outgoing reason for Review, Schedule and the Gmail draft.
    expect(
      outgoingRenewalReasons({ content, signatureConfigured: true, reply: false }),
    ).toContain("Renewal dates: enter the start and end");
    // Its fix opens the Working renewal terms editor at the start.
    const readiness = projectMessageReadiness({
      channel: "owner",
      missing: content.missing,
    });
    expect(readiness.items.find((item) => item.field === "renewalDates")?.target).toEqual(
      {
        kind: "control",
        id: WORKING_START_FIELD_ID,
        label: ENTER_RENEWAL_DATES_LABEL,
      },
    );
  });

  it("R-S285-3: with only the end missing, the same line opens the end", () => {
    const content = composeRenewalMessage(
      ownerFacts({
        ownerCopyVersion: "v2.1",
        ownerTerms: {
          rent: null,
          effectiveDate: "2027-01-01",
          endDate: null,
          source: "Working renewal terms",
        },
      }),
    );
    const entry = content.missing.find((item) => item.field === "renewalDates.end");
    expect(entry?.message).toBe("Renewal dates: enter the start and end");
    const readiness = projectMessageReadiness({
      channel: "owner",
      missing: content.missing,
    });
    expect(
      readiness.items.find((item) => item.field === "renewalDates.end")?.target,
    ).toMatchObject({ id: WORKING_END_FIELD_ID });
  });

  it("R-S285-3: the Now card gains 'Renewal dates' only while the copy states the term", () => {
    const facts: RenewalKickoffFacts = {
      numbers: {
        contractualRent: 1400,
        rentCharges: [1400],
        leaseEndIso: "2026-12-31",
        workingRent: null,
        sheetRent: null,
        sheetEndIso: null,
        sourceReadable: true,
      },
      comparison: { state: "none" },
      typedRent: 1425,
      agreementRent: null,
      currentRent: 1400,
      address: "101 Sample Pl",
      ownerRecipient: { state: "ready" },
      signature: true,
      templateApproved: true,
    };
    const preparation = projectRenewalPreparation(facts);
    const v20 = withLiveKickoff(preparation, { typedRent: 1425, marked: [] });
    expect(v20.items.some((item) => item.key === "renewal_dates")).toBe(false);
    const missing = withLiveKickoff(preparation, {
      typedRent: 1425,
      marked: ["renewal start date", "renewal end date"],
      renewalDates: { start: null, end: null },
    });
    const item = missing.items.find((entry) => entry.key === "renewal_dates");
    expect(item).toMatchObject({
      label: "Renewal dates",
      ready: false,
      line: "Renewal dates: enter the start and end",
      fix: { label: "Enter the renewal dates", target: KICKOFF_FIX_TARGETS.renewalStart },
    });
    // The term sentence's markers are that line's, not a second marked-values line.
    expect(missing.items.find((entry) => entry.key === "marked_values")?.ready).toBe(
      true,
    );
    expect(sendReady(missing)).toBe(false);
    const ready = withLiveKickoff(preparation, {
      typedRent: 1425,
      marked: [],
      renewalDates: { start: "2027-01-01", end: "2027-12-31" },
    });
    expect(ready.items.find((entry) => entry.key === "renewal_dates")?.ready).toBe(true);
    expect(sendReady(ready)).toBe(true);
  });

  it("ARCH-S285-2: the dates join the owner content basis only under v2.1, so a v2.0 digest is unchanged", () => {
    const terms = { effectiveDate: "2027-01-01", endDate: "2027-12-31" };
    expect(ownerTermContentBasis("v2.0", terms)).toEqual({});
    expect(ownerTermContentBasis(undefined, terms)).toEqual({});
    expect(ownerTermContentBasis("v2.1", terms)).toEqual({
      term: { start: "2027-01-01", end: "2027-12-31" },
    });
    const base = {
      address: "101 Sample Pl",
      publication: "p".repeat(64),
      ownerIntent: "recommend_rent",
      currentRent: 1400,
      rent: 1425,
      range: { low: 1350, high: 1500 },
    };
    expect(sequenceHash({ ...base, ...ownerTermContentBasis("v2.0", terms) })).toBe(
      sequenceHash(base),
    );
    // A later date change moves the v2.1 content basis.
    expect(sequenceHash({ ...base, ...ownerTermContentBasis("v2.1", terms) })).not.toBe(
      sequenceHash({
        ...base,
        ...ownerTermContentBasis("v2.1", { ...terms, endDate: "2027-06-30" }),
      }),
    );
  });

  it("R-S285-3: under v2.1 the reviewed values name the renewal dates; under v2.0 they are as before", () => {
    const inputsFor = (version: "v2.0" | "v2.1") =>
      renewalReviewedInputs({
        channel: "owner",
        reply: false,
        to: ["owner@example.invalid"],
        cc: [],
        signature: null,
        signatureSetup: null,
        facts: ownerFacts({ ownerCopyVersion: version }),
        publication: { name: "Synthetic owner template", contentHash: "p".repeat(64) },
        offerSnapshotHash: null,
        notice: null,
        dispositionRevision: 1,
        blockers: [],
      });
    expect(inputsFor("v2.0").some((input) => input.key === "renewalStart")).toBe(false);
    expect(inputsFor("v2.1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "renewalStart", value: "01/01/2027" }),
        expect.objectContaining({ key: "renewalEnd", value: "12/31/2027" }),
      ]),
    );
  });
});

describe("AC-S285-2 / R-S285-6 the publication's consequence and the named cause", () => {
  it("R-S285-6: the approver's line and the consequence with the count", () => {
    expect(OWNER_WORDING_READY_LINE).toBe(
      "New owner wording that asks about the term is ready to publish.",
    );
    expect(ownerWordingPublishConsequence(3)).toBe(
      "Publishing changes the owner message. 3 unsent owner messages were reviewed with the current wording and will be held for review.",
    );
    expect(ownerWordingPublishConsequence(1)).toBe(
      "Publishing changes the owner message. 1 unsent owner message was reviewed with the current wording and will be held for review.",
    );
  });

  it("R-S285-6 (S274): an owner template change reads 'The owner message wording was updated', once", () => {
    const reviewed = [
      reviewedInput("address", "Property address", "101 Sample Pl"),
      reviewedInput(
        "template",
        "Approved template",
        "Renewal owner — supplied September 10 2026 v2.0",
        "a".repeat(64),
      ),
    ];
    const current = [
      reviewedInput("address", "Property address", "101 Sample Pl"),
      reviewedInput(
        "template",
        "Approved template",
        "Renewal owner — rent and term ask November 12 2026 v2.1",
        "b".repeat(64),
      ),
      reviewedInput("renewalStart", "Renewal start date", "01/01/2027"),
      reviewedInput("renewalEnd", "Renewal end date", "12/31/2027"),
    ];
    const changes = changedReviewedInputs(reviewed, current);
    // The dates the new wording states for the first time are part of the one change.
    expect(changes.map((change) => change.key)).toEqual(["template"]);
    expect(isOwnerWordingChange(changes[0]!)).toBe(true);
    expect(changedInputLine(changes[0]!)).toBe(OWNER_WORDING_UPDATED_LINE);
    expect(predatesChangeLine(changes[0]!)).toBe(
      "The owner message wording was updated.",
    );
    expect(changedInputLine(OWNER_WORDING_UPDATED_INPUT)).toBe(
      "The owner message wording was updated",
    );
    // The lease step's held or out-of-date owner message names the same cause (S273 R-S273-3).
    expect(unsentDifferenceLine(changes[0]!)).toBe(
      "The owner message wording was updated.",
    );
    expect(unsentDifferenceLine(OWNER_WORDING_UPDATED_INPUT)).toBe(
      "The owner message wording was updated.",
    );
    expect(
      unsentDifferenceLine({
        key: "template",
        label: "Approved template",
        previous: "Renewal tenant — supplied September 10 2026 v2.0",
        current: "Renewal tenant — later",
      }),
    ).toBe(
      "Approved template: Renewal tenant — supplied September 10 2026 v2.0 in the scheduled message, Renewal tenant — later on the lease.",
    );
    // A tenant template change keeps its own line.
    expect(
      isOwnerWordingChange({
        key: "template",
        previous: "Renewal tenant — supplied September 10 2026 v2.0",
        current: "Renewal tenant — later",
      }),
    ).toBe(false);
    expect([...OWNER_TERM_INPUT_KEYS]).toEqual(["renewalStart", "renewalEnd"]);
  });

  it("R-S285-6: the count holds unsent authorized owner messages reviewed with v2.0, and nothing else", () => {
    const context = {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: "2850",
      purpose: "renewal_owner",
    };
    const recommend = [
      reviewedInput("ownerIntent", "Owner question", "Recommend a rent"),
    ];
    const scheduled = (overrides: Record<string, unknown> = {}) => ({
      context,
      state: "active",
      confirmedCount: 0,
      nextDueAtMs: Date.parse("2026-11-13T15:00:00Z"),
      authorization: {
        revision: 2,
        approvedAtMs: Date.parse("2026-11-12T18:00:00Z"),
        schedule: { timeZone: "America/Chicago" },
        signatureSetup: { uid: "staff", email: "staff@pmikcmetro.com" },
        initial: { plainText: "Synthetic owner wording." },
      },
      authorizedContentBasis: {
        revision: 2,
        digest: "d".repeat(64),
        values: recommend,
        draftHash: "h".repeat(64),
      },
      ...overrides,
    });
    expect(heldOnOwnerWordingPublish(scheduled())).toBe(true);
    expect(heldOnOwnerWordingPublish(scheduled({ state: "paused" }))).toBe(true);
    // Sent, cancelled, a reply, a tenant offer, renew-or-not and a v2.1 review are not held.
    expect(heldOnOwnerWordingPublish(scheduled({ confirmedCount: 1 }))).toBe(false);
    expect(heldOnOwnerWordingPublish(scheduled({ state: "cancelled" }))).toBe(false);
    expect(
      heldOnOwnerWordingPublish(
        scheduled({ context: { ...context, replyTo: { sequenceId: "x" } } }),
      ),
    ).toBe(false);
    expect(
      heldOnOwnerWordingPublish(
        scheduled({ context: { ...context, purpose: "renewal_tenant" } }),
      ),
    ).toBe(false);
    expect(
      heldOnOwnerWordingPublish(
        scheduled({
          authorizedContentBasis: {
            revision: 2,
            digest: "d".repeat(64),
            values: [reviewedInput("ownerIntent", "Owner question", "Renew or not")],
            draftHash: "h".repeat(64),
          },
        }),
      ),
    ).toBe(false);
    expect(
      heldOnOwnerWordingPublish(
        scheduled({
          authorizedContentBasis: {
            revision: 2,
            digest: "d".repeat(64),
            values: [
              ...recommend,
              reviewedInput("renewalStart", "Renewal start date", "01/01/2027"),
            ],
            draftHash: "h".repeat(64),
          },
        }),
      ),
    ).toBe(false);
    // An authorization from before S272 kept no values: its own wording tells the question.
    const legacy = scheduled({ authorizedContentBasis: undefined });
    expect(heldOnOwnerWordingPublish(legacy)).toBe(false);
    expect(
      heldOnOwnerWordingPublish({
        ...legacy,
        authorization: {
          ...legacy.authorization,
          initial: {
            plainText: `Hello,\n\n${SUPPLIED_RENEWAL_COPY.owner.consideration}`,
          },
        },
      }),
    ).toBe(true);
  });
});
