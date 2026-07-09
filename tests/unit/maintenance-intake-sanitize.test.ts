import { describe, expect, it } from "vitest";

import {
  INTAKE_FIELD_LIMITS,
  normalizeIntakePropertyKey,
  sanitizeIntakeText,
} from "@/lib/maintenance/intake-sanitize";

const cp = (code: number) => String.fromCodePoint(code);

// A regex matching ANY control/invisible character we expect to have been stripped (source stays ASCII).
const STRIPPED_CHARS = new RegExp(
  `[${cp(0x00)}-${cp(0x08)}${cp(0x0b)}${cp(0x0c)}${cp(0x0e)}-${cp(0x1f)}${cp(0x7f)}-${cp(0x9f)}` +
    `${cp(0x200b)}-${cp(0x200f)}${cp(0x202a)}-${cp(0x202e)}${cp(0x2060)}-${cp(0x2069)}${cp(0xfeff)}]`,
);

describe("sanitizeIntakeText", () => {
  it("trims and returns plain text unchanged", () => {
    expect(sanitizeIntakeText("  Leaky faucet in unit 3  ", "summary")).toBe(
      "Leaky faucet in unit 3",
    );
  });

  it("returns '' for non-string input", () => {
    expect(sanitizeIntakeText(undefined, "summary")).toBe("");
    expect(sanitizeIntakeText(42, "summary")).toBe("");
    expect(sanitizeIntakeText(null, "summary")).toBe("");
  });

  it("strips C0/C1 control characters but keeps tab + newline in descriptions", () => {
    // NUL between line1/line2, a real TAB + NEWLINE that must survive, and a C1 control (0x85).
    const input = `line1${cp(0x00)}line2\twith tab\nsecond${cp(0x85)}line`;
    const out = sanitizeIntakeText(input, "description");
    expect(out).toContain("line1line2");
    expect(out).toContain("\t");
    expect(out).toContain("\n");
    expect(out).toContain("secondline");
    expect(STRIPPED_CHARS.test(out)).toBe(false);
  });

  it("strips bidi overrides and zero-width characters (Trojan Source)", () => {
    const rlo = cp(0x202e); // right-to-left override
    const zwsp = cp(0x200b); // zero-width space
    const lri = cp(0x2066); // left-to-right isolate
    const pdi = cp(0x2069); // pop directional isolate
    const input = `admin${rlo}resu${zwsp}${lri}x${pdi}`;
    const out = sanitizeIntakeText(input, "summary");
    expect(out).toBe("adminresux");
    expect(STRIPPED_CHARS.test(out)).toBe(false);
  });

  it("neutralizes a formula/CSV-injection leading character", () => {
    expect(sanitizeIntakeText("=SUM(A1:A9)", "summary")).toBe("'=SUM(A1:A9)");
    expect(sanitizeIntakeText("+1-800", "contact")).toBe("'+1-800");
    expect(sanitizeIntakeText("@handle", "summary")).toBe("'@handle");
    expect(sanitizeIntakeText("normal text", "summary")).toBe("normal text");
  });

  it("hard-caps each field to its limit", () => {
    const long = "a".repeat(INTAKE_FIELD_LIMITS.summary + 500);
    expect(sanitizeIntakeText(long, "summary").length).toBe(INTAKE_FIELD_LIMITS.summary);
  });

  it("NFC-normalizes equal-looking strings", () => {
    // "é" as e + combining acute (0x65 0x301) vs the precomposed form (0xE9) must sanitize equal.
    const decomposed = `caf${cp(0x65)}${cp(0x301)}`;
    const precomposed = `caf${cp(0xe9)}`;
    expect(sanitizeIntakeText(decomposed, "summary")).toBe(
      sanitizeIntakeText(precomposed, "summary"),
    );
  });
});

describe("normalizeIntakePropertyKey", () => {
  it("accepts a compact safe key", () => {
    expect(normalizeIntakePropertyKey("  prop-123_A.b:c ")).toBe("prop-123_A.b:c");
  });

  it("rejects empty, oversized, spaced, or injection-shaped keys", () => {
    expect(normalizeIntakePropertyKey("")).toBeNull();
    expect(normalizeIntakePropertyKey("has space")).toBeNull();
    expect(normalizeIntakePropertyKey("=evil")).toBeNull();
    expect(normalizeIntakePropertyKey("../escape")).toBeNull();
    expect(normalizeIntakePropertyKey("a".repeat(200))).toBeNull();
    expect(normalizeIntakePropertyKey(123)).toBeNull();
  });
});
