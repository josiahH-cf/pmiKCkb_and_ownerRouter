import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENEWAL_RECIPIENT_FIELD_MAP,
  resolveRenewalRecipient,
} from "@/lib/lease-renewal/recipient-resolution";

describe("resolveRenewalRecipient", () => {
  it("resolves a tenant email from lease.tenants[0] with a source ref", () => {
    const result = resolveRenewalRecipient({
      channel: "tenant",
      lease: {
        leaseID: 4821,
        tenants: [{ name: "Jordan Rivera", email: "Jordan.Rivera@Example.com" }],
      },
    });
    expect(result).toEqual({
      channel: "tenant",
      to: "jordan.rivera@example.com",
      recipientSourceRef: "rentvine:lease:4821:tenants[0].email",
      verified: true,
      missing: [],
    });
  });

  it("resolves an owner email from lease.owner and lowercases + trims it", () => {
    const result = resolveRenewalRecipient({
      channel: "owner",
      lease: {
        leaseId: "L-99",
        owner: { emailAddress: "  Owner@Example.NET " },
        tenants: [{ email: "tenant@example.com" }],
      },
    });
    expect(result.verified).toBe(true);
    expect(result.to).toBe("owner@example.net");
    expect(result.recipientSourceRef).toBe("rentvine:lease:L-99:owner.emailAddress");
    // Must not have grabbed the tenant address for the owner channel.
    expect(result.to).not.toBe("tenant@example.com");
  });

  it("resolves owner from property.owner and portfolio.owner nesting", () => {
    const viaProperty = resolveRenewalRecipient({
      channel: "owner",
      lease: { id: 7, property: { owner: { email: "prop-owner@example.com" } } },
    });
    expect(viaProperty.to).toBe("prop-owner@example.com");
    expect(viaProperty.recipientSourceRef).toBe("rentvine:lease:7:property.owner.email");

    const viaPortfolio = resolveRenewalRecipient({
      channel: "owner",
      lease: { id: 8, portfolio: { owner: { primaryEmail: "pf-owner@example.com" } } },
    });
    expect(viaPortfolio.to).toBe("pf-owner@example.com");
    expect(viaPortfolio.recipientSourceRef).toBe(
      "rentvine:lease:8:portfolio.owner.primaryEmail",
    );
  });

  it("marks Needs-Verification (never invents) when the tenant email is absent", () => {
    const result = resolveRenewalRecipient({
      channel: "tenant",
      lease: { leaseID: 100, tenants: [{ name: "No Email Person" }] },
    });
    expect(result).toEqual({
      channel: "tenant",
      verified: false,
      missing: ["tenant email"],
    });
    expect(result.to).toBeUndefined();
    expect(result.recipientSourceRef).toBeUndefined();
  });

  it("marks Needs-Verification for the owner channel when only tenant data is present", () => {
    // The common live-read shape today: tenant present, no owner object. Owner must NOT resolve.
    const result = resolveRenewalRecipient({
      channel: "owner",
      lease: { leaseID: 55, tenants: [{ email: "tenant@example.com" }] },
    });
    expect(result.verified).toBe(false);
    expect(result.missing).toEqual(["owner email"]);
    expect(result.to).toBeUndefined();
  });

  it("does not read a generic lease-level `email` for either party (anti-misattribution)", () => {
    // A bare top-level `email` is unscoped — it could belong to either side, so neither channel claims it.
    const lease = { leaseID: 3, email: "ambiguous@example.com" };
    expect(resolveRenewalRecipient({ channel: "tenant", lease }).verified).toBe(false);
    expect(resolveRenewalRecipient({ channel: "owner", lease }).verified).toBe(false);
  });

  it("honors explicit lease-level party keys (tenantEmail / ownerEmail)", () => {
    expect(
      resolveRenewalRecipient({
        channel: "tenant",
        lease: { leaseID: 1, tenantEmail: "flat-tenant@example.com" },
      }),
    ).toMatchObject({
      to: "flat-tenant@example.com",
      recipientSourceRef: "rentvine:lease:1:tenantEmail",
      verified: true,
    });
    expect(
      resolveRenewalRecipient({
        channel: "owner",
        lease: { leaseID: 1, ownerEmail: "flat-owner@example.com" },
      }),
    ).toMatchObject({
      to: "flat-owner@example.com",
      recipientSourceRef: "rentvine:lease:1:ownerEmail",
      verified: true,
    });
  });

  it("rejects a malformed email rather than passing it through", () => {
    const result = resolveRenewalRecipient({
      channel: "tenant",
      lease: { leaseID: 2, tenants: [{ email: "not-an-email" }] },
    });
    expect(result.verified).toBe(false);
    expect(result.to).toBeUndefined();
  });

  it("falls back to a plain `lease` label when the lease has no id", () => {
    const result = resolveRenewalRecipient({
      channel: "tenant",
      lease: { tenants: [{ email: "no-id@example.com" }] },
    });
    expect(result.recipientSourceRef).toBe("rentvine:lease:tenants[0].email");
  });

  it("exposes a stable default field map", () => {
    expect(DEFAULT_RENEWAL_RECIPIENT_FIELD_MAP.scopedEmailKeys).toContain("email");
    expect(DEFAULT_RENEWAL_RECIPIENT_FIELD_MAP.tenantLeaseKeys).toContain("tenantEmail");
    expect(DEFAULT_RENEWAL_RECIPIENT_FIELD_MAP.ownerLeaseKeys).toContain("ownerEmail");
  });
});
