import { describe, expect, it } from "vitest";

import { generateTotp } from "@/lib/auth/totp";
import { beginTotpEnrollment, confirmTotpEnrollment } from "@/lib/auth/totp-enrollment";
import { PRODUCT_NAME } from "@/lib/constants";

describe("TOTP enrollment", () => {
  it("mints a base32 secret and an otpauth URI for the account, defaulting the issuer", () => {
    const enrollment = beginTotpEnrollment({ accountName: "owner@pmikcmetro.com" });
    expect(enrollment.secret).toMatch(/^[A-Z2-7]{32}$/u);
    expect(enrollment.uri.startsWith("otpauth://totp/")).toBe(true);
    expect(enrollment.uri).toContain(
      encodeURIComponent(`${PRODUCT_NAME}:owner@pmikcmetro.com`),
    );
    const query = new URLSearchParams(
      enrollment.uri.slice(enrollment.uri.indexOf("?") + 1),
    );
    expect(query.get("issuer")).toBe(PRODUCT_NAME);
    expect(query.get("secret")).toBe(enrollment.secret);
  });

  it("respects a custom issuer", () => {
    const enrollment = beginTotpEnrollment({
      accountName: "vendor@pmikcmetro.com",
      issuer: "PMI Vendors",
    });
    const query = new URLSearchParams(
      enrollment.uri.slice(enrollment.uri.indexOf("?") + 1),
    );
    expect(query.get("issuer")).toBe("PMI Vendors");
  });

  it("confirms the round-trip: the code the app would show for the minted secret verifies", () => {
    const enrollment = beginTotpEnrollment({ accountName: "renter@pmikcmetro.com" });
    const now = 1700000000;
    const code = generateTotp({ secret: enrollment.secret }, now);
    expect(confirmTotpEnrollment(enrollment.secret, code, now)).toBe(true);
  });

  it("rejects a wrong confirmation code", () => {
    const enrollment = beginTotpEnrollment({ accountName: "renter@pmikcmetro.com" });
    const now = 1700000000;
    const code = generateTotp({ secret: enrollment.secret }, now);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(confirmTotpEnrollment(enrollment.secret, wrong, now)).toBe(false);
  });
});
