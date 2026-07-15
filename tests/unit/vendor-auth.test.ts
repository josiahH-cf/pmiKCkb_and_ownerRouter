import { describe, expect, it } from "vitest";

import { decodeVendorSessionCookie, validateVendorClaims } from "@/lib/vendor/auth";

const now = 2_000_000;
const valid = {
  uid: "vendor-user",
  email: "trade@example.com",
  email_verified: true,
  vendor: true,
  vendor_id: "vendor-1",
  auth_time: now - 60,
  firebase: { sign_in_second_factor: "totp" },
};

describe("Vendor verified-email TOTP session", () => {
  it("accepts only the separate recent Vendor MFA claim", () => {
    expect(validateVendorClaims(valid, now)).toMatchObject({
      uid: "vendor-user",
      vendorId: "vendor-1",
      emailVerified: true,
      totpVerified: true,
    });
  });

  it.each([
    { ...valid, vendor: false },
    { ...valid, email_verified: false },
    { ...valid, firebase: { sign_in_second_factor: "phone" } },
    { ...valid, auth_time: now - 3_601 },
  ])("refuses missing Vendor/email/TOTP/freshness gates", (claims) => {
    expect(() => validateVendorClaims(claims, now)).toThrow();
  });

  it("treats an internal, malformed, or revoked cookie as no Vendor session", async () => {
    await expect(
      decodeVendorSessionCookie("local-demo-session", async () => {
        throw new Error("Decoding Firebase session cookie failed.");
      }),
    ).resolves.toBeNull();
  });

  it("treats valid non-Vendor claims as no Vendor session", async () => {
    await expect(
      decodeVendorSessionCookie("staff-session", async () => ({
        uid: "staff-1",
        email: "staff@pmikcmetro.com",
        email_verified: true,
        auth_time: now,
      })),
    ).resolves.toBeNull();
  });
});
