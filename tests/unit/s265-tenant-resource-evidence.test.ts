import { describe, expect, it } from "vitest";

import {
  RENEWAL_RESOURCE_FIELDS,
  RenewalResourceInputSchema,
  RenewalResourceSettingsSchema,
  usableRenewalResourceUrl,
} from "@/lib/lease-renewal/resource-locations";
import {
  TENANT_RESOURCE_IDS,
  TENANT_RESOURCE_PURPOSES,
  checkFrozenTenantResources,
  describeTenantResourceUse,
  sameTenantResourceEvidence,
  tenantAudienceCovers,
  tenantResourceUse,
  tenantResourceUses,
  type StoredTenantAccess,
} from "@/lib/lease-renewal/tenant-resource-evidence";

// S265 AC-S265-1 (R-S265-1, ARCH-S265-1, BEH-S265-1): the three tenant entries carry tenant
// audience evidence bound to the exact link, document version, purpose, audience, proof and
// validity. Blank and legacy entries, staff-only access, a sign-in page, a different document, a
// failed open, an expired check, a replaced link and a check recorded for another resource are
// Source pending for tenant use. Legal-form entries keep their own purpose. Synthetic values only.

const TODAY = "2026-11-12";
const URL_A = "https://fixture-rental.net/insurance-flyer-v3.pdf";

function access(overrides: Partial<StoredTenantAccess> = {}): StoredTenantAccess {
  return {
    purpose: TENANT_RESOURCE_PURPOSES.insurance_flyer,
    destination: URL_A,
    documentVersion: "Insurance flyer 2026-11",
    audience: { kind: "tenant_wide" },
    method: "signed_out_open",
    result: "current_document",
    checkedBy: "Fixture Resource Owner",
    checkedOn: "2026-11-10",
    validUntil: "2026-12-31",
    proof: { id: "a".repeat(32), version: 7 },
    ...overrides,
  };
}
function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "insurance_flyer",
    url: URL_A,
    verified: true,
    recordedAt: "2026-11-10T15:00:00.000Z",
    recordedByUid: "fixture-admin",
    tenantAccess: access(),
    ...overrides,
  };
}

