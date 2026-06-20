import { describe, expect, it } from "vitest";
import {
  carriesCredentialContent,
  looksLikeCredentialHeaders,
  REDACTED_CREDENTIAL,
} from "@/lib/lease-renewal/credential-guard";

describe("looksLikeCredentialHeaders (Stage-B table guard)", () => {
  it("trips on a strong token or two indicators, covering the full spec token set", () => {
    expect(looksLikeCredentialHeaders("Platform Login Passcode Access Code")).toBe(true);
    expect(looksLikeCredentialHeaders("WiFi Name WiFi Password Garage")).toBe(true);
    expect(looksLikeCredentialHeaders("Account Login Username Login Password")).toBe(
      true,
    );
    expect(looksLikeCredentialHeaders("SSID")).toBe(true); // strong, single hit
    expect(looksLikeCredentialHeaders("System Credential Vault")).toBe(true); // strong, single hit
  });

  it("does not false-exclude legitimate renewal headers", () => {
    expect(
      looksLikeCredentialHeaders(
        "Have we confirmed pricing with the owner Renewal Date Current Rent Market Value",
      ),
    ).toBe(false);
    expect(looksLikeCredentialHeaders("Login")).toBe(false); // single weak indicator
    expect(looksLikeCredentialHeaders("Address Lease Start Inspections")).toBe(false);
  });
});

describe("carriesCredentialContent (§2.2.5 emit scrubber)", () => {
  it("trips on credential-bearing values", () => {
    expect(carriesCredentialContent("Wifi Password reset")).toBe(true);
    expect(carriesCredentialContent("Passcode 12 dummy")).toBe(true);
    expect(carriesCredentialContent("login username here")).toBe(true); // two weak indicators
  });

  it("trips on a high-signal secret format with no keyword", () => {
    // Built at runtime so no literal secret token sits in the committed source.
    const fakeAwsKey = "AKIA" + "A".repeat(16);
    expect(carriesCredentialContent(fakeAwsKey)).toBe(true);
  });

  it("does not trip on ordinary renewal cell values", () => {
    for (const value of [
      "",
      "yes",
      "Jordan Maple",
      "$1,250",
      "2026-08-31",
      "ESTELLE WORKING ON",
      "Provided by HOA",
    ]) {
      expect(carriesCredentialContent(value), value).toBe(false);
    }
  });

  it("exposes a stable redaction marker", () => {
    expect(REDACTED_CREDENTIAL).toBe("[REDACTED-CREDENTIAL]");
  });
});
