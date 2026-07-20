import { describe, expect, it } from "vitest";
import { buildTenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";

describe("buildTenantOfferDraft", () => {
  const draft = buildTenantOfferDraft({
    tenantNameLabel: "Tenant A",
    leaseEndDateIso: "2026-07-31",
    ownerDecision: "increase",
    offeredRent: 1150,
    charges: { rbp: 28, insurance: 11.95 },
    infoFormUrl: "https://forms.example/info",
  });

  it("renders all three channels Dan requires", () => {
    expect(Object.keys(draft.channels).sort()).toEqual(["email", "portal_chat", "text"]);
    expect(draft.channels.email.channel).toBe("email");
    expect(draft.channels.email.subject).toBeDefined();
    expect(draft.channels.portal_chat.subject).toBeUndefined();
    expect(draft.channels.text.subject).toBeUndefined();
  });

  it("carries the offer, charges, stay/leave ask, and form link", () => {
    const email = draft.channels.email.body;
    // LR-04: tenant-facing surfaces render a human date ("Jul 31, 2026"), not the raw ISO.
    expect(email).toContain("Jul 31, 2026");
    expect(email).not.toContain("2026-07-31");
    expect(email).toContain("$1,150");
    expect(email).toContain("$28");
    expect(email).toContain("$11.95");
    expect(email.toLowerCase()).toContain("stay or leave");
    expect(email).toContain("https://forms.example/info");
  });

  it("shows the human date in the subject but keeps the raw ISO as a machine fact (LR-04)", () => {
    expect(draft.channels.email.subject).toContain("Jul 31, 2026");
    expect(draft.channels.email.subject).not.toContain("2026-07-31");
    const fact = draft.facts.find((entry) => entry.key === "lease_end_date");
    expect(fact?.value).toBe("2026-07-31");
  });

  it("makes the text channel a short nudge that points back to the full message", () => {
    expect(draft.channels.text.body.length).toBeLessThan(
      draft.channels.email.body.length,
    );
    expect(draft.channels.text.body).toContain("$1,150");
    expect(draft.channels.text.body).not.toContain("We've also emailed and messaged you");
  });

  it("claims both other channels only when both receipts exist", () => {
    const delivered = buildTenantOfferDraft({
      tenantNameLabel: "T",
      leaseEndDateIso: "2026-08-31",
      ownerDecision: "keep_same",
      offeredRent: 1250,
      channelReceipts: { email: "gmail-message-1", portal_chat: "portal-1" },
    });
    expect(delivered.channels.text.body).toContain(
      "We've also emailed and messaged you the details.",
    );

    const emailOnly = buildTenantOfferDraft({
      tenantNameLabel: "T",
      leaseEndDateIso: "2026-08-31",
      ownerDecision: "keep_same",
      offeredRent: 1250,
      channelReceipts: { email: "gmail-message-1" },
    });
    expect(emailOnly.channels.text.body).not.toContain("also emailed");
  });

  it("never authorizes a send", () => {
    expect(draft.production_allowed).toBe(false);
    expect(draft.send_allowed).toBe(false);
  });

  it("is deterministic and omits the form ask when no url is given", () => {
    const a = buildTenantOfferDraft({
      tenantNameLabel: "T",
      leaseEndDateIso: "2026-08-31",
      ownerDecision: "keep_same",
      offeredRent: 1250,
    });
    const b = buildTenantOfferDraft({
      tenantNameLabel: "T",
      leaseEndDateIso: "2026-08-31",
      ownerDecision: "keep_same",
      offeredRent: 1250,
    });
    expect(a).toEqual(b);
    expect(a.channels.email.body).not.toContain("fill out this form");
  });
});
