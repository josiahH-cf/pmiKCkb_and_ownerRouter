import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENT_ADDONS,
  rentsAgree,
  subsetSums,
  toRentAmount,
} from "@/lib/lease-renewal/rent";

describe("subsetSums", () => {
  it("includes the empty subset and all combinations", () => {
    expect(subsetSums([11.95, 28]).sort((a, b) => a - b)).toEqual([0, 11.95, 28, 39.95]);
  });
});

describe("toRentAmount", () => {
  it("coerces numbers and currency strings", () => {
    expect(toRentAmount(1250)).toBe(1250);
    expect(toRentAmount("$1,250")).toBe(1250);
    expect(toRentAmount("1289.95")).toBe(1289.95);
    expect(toRentAmount("")).toBeNull();
    expect(toRentAmount(null)).toBeNull();
  });
});

describe("rentsAgree (base rent vs sheet rent with folded-in add-ons)", () => {
  it("treats equal rents as agreeing", () => {
    expect(rentsAgree(1250, 1250)).toBe(true);
  });

  it("treats a gap explained by RBP + insurance as agreeing", () => {
    expect(rentsAgree(1289.95, 1250)).toBe(true); // 28 + 11.95
    expect(rentsAgree(1261.95, 1250)).toBe(true); // insurance only
    expect(rentsAgree(1278, 1250)).toBe(true); // RBP only
  });

  it("treats a real pricing difference as a genuine conflict", () => {
    expect(rentsAgree(1300, 1400)).toBe(false);
    expect(rentsAgree(1250, 1500)).toBe(false);
  });

  it("pins the tolerance boundary (cents drift in, a dollar out)", () => {
    expect(rentsAgree(1278.4, 1250)).toBe(true); // gap 28.4, within 0.5 of the 28 add-on
    expect(rentsAgree(1279, 1250)).toBe(false); // gap 29, outside tolerance of every subset sum
  });

  it("uses the documented default add-ons", () => {
    expect(DEFAULT_RENT_ADDONS).toContain(11.95);
    expect(DEFAULT_RENT_ADDONS).toContain(28);
  });
});
