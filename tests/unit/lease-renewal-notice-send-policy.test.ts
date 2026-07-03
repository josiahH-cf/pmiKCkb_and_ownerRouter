import { describe, expect, it } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { buildOwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import { buildTenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";
import {
  buildOwnerNoticeDraftRequest,
  buildTenantNoticeDraftRequest,
} from "@/lib/lease-renewal/notice-send-policy";

describe("buildOwnerNoticeDraftRequest", () => {
  const draft = buildOwnerRenewalDraft({
    addressLabel: "4821 Maple Ct, Unit 4",
    currentRent: 1250,
    market: {
      rangeLow: 1295,
      rangeHigh: 1395,
      specificNumber: 1325,
      compsScreenshotRef: "x",
    },
  });

  it("builds an UNSENT, non-executable draft request with the verbatim banner", () => {
    const request = buildOwnerNoticeDraftRequest({
      draft,
      ownerEmail: "owner@example.com",
    });
    expect(request.kind).toBe("gmail_renewal_notice_draft");
    expect(request.channel).toBe("owner");
    expect(request.to).toBe("owner@example.com");
    expect(request.subject).toBe(draft.subject);
    expect(request.body.startsWith(DRAFT_BANNER)).toBe(true);
    expect(request.production_allowed).toBe(false);
    expect(request.send_allowed).toBe(false);
  });

  it("never invents a recipient: a missing email renders Needs Verification", () => {
    const request = buildOwnerNoticeDraftRequest({ draft });
    expect(request.to).toContain("Needs Verification");
    expect(request.missingInputs).toContain("owner email");
  });

  it("does not double-prepend the banner if the body already carries it", () => {
    const banneredDraft = { ...draft, body: `${DRAFT_BANNER}\n\nHello` };
    const request = buildOwnerNoticeDraftRequest({
      draft: banneredDraft,
      ownerEmail: "o@x.com",
    });
    expect(request.body.match(new RegExp(DRAFT_BANNER, "g"))).toHaveLength(1);
  });
});

describe("buildTenantNoticeDraftRequest", () => {
  const draft = buildTenantOfferDraft({
    tenantNameLabel: "M. Carter",
    leaseEndDateIso: "2026-08-31",
    ownerDecision: "increase",
    offeredRent: 1325,
  });

  it("uses the email channel, prepends the banner, and stays non-executable", () => {
    const request = buildTenantNoticeDraftRequest({
      draft,
      tenantEmail: "t@example.com",
    });
    expect(request.channel).toBe("tenant");
    expect(request.to).toBe("t@example.com");
    expect(request.subject).toBe(draft.channels.email.subject);
    expect(request.body.startsWith(DRAFT_BANNER)).toBe(true);
    expect(request.body).toContain(draft.channels.email.body);
    expect(request.send_allowed).toBe(false);
  });

  it("flags a missing tenant email as Needs Verification", () => {
    const request = buildTenantNoticeDraftRequest({ draft });
    expect(request.to).toContain("Needs Verification");
    expect(request.missingInputs).toContain("tenant email");
  });
});