describe("S265 AC-S265-1: tenant audience evidence on the existing tenant entries", () => {
  it("keeps exactly the three existing tenant entries beside the legal-form locations", () => {
    expect(TENANT_RESOURCE_IDS).toEqual([
      "insurance_flyer",
      "rbp_flyer",
      "renewal_information_form",
    ]);
    for (const id of TENANT_RESOURCE_IDS)
      expect(RENEWAL_RESOURCE_FIELDS.find((field) => field.id === id)?.kind).toBe(
        "information",
      );
    expect(RENEWAL_RESOURCE_FIELDS.filter((field) => field.kind === "legal").length).toBe(
      RENEWAL_RESOURCE_FIELDS.length - 3,
    );
  });

  it("reads blank and legacy entries as Source pending for tenant use with a precise reason", () => {
    const blank = tenantResourceUse("insurance_flyer", undefined, TODAY);
    expect(blank).toMatchObject({ state: "source_pending", code: "blank" });
    expect(describeTenantResourceUse(blank)).toBe(
      "Source pending. No link is saved yet.",
    );
    const savedBlank = tenantResourceUse(
      "insurance_flyer",
      { id: "insurance_flyer", url: "", verified: false },
      TODAY,
    );
    expect(savedBlank).toMatchObject({ state: "source_pending", code: "blank" });
    // A legacy entry: the link plus the old checkbox only.
    const legacy = tenantResourceUse(
      "insurance_flyer",
      { id: "insurance_flyer", url: URL_A, verified: true },
      TODAY,
    );
    expect(legacy).toMatchObject({
      state: "source_pending",
      code: "no_audience_check",
      url: URL_A,
    });
    expect(describeTenantResourceUse(legacy)).toBe(
      "Source pending. No tenant audience check is recorded for this link.",
    );
    // The legacy box can no longer make a tenant link usable anywhere.
    expect(
      usableRenewalResourceUrl({ id: "insurance_flyer", url: URL_A, verified: true }),
    ).toBeNull();
    const unchecked = tenantResourceUse(
      "rbp_flyer",
      { id: "rbp_flyer", url: URL_A, verified: false },
      TODAY,
    );
    expect(unchecked).toMatchObject({ code: "destination_unchecked" });
  });

  it("refuses staff-only access, a sign-in page, a different document, a failed open and a mismatched method", () => {
    const cases: Array<[Partial<StoredTenantAccess>, string, RegExp]> = [
      [{ method: "staff_sign_in" }, "staff_sign_in", /signed in as staff/],
      [{ result: "sign_in_page" }, "check_failed", /sign-in page/],
      [{ result: "different_document" }, "check_failed", /different document/],
      [{ result: "nothing_opened" }, "check_failed", /did not open/],
      [{ method: "sharing_list" }, "method_mismatch", /signed out/],
      [
        {
          audience: { kind: "restricted", recipients: ["tenant@fixture-rental.net"] },
          method: "signed_out_open",
        },
        "method_mismatch",
        /sharing list/,
      ],
    ];
    for (const [change, code, reason] of cases) {
      const use = tenantResourceUse(
        "insurance_flyer",
        entry({ tenantAccess: access(change) }),
        TODAY,
      );
      expect(use, code).toMatchObject({ state: "source_pending", code });
      expect(use.state === "source_pending" ? use.reason : "", code).toMatch(reason);
    }
  });

  it("binds a real-format synthetic audience proof to the exact link, version, purpose, audience, proof and validity", () => {
    const use = tenantResourceUse("insurance_flyer", entry(), TODAY);
    expect(use.state).toBe("usable");
    if (use.state !== "usable") return;
    expect(use.evidence).toEqual({
      id: "insurance_flyer",
      purpose: TENANT_RESOURCE_PURPOSES.insurance_flyer,
      url: URL_A,
      documentVersion: "Insurance flyer 2026-11",
      audience: { kind: "tenant_wide" },
      proof: { id: "a".repeat(32), version: 7 },
      validUntil: "2026-12-31",
    });
    expect(describeTenantResourceUse(use)).toBe(
      "Verified for tenants. Audience: Any tenant with the link, no sign-in. Checked by Fixture Resource Owner on 11/10/2026, valid until 12/31/2026. Document version Insurance flyer 2026-11.",
    );
    // The last valid day still holds; the next day the same proof is expired.
    expect(tenantResourceUse("insurance_flyer", entry(), "2026-12-31").state).toBe(
      "usable",
    );
    const expired = tenantResourceUse("insurance_flyer", entry(), "2027-01-01");
    expect(expired).toMatchObject({ state: "source_pending", code: "expired" });
    expect(describeTenantResourceUse(expired)).toBe(
      "Source pending. The tenant audience check expired on 12/31/2026.",
    );
    expect(
      tenantResourceUse(
        "insurance_flyer",
        entry({ tenantAccess: access({ checkedOn: "2026-11-13" }) }),
        TODAY,
      ),
    ).toMatchObject({ code: "not_yet_checked" });
  });

  it("never lets a replaced link, another resource's check or an unreadable check stand in", () => {
    expect(
      tenantResourceUse(
        "insurance_flyer",
        entry({ url: "https://fixture-rental.net/replaced.pdf" }),
        TODAY,
      ),
    ).toMatchObject({ state: "source_pending", code: "link_changed" });
    // The insurance flyer's check copied onto the RBP entry stays with its own purpose.
    expect(
      tenantResourceUse("rbp_flyer", entry({ id: "rbp_flyer" }), TODAY),
    ).toMatchObject({ state: "source_pending", code: "purpose_mismatch" });
    expect(
      tenantResourceUse(
        "insurance_flyer",
        entry({ tenantAccess: { ...access(), audience: { kind: "everyone" } } }),
        TODAY,
      ),
    ).toMatchObject({ state: "source_pending", code: "audience_check_unreadable" });
    // A placeholder or local link is never usable, even with a recorded check.
    for (const url of [
      "https://flyer.example.org/x.pdf",
      "https://localhost/flyer.pdf",
      "http://fixture-rental.net/flyer.pdf",
    ])
      expect(
        tenantResourceUse(
          "insurance_flyer",
          entry({ url, tenantAccess: access({ destination: url }) }),
          TODAY,
        ),
        url,
      ).toMatchObject({ state: "source_pending", code: "invalid_link" });
  });

  it("covers only the named recipients of a restricted proof; a tenant-wide proof covers everyone", () => {
    expect(
      tenantAudienceCovers({ kind: "tenant_wide" }, ["any@fixture-rental.net"]),
    ).toBe(true);
    const restricted = {
      kind: "restricted" as const,
      recipients: ["tenant-one@fixture-rental.net"],
    };
    expect(tenantAudienceCovers(restricted, ["Tenant-One@fixture-rental.net"])).toBe(
      true,
    );
    expect(
      tenantAudienceCovers(restricted, [
        "tenant-one@fixture-rental.net",
        "tenant-two@fixture-rental.net",
      ]),
    ).toBe(false);
  });

  it("compares the whole bound identity; a same-link proof change is a different proof", () => {
    const before = tenantResourceUse("insurance_flyer", entry(), TODAY);
    const after = tenantResourceUse(
      "insurance_flyer",
      entry({ tenantAccess: access({ proof: { id: "b".repeat(32), version: 9 } }) }),
      TODAY,
    );
    if (before.state !== "usable" || after.state !== "usable") throw new Error("usable");
    expect(before.url).toBe(after.url);
    expect(sameTenantResourceEvidence(before.evidence, after.evidence)).toBe(false);
    expect(sameTenantResourceEvidence(before.evidence, { ...before.evidence })).toBe(
      true,
    );
    const settings = {
      entries: {
        insurance_flyer: entry({
          tenantAccess: access({ proof: { id: "b".repeat(32), version: 9 } }),
        }),
      },
    };
    const verdict = checkFrozenTenantResources(
      [before.evidence],
      tenantResourceUses(settings, TODAY),
      ["tenant@fixture-rental.net"],
    );
    expect(verdict).toMatchObject({
      ok: false,
      kind: "changed",
      resourceId: "insurance_flyer",
    });
    expect(verdict.ok ? "" : verdict.message).toMatch(
      /changed after this message was reviewed/,
    );
    expect(
      checkFrozenTenantResources([], tenantResourceUses(settings, TODAY), []),
    ).toEqual({ ok: true });
  });
});

