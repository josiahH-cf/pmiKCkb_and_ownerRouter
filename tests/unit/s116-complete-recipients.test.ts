import { describe, expect, it } from "vitest";

import { resolveSeparatedRenewalDraftRecipient } from "@/lib/lease-renewal/execution/renewal-draft-preview";
import {
  formatRecipientsForCopy,
  resolveRenewalRecipient,
} from "@/lib/lease-renewal/recipient-resolution";

// R116.4: every additional verified same-audience address is a Cc; a same-audience party without
// an email is named as incomplete, never silently omitted, and refuses the final addressed message.
describe("S116 complete same-audience recipients (AC-S116-4)", () => {
  it("addresses every owner on lease.owners[], not only the first", () => {
    const resolution = resolveRenewalRecipient({
      lease: {
        leaseID: 7100,
        owners: [
          { email: "o1@example.com" },
          { email: "O2@Example.com" },
          { email: "o3@example.com" },
        ],
      },
      channel: "owner",
    });
    expect(resolution.verified).toBe(true);
    expect(resolution.to).toBe("o1@example.com");
    expect(resolution.cc).toEqual(["o2@example.com", "o3@example.com"]);
    expect(resolution.ccSourceRefs).toEqual([
      "rentvine:lease:7100:owners[1].email",
      "rentvine:lease:7100:owners[2].email",
    ]);
    expect(resolution.incomplete).toEqual([]);
  });

  it("names a same-audience party without an email as incomplete instead of dropping them", () => {
    const resolution = resolveRenewalRecipient({
      lease: {
        leaseID: 7100,
        tenants: [
          { email: "t1@example.com" },
          { firstName: "Pat", lastName: "Solstice" },
          { email: "t3@example.com" },
        ],
      },
      channel: "tenant",
    });
    expect(resolution.verified).toBe(true);
    expect(resolution.to).toBe("t1@example.com");
    expect(resolution.cc).toEqual(["t3@example.com"]);
    expect(resolution.incomplete).toEqual(["tenants[1]"]);
  });

  it("reports an owner roster element without an email as incomplete too", () => {
    const resolution = resolveRenewalRecipient({
      lease: {
        leaseID: 7100,
        portfolio: { owners: [{ email: "a@example.com" }, { name: "Second Owner LLC" }] },
      },
      channel: "owner",
    });
    expect(resolution.to).toBe("a@example.com");
    expect(resolution.incomplete).toEqual(["portfolio.owners[1]"]);
  });

  it("refuses the final addressed draft while a same-audience party lacks an email", () => {
    const result = resolveSeparatedRenewalDraftRecipient({
      lease: {
        leaseID: 7100,
        tenants: [{ email: "t1@example.com" }, { firstName: "Pat" }],
        portfolio: { owners: [{ email: "owner@example.com" }] },
      },
      channel: "tenant",
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected a refusal");
    expect(result.reasons.join(" ")).toMatch(/Tenant 2 has no email on file/);
    expect(result.reasons.join(" ")).toMatch(/RentVine/);
  });

  it("still addresses a complete roster and keeps the cross-channel collision refusal", () => {
    const complete = resolveSeparatedRenewalDraftRecipient({
      lease: {
        leaseID: 7100,
        tenants: [{ email: "t1@example.com" }, { email: "t2@example.com" }],
        portfolio: { owners: [{ email: "owner@example.com" }] },
      },
      channel: "tenant",
    });
    expect(complete.status).toBe("ready");
    if (complete.status !== "ready") throw new Error("expected recipients");
    expect(complete.resolution.to).toBe("t1@example.com");
    expect(complete.resolution.cc).toEqual(["t2@example.com"]);

    const collision = resolveSeparatedRenewalDraftRecipient({
      lease: {
        leaseID: 7100,
        tenants: [{ email: "shared@example.com" }],
        portfolio: { owners: [{ email: "shared@example.com" }] },
      },
      channel: "tenant",
    });
    expect(collision.status).toBe("blocked");
  });

  it("formats the complete recipient set for copying, To first and then every Cc", () => {
    expect(
      formatRecipientsForCopy({
        to: "a@example.com",
        cc: ["b@example.com", "c@example.com"],
      }),
    ).toBe("To: a@example.com\nCc: b@example.com, c@example.com");
    expect(formatRecipientsForCopy({ to: "a@example.com", cc: [] })).toBe(
      "To: a@example.com",
    );
  });
});
