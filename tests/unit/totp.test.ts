import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateTotp,
  generateTotpSecret,
  totpAuthUri,
  verifyTotp,
} from "@/lib/auth/totp";

// RFC 6238 Appendix B reference secret: ASCII "12345678901234567890" (20 bytes), base32-encoded.
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// RFC 6238 Appendix B SHA-1 vectors, truncated to the 6-digit codes authenticator apps display.
const RFC_VECTORS: Array<[time: number, code: string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("base32", () => {
  it("decodes the RFC reference secret to its ASCII bytes", () => {
    const decoded = Buffer.from(base32Decode(RFC_SECRET_B32)).toString("ascii");
    expect(decoded).toBe(RFC_SECRET_ASCII);
  });

  it("round-trips encode(decode(x)) for the reference and a random secret", () => {
    expect(base32Encode(base32Decode(RFC_SECRET_B32))).toBe(RFC_SECRET_B32);
    const random = generateTotpSecret();
    expect(base32Encode(base32Decode(random))).toBe(random);
  });

  it("tolerates lowercase/spaces and rejects invalid characters", () => {
    expect(base32Encode(base32Decode("gezd gnbv"))).toBe("GEZDGNBV");
    expect(() => base32Decode("0189!")).toThrow();
  });
});

describe("generateTotp (RFC 6238 vectors)", () => {
  it.each(RFC_VECTORS)("T=%i produces %s", (time, code) => {
    expect(generateTotp({ secret: RFC_SECRET_B32, digits: 6 }, time)).toBe(code);
  });
});

describe("verifyTotp", () => {
  it("accepts the code valid for the current period", () => {
    expect(
      verifyTotp({ secret: RFC_SECRET_B32 }, "050471", { nowSeconds: 1111111111 }),
    ).toBe(true);
  });

  it("tolerates one period of skew within the window but not with window 0", () => {
    const previous = generateTotp({ secret: RFC_SECRET_B32 }, 1111111079);
    expect(
      verifyTotp({ secret: RFC_SECRET_B32 }, previous, {
        nowSeconds: 1111111109,
        window: 1,
      }),
    ).toBe(true);
    expect(
      verifyTotp({ secret: RFC_SECRET_B32 }, previous, {
        nowSeconds: 1111111109,
        window: 0,
      }),
    ).toBe(false);
  });

  it("rejects a wrong code and malformed input", () => {
    expect(
      verifyTotp({ secret: RFC_SECRET_B32 }, "000000", { nowSeconds: 1111111111 }),
    ).toBe(false);
    expect(verifyTotp({ secret: RFC_SECRET_B32 }, "12345", { nowSeconds: 59 })).toBe(
      false,
    );
    expect(verifyTotp({ secret: RFC_SECRET_B32 }, "abcdef", { nowSeconds: 59 })).toBe(
      false,
    );
  });

  it("accepts a code with incidental whitespace", () => {
    expect(
      verifyTotp({ secret: RFC_SECRET_B32 }, "050 471", { nowSeconds: 1111111111 }),
    ).toBe(true);
  });
});

describe("generateTotpSecret", () => {
  it("returns a 32-character base32 secret for the default 20 bytes", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/u);
  });
});

describe("totpAuthUri", () => {
  it("builds an otpauth URI carrying the secret, issuer, and 6-digit/30s params", () => {
    const uri = totpAuthUri({
      secret: RFC_SECRET_B32,
      accountName: "owner@pmikcmetro.com",
      issuer: "PMI KC KB",
    });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    const query = new URLSearchParams(uri.slice(uri.indexOf("?") + 1));
    expect(query.get("secret")).toBe(RFC_SECRET_B32);
    expect(query.get("issuer")).toBe("PMI KC KB");
    expect(query.get("digits")).toBe("6");
    expect(query.get("period")).toBe("30");
    expect(query.get("algorithm")).toBe("SHA1");
    // The label is issuer:account, URL-encoded.
    expect(uri).toContain(encodeURIComponent("PMI KC KB:owner@pmikcmetro.com"));
  });
});