describe("S265 AC-S265-1: the existing save input carries the check only where it belongs", () => {
  const evidence = {
    documentVersion: "Insurance flyer 2026-11",
    audience: {
      kind: "restricted",
      recipients: [" Tenant-Two@Fixture-Rental.net", "tenant-one@fixture-rental.net"],
    },
    method: "sharing_list",
    result: "current_document",
    checkedBy: "Fixture Resource Owner",
    checkedOn: "2026-11-10",
    validUntil: "2026-12-31",
  };
  it("accepts a complete check on a checked tenant link and normalizes the covered recipients", () => {
    const parsed = RenewalResourceInputSchema.parse({
      id: "insurance_flyer",
      url: URL_A,
      verified: true,
      tenantAccess: evidence,
    });
    expect(parsed.tenantAccess?.audience).toEqual({
      kind: "restricted",
      recipients: ["tenant-one@fixture-rental.net", "tenant-two@fixture-rental.net"],
    });
    // Blank and legacy inputs keep saving exactly as before.
    expect(
      RenewalResourceInputSchema.safeParse({
        id: "insurance_flyer",
        url: "",
        verified: false,
      }).success,
    ).toBe(true);
    expect(
      RenewalResourceInputSchema.safeParse({
        id: "rbp_flyer",
        url: URL_A,
        verified: true,
      }).success,
    ).toBe(true);
  });

  it("refuses a check on a blank or unchecked link, a partial check and an impossible validity", () => {
    const refusals: Array<[Record<string, unknown>, string]> = [
      [
        { id: "insurance_flyer", url: "", verified: false, tenantAccess: evidence },
        "blank",
      ],
      [
        { id: "insurance_flyer", url: URL_A, verified: false, tenantAccess: evidence },
        "unchecked destination",
      ],
      [
        {
          id: "insurance_flyer",
          url: URL_A,
          verified: true,
          tenantAccess: { ...evidence, checkedBy: "" },
        },
        "partial",
      ],
      [
        {
          id: "insurance_flyer",
          url: URL_A,
          verified: true,
          tenantAccess: { ...evidence, validUntil: "2026-11-01" },
        },
        "ends before checked",
      ],
      [
        {
          id: "insurance_flyer",
          url: URL_A,
          verified: true,
          tenantAccess: { ...evidence, audience: { kind: "restricted", recipients: [] } },
        },
        "no recipients",
      ],
      [
        {
          id: "insurance_flyer",
          url: "https://user:secret@fixture-rental.net/flyer.pdf",
          verified: true,
          tenantAccess: evidence,
        },
        "credentials",
      ],
    ];
    for (const [input, label] of refusals)
      expect(RenewalResourceInputSchema.safeParse(input).success, label).toBe(false);
  });

  it("keeps legal-form locations on their own purpose: they carry no tenant check", () => {
    const legal = RENEWAL_RESOURCE_FIELDS.find((field) => field.kind === "legal")!;
    expect(
      RenewalResourceInputSchema.safeParse({
        id: legal.id,
        url: "https://fixture-rental.net/lease.pdf",
        verified: true,
        tenantAccess: evidence,
      }).success,
    ).toBe(false);
    // A checked legal location stays usable for its own (packet) purpose, unchanged.
    expect(
      usableRenewalResourceUrl({
        id: legal.id,
        url: "https://fixture-rental.net/lease.pdf",
        verified: true,
      }),
    ).toBe("https://fixture-rental.net/lease.pdf");
  });

  it("reads stored settings with and without a check, and a malformed check only pends its own entry", () => {
    const settings = RenewalResourceSettingsSchema.parse({
      version: 4,
      entries: {
        insurance_flyer: entry(),
        rbp_flyer: {
          id: "rbp_flyer",
          url: URL_A,
          verified: true,
          recordedAt: "2026-09-10T12:00:00.000Z",
          recordedByUid: "fixture-admin",
        },
        renewal_information_form: entry({
          id: "renewal_information_form",
          tenantAccess: { broken: true },
        }),
      },
    });
    const uses = tenantResourceUses(settings, TODAY);
    expect(uses.insurance_flyer.state).toBe("usable");
    expect(uses.rbp_flyer).toMatchObject({ code: "no_audience_check" });
    expect(uses.renewal_information_form).toMatchObject({
      code: "audience_check_unreadable",
    });
    expect(tenantResourceUses(null, TODAY).insurance_flyer).toMatchObject({
      code: "unreadable",
    });
  });
});
