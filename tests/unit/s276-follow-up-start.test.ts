// S276 ARCH-S276-3, R-S276-7 and R-S276-8 (AC-S276-6, AC-S276-7): the follow-up form's starting
// values come from one projection: the notice rules' interval, 9:00 AM Central, 3 messages in
// total, a blank end date and, only once its own copy record reads back approved, the standard
// follow-up message composed from the same reviewed facts as the offer. The follow-up copy is a
// separate record from the tenant offer copy, whose publication and content hash are unchanged.
// Pure checks on synthetic values; no Firestore, no mailbox.
import { describe, expect, it } from "vitest";

import {
  FOLLOW_UP_COPY,
  FOLLOW_UP_START_WORDS,
  composeFollowUpBody,
  followUpStartLine,
  followUpStartingValues,
  type FollowUpFacts,
} from "@/lib/lease-renewal/follow-up-copy";
import { followUpCopyPublication } from "@/lib/firestore/renewal-follow-up-publication";
import { suppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";
import {
  DEFAULT_NOTICE_RULE_SET,
  resolveNoticeRule,
} from "@/lib/lease-renewal/notice-rules";
import {
  SUPPLIED_RENEWAL_COPY,
  hasMissingValueMarker,
} from "@/lib/lease-renewal/renewal-message-content";
import { outgoingPayloadReasons } from "@/lib/lease-renewal/outgoing-message-readiness";

const FACTS: FollowUpFacts = {
  address: "101 Sample Pl",
  leaseEndDate: "2026-12-31",
  rent: 1450,
  effectiveDate: "2027-01-01",
  endDate: "2027-12-31",
  names: ["Synthetic Tenant", "Second Tenant"],
  firstNames: ["Sam", "Riley"],
};
const BODY = composeFollowUpBody(FACTS);

describe("S276 R-S276-8: the standard follow-up message", () => {
  it("R-S276-8 / AC-S276-7: holds the address, the lease end and the reviewed rent and dates once each, with the greeting and sign-off and no unresolved token", () => {
    expect(BODY.split("\n\n")).toEqual([
      "Hello Sam and Riley,",
      "We are following up on your lease renewal offer for 101 Sample Pl. Your lease ends on 12/31/2026.",
      "Rent: $1,450.00 per month, effective 01/01/2027. Renewal term: 01/01/2027 through 12/31/2027.",
      "Please let us know whether you plan to stay or leave, and we'll get the documents out if you plan to stay.",
      "Kindest Regards,",
    ]);
    const once = (value: string) => BODY.split(value).length - 1;
    expect(once("101 Sample Pl")).toBe(1);
    expect(once("12/31/2026")).toBe(1);
    expect(once("$1,450.00")).toBe(1);
    expect(once("12/31/2027")).toBe(1);
    expect(BODY).not.toMatch(/\{\{|\}\}/);
    expect(hasMissingValueMarker(BODY)).toBe(false);
    expect(outgoingPayloadReasons("Lease renewal for 101 Sample Pl", BODY)).toEqual([]);
    // The offer's own terms sentence is reused, not a second wording of it.
    expect(FOLLOW_UP_COPY.terms).toBe(SUPPLIED_RENEWAL_COPY.tenant.terms);
  });

  it("AC-S276-7: change the reviewed rent before confirming and the follow-up message follows it", () => {
    const changed = composeFollowUpBody({ ...FACTS, rent: 1500 });
    expect(changed).toContain("Rent: $1,500.00 per month");
    expect(changed).not.toContain("$1,450.00");
  });

  it("R-S276-8: without a first name the greeting is general, as the offer's is", () => {
    expect(
      composeFollowUpBody({ ...FACTS, firstNames: [null, null] }).split("\n\n")[0],
    ).toBe("Hello,");
  });

  it("AC-S276-7: the follow-up copy is its own record; the tenant offer's publication and hash are unchanged", () => {
    const followUp = followUpCopyPublication();
    const offer = suppliedRenewalPublication("tenant");
    expect(followUp.ref).toBe("tenant-follow-up:v1.0");
    expect(followUp.name).not.toBe(offer.name);
    expect(followUp.contentHash).not.toBe(offer.contentHash);
    expect(offer.ref).toBe("tenant-renewal:v2.0");
    // The offer copy is computed exactly as before: the same name and the same document.
    expect(offer.name).toBe("Renewal tenant — supplied September 10 2026 v2.0");
    expect(JSON.parse(offer.body).copy).toEqual(SUPPLIED_RENEWAL_COPY.tenant);
    expect(JSON.parse(followUp.body).copy).toEqual({
      opening: FOLLOW_UP_COPY.opening,
      terms: FOLLOW_UP_COPY.terms,
      closing: FOLLOW_UP_COPY.closing,
    });
  });
});

describe("S276 ARCH-S276-3: one projection of the starting values", () => {
  it("BEH-S276-6 / AC-S276-6: with the copy published, the subject, message, 10 days, 9:00 AM, Central and a limit of 3 are filled in with the line that says so", () => {
    expect(
      followUpStartingValues({
        subject: "Lease Renewal for 101 Sample Pl",
        start: { intervalDays: 10, published: true, body: BODY },
      }),
    ).toEqual({
      subject: "Lease Renewal for 101 Sample Pl",
      body: BODY,
      everyDays: "10",
      time: "09:00",
      timeZone: "America/Chicago",
      endDate: "",
      sendLimit: "3",
      published: true,
      line: "Filled in to start: every 10 days at 9:00 AM Central, 3 messages in total, and the standard follow-up message. Change anything before you review.",
    });
  });

  it("AC-S276-7: with the copy unpublished the message is blank, the timing is still filled in and the form names the unpublished copy", () => {
    const start = followUpStartingValues({
      subject: "Lease Renewal for 101 Sample Pl",
      start: { intervalDays: 10, published: false, body: null },
    });
    expect(start).toMatchObject({
      body: "",
      everyDays: "10",
      time: "09:00",
      timeZone: "America/Chicago",
      sendLimit: "3",
      endDate: "",
      published: false,
    });
    expect(FOLLOW_UP_START_WORDS.unpublished).toBe(
      "The standard follow-up message is not published yet. Write the follow-up, or ask a template approver to publish it.",
    );
    // A read without the follow-up start (an earlier server) is the same unpublished state.
    expect(followUpStartingValues({ subject: "S", start: null })).toMatchObject({
      body: "",
      everyDays: "10",
      published: false,
    });
  });

  it("AC-S276-6: with an Admin-saved interval of 14 the field reads 14", () => {
    const saved = resolveNoticeRule(
      {
        rules: [
          ...DEFAULT_NOTICE_RULE_SET.rules,
          {
            scope: "lease",
            key: "9276",
            values: { followUpIntervalDays: 14 },
            verified: true,
          },
        ],
      },
      { leaseId: "9276" },
    ).followUpIntervalDays.value;
    expect(saved).toBe(14);
    const start = followUpStartingValues({
      subject: "S",
      start: { intervalDays: saved, published: true, body: BODY },
    });
    expect(start.everyDays).toBe("14");
    expect(start.line).toBe(followUpStartLine(14, true));
    expect(start.line).toContain("every 14 days");
    // Unconfirmed defaults are still the starting value (an editable value staff review).
    expect(
      resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, { leaseId: "9276" }).followUpIntervalDays
        .value,
    ).toBe(10);
  });
});
