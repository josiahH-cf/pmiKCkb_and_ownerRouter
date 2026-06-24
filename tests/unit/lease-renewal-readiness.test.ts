import { describe, expect, it } from "vitest";
import {
  evaluateRenewalReadiness,
  type RenewalReadinessInput,
} from "@/lib/lease-renewal/renewal-readiness";

function checkById(input: RenewalReadinessInput, id: string) {
  return evaluateRenewalReadiness(input).checks.find((c) => c.id === id)!;
}

describe("evaluateRenewalReadiness — unknown inputs never produce a false all-clear", () => {
  it("classifies every unknown field as needs_input (Blocked), not ok", () => {
    const result = evaluateRenewalReadiness({});
    expect(result.allClear).toBe(false);
    expect(result.needsInput.length).toBe(result.checks.length);
    expect(result.needsInput.every((c) => c.severity === "Blocked")).toBe(true);
    expect(result.flags).toHaveLength(0);
  });
});

describe("inherited lease → full document set", () => {
  it("flags High when the extension-only template was selected on an inherited lease", () => {
    const check = checkById(
      { inheritedLease: true, templateSelected: "renewal_extension" },
      "inherited_full_set",
    );
    expect(check.status).toBe("flag");
    expect(check.severity).toBe("High");
  });
  it("is ok with the full set, or when not inherited", () => {
    expect(
      checkById(
        { inheritedLease: true, templateSelected: "full_set" },
        "inherited_full_set",
      ).status,
    ).toBe("ok");
    expect(checkById({ inheritedLease: false }, "inherited_full_set").status).toBe("ok");
  });
});

describe("pre-1978 → lead-based-paint addendum", () => {
  it("flags a pre-1978 build, passes 1978+, asks when unknown", () => {
    expect(checkById({ yearBuilt: 1975 }, "lead_based_paint").status).toBe("flag");
    expect(checkById({ yearBuilt: 1990 }, "lead_based_paint").status).toBe("ok");
    expect(checkById({}, "lead_based_paint").status).toBe("needs_input");
  });
});

describe("city addendum", () => {
  it("flags Independence / Kansas City, passes elsewhere", () => {
    expect(checkById({ city: "Independence" }, "city_addendum").status).toBe("flag");
    expect(checkById({ city: "Kansas City" }, "city_addendum").status).toBe("flag");
    expect(checkById({ city: "Lee's Summit" }, "city_addendum").status).toBe("ok");
  });
});

describe("security-deposit type", () => {
  it("flags a replacement policy that claims cash held", () => {
    const check = checkById(
      { securityDepositType: "replacement_policy", claimsCashHeld: true },
      "security_deposit_type",
    );
    expect(check.status).toBe("flag");
    expect(check.severity).toBe("High");
  });
  it("passes cash, and a policy that does not claim cash held", () => {
    expect(
      checkById({ securityDepositType: "cash" }, "security_deposit_type").status,
    ).toBe("ok");
    expect(
      checkById(
        { securityDepositType: "replacement_policy", claimsCashHeld: false },
        "security_deposit_type",
      ).status,
    ).toBe("ok");
  });

  it("asks (never a false all-clear) when a replacement policy's cash-held claim is unknown", () => {
    expect(
      checkById({ securityDepositType: "replacement_policy" }, "security_deposit_type")
        .status,
    ).toBe("needs_input");
  });
});

describe("pet deposit", () => {
  it("flags a pet with no deposit recorded; passes no-pet", () => {
    expect(checkById({ hasPet: true, petDepositSet: false }, "pet_deposit").status).toBe(
      "flag",
    );
    expect(checkById({ hasPet: true, petDepositSet: true }, "pet_deposit").status).toBe(
      "ok",
    );
    expect(checkById({ hasPet: false }, "pet_deposit").status).toBe("ok");
  });
});

describe("LLC suffix", () => {
  it("flags an LLC landlord whose name lacks the suffix", () => {
    expect(
      checkById({ landlordIsLlc: true, landlordName: "Gen X Consulting" }, "llc_suffix")
        .status,
    ).toBe("flag");
    expect(
      checkById(
        { landlordIsLlc: true, landlordName: "Gen X Consulting LLC" },
        "llc_suffix",
      ).status,
    ).toBe("ok");
    expect(checkById({ landlordIsLlc: false }, "llc_suffix").status).toBe("ok");
    expect(checkById({ landlordIsLlc: true }, "llc_suffix").status).toBe("needs_input");
  });
});

describe("prorated rent", () => {
  it("flags a mid-month start, passes the first of the month", () => {
    expect(checkById({ leaseStartIso: "2026-08-15" }, "prorated_rent").status).toBe(
      "flag",
    );
    expect(checkById({ leaseStartIso: "2026-08-01" }, "prorated_rent").status).toBe("ok");
  });
});

describe("a fully specified clean renewal is all-clear", () => {
  it("returns allClear when every check passes", () => {
    const result = evaluateRenewalReadiness({
      inheritedLease: false,
      yearBuilt: 1990,
      city: "Lee's Summit",
      hasPet: false,
      securityDepositType: "cash",
      landlordIsLlc: false,
      leaseStartIso: "2026-08-01",
    });
    expect(result.allClear).toBe(true);
    expect(result.flags).toHaveLength(0);
    expect(result.needsInput).toHaveLength(0);
    expect(result.production_allowed).toBe(false);
  });
});
