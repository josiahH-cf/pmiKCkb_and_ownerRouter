import { describe, expect, it } from "vitest";

import {
  assertVendorPrincipalLaneAllowed,
  decodeVendorSessionCookie,
  validateVendorClaims,
} from "@/lib/vendor/auth";

const now = 2_000_000;
const valid = {
  uid: "vendor-user",
  email: "trade@example.com",
  email_verified: true,
  vendor: true,
  vendor_id: "vendor-1",
  // S40 AC-S40-1: the Vendor tuple requires an explicit lane; a claim set without one is refused.
  data_mode: "live" as const,
  auth_time: now - 60,
  firebase: { sign_in_second_factor: "totp" },
};

describe("Vendor data-mode claim (S40 AC-S40-1)", () => {
  it("refuses an existing Test Vendor principal in Production and local Live-read-only", () => {
    const principal = validateVendorClaims({ ...valid, data_mode: "test" }, now);
    for (const env of [
      { ENVIRONMENT_KIND: "production", DATA_CONTEXT: "live" },
      { ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "live_readonly" },
    ]) {
      expect(() => assertVendorPrincipalLaneAllowed(principal, env)).toThrow(
        /Test lane is retired/,
      );
    }
  });

  it("refuses a Vendor principal that carries no explicit lane", () => {
    const withoutLane = { ...valid };
    delete (withoutLane as { data_mode?: unknown }).data_mode;
    expect(() => validateVendorClaims(withoutLane, now)).toThrow(
      /Vendor data mode is invalid/,
    );
  });

  it("refuses an unknown lane instead of narrowing it to Live", () => {
    for (const data_mode of ["", "demo", "LIVE", "production", 1, true, null]) {
      expect(() =>
        validateVendorClaims({ ...valid, data_mode } as typeof valid, now),
      ).toThrow(/Vendor data mode is invalid/);
    }
  });

  it("carries the exact signed lane through to the principal", () => {
    for (const data_mode of ["live", "test"] as const) {
      expect(validateVendorClaims({ ...valid, data_mode }, now)).toMatchObject({
        dataMode: data_mode,
      });
    }
  });
});

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
