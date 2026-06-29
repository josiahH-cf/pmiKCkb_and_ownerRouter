import { describe, expect, it } from "vitest";

import { classifyAdcError, reauthGuidance } from "../../scripts/preflight-adc.mjs";

// Guards the ADC preflight's error classification + operator guidance — the recurring stall is a stale
// ADC token, and the fix must always be the scope-free reauth command (the Sheets scope is restricted).
describe("classifyAdcError", () => {
  it("classifies the stale-token reauth failures", () => {
    expect(classifyAdcError("reauth related error (invalid_rapt)")).toBe("reauth");
    expect(classifyAdcError('{"error":"invalid_grant"}')).toBe("reauth");
    expect(classifyAdcError("Reauthentication failed. cannot prompt")).toBe("reauth");
  });

  it("classifies missing credentials", () => {
    expect(classifyAdcError("Could not load the default credentials")).toBe("missing");
  });

  it("falls back to other for unrelated errors", () => {
    expect(classifyAdcError("network timeout")).toBe("other");
    expect(classifyAdcError(undefined)).toBe("other");
  });
});

describe("reauthGuidance", () => {
  it("gives the scope-free reauth command for reauth + missing (the Sheets scope is restricted)", () => {
    for (const kind of ["reauth", "missing"]) {
      const lines = reauthGuidance(kind).join(" ");
      expect(lines).toContain("gcloud auth application-default login");
      // Must never recommend the restricted-scope form (gcloud auth ... --scopes=...spreadsheets.readonly),
      // which the managed domain blocks; the message may still say the words "NO --scopes" as guidance.
      expect(lines).not.toContain("--scopes=");
      expect(lines).toContain("pmikcmetro.com");
    }
  });

  it("does not invent a fix for an unexpected error", () => {
    expect(reauthGuidance("other").join(" ")).not.toContain("gcloud auth");
  });
});
