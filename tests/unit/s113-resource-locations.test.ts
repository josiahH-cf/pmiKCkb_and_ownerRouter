import { describe, expect, it } from "vitest";
import {
  RENEWAL_RESOURCE_FIELDS,
  RenewalResourceInputSchema,
  usableRenewalResourceUrl,
} from "@/lib/lease-renewal/resource-locations";
describe("S113 pending-team resource links", () => {
  it("keeps blank boxes valid without yielding a real resource link", () => {
    expect(RENEWAL_RESOURCE_FIELDS.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "insurance_flyer",
        "renewal_information_form",
        "standard_lease",
        "renewal_extension",
        "animal_agreement",
        "lead_disclosure",
        "city_addendum",
        "hoa_artifact",
        "owner_acknowledgment",
      ]),
    );
    const value = RenewalResourceInputSchema.parse({
      id: "insurance_flyer",
      url: "",
      verified: false,
    });
    expect(usableRenewalResourceUrl(value)).toBeNull();
  });
  it("rejects unsafe URLs and keeps merely recorded locations out of recipient copy", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://example.org/form",
      "https://user:pass@example.org/form",
      "https://",
      "Add link",
      "https://example.org/flyer.pdf",
      "https://forms.example.com/input",
      "https://flyer.invalid/form",
      "https://localhost/form",
    ])
      expect(() =>
        RenewalResourceInputSchema.parse({ id: "insurance_flyer", url, verified: true }),
      ).toThrow();
    const recorded = RenewalResourceInputSchema.parse({
      id: "insurance_flyer",
      url: "https://fixture-rental.net/flyer.pdf",
      verified: false,
    });
    expect(usableRenewalResourceUrl(recorded)).toBeNull();
    const saved = {
      ...recorded,
      verified: true,
      recordedAt: "2026-09-10T12:00:00.000Z",
      recordedByUid: "admin",
    };
    expect(usableRenewalResourceUrl(saved)).toBe(recorded.url);
  });
});
