import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  composeRentVineAddress,
  firstPresentString,
} from "@/lib/integrations/rentvine/address";
import { leaseAddressLabel } from "@/lib/integrations/rentvine/lease-mapper";

// S71 — lease identity and address truth. Every assertion here fails against the pre-S71 code, where
// leaseAddressLabel walked ["streetName","address","addressLine1","propertyAddress"] first-hit-wins
// and `streetName` (street NAME only, present on every record) therefore always won.
//
// All fixtures are synthetic. No live capture is read.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("composeRentVineAddress", () => {
  it("puts the house number in front of the street name", () => {
    expect(
      composeRentVineAddress({ streetNumber: "1234", streetName: "NE Example Ave" }),
    ).toBe("1234 NE Example Ave");
  });

  it("appends a unit designator when the record carries one", () => {
    expect(
      composeRentVineAddress({
        streetNumber: "204",
        streetName: "Sample Court",
        address2: "Unit 2",
      }),
    ).toBe("204 Sample Court Unit 2");
  });

  it("accepts a numeric house number", () => {
    expect(composeRentVineAddress({ streetNumber: 7, streetName: "Sample St" })).toBe(
      "7 Sample St",
    );
  });

  it("falls back to a whole-address key only when no parts compose", () => {
    expect(composeRentVineAddress({ address: "9 Whole Address Rd" })).toBe(
      "9 Whole Address Rd",
    );
  });

  it("returns null rather than a fabricated address when nothing is present", () => {
    for (const empty of [{}, null, undefined, [], "nope", 7]) {
      expect(composeRentVineAddress(empty)).toBeNull();
    }
  });

  it("does not silently widen to renewal-only keys", () => {
    // `propertyAddress` is a renewal-path fallback and must NOT live in the shared composer, or the
    // consolidation would change maintenance unit matching and a value persisted on live tickets.
    expect(composeRentVineAddress({ propertyAddress: "5 Renewal Only Way" })).toBeNull();
  });
});

describe("leaseAddressLabel", () => {
  it("renders the house number from the property append", () => {
    const label = leaseAddressLabel({
      property: { streetNumber: "1234", streetName: "NE Example Ave" },
    } as never);
    expect(label).toBe("1234 NE Example Ave");
    // The regression guard: street-name-only is exactly what the old key walk produced.
    expect(label).not.toBe("NE Example Ave");
  });

  it("distinguishes two leases on the same street", () => {
    const a = leaseAddressLabel({
      property: { streetNumber: "1200", streetName: "Sample St" },
    } as never);
    const b = leaseAddressLabel({
      property: { streetNumber: "1300", streetName: "Sample St" },
    } as never);
    expect(a).not.toBe(b);
    expect(a).toBe("1200 Sample St");
    expect(b).toBe("1300 Sample St");
  });

  it("prefers the property append over the lease itself", () => {
    expect(
      leaseAddressLabel({
        property: { streetNumber: "1", streetName: "Property Way" },
        streetNumber: "2",
        streetName: "Lease Way",
      } as never),
    ).toBe("1 Property Way");
  });

  it("keeps propertyAddress as a renewal-only fallback", () => {
    expect(
      leaseAddressLabel({ property: { propertyAddress: "8 Fallback Rd" } } as never),
    ).toBe("8 Fallback Rd");
  });

  it("returns undefined when the record carries no address", () => {
    expect(leaseAddressLabel({} as never)).toBeUndefined();
    expect(leaseAddressLabel({ property: [] } as never)).toBeUndefined();
  });

  it("produces a label a numeric-token matcher can resolve", () => {
    // lib/ask/renewal-target.ts requires a numeric token followed by a street word. Under the old
    // street-only label that was never satisfiable, so Ask could never resolve a live renewal target.
    const label = leaseAddressLabel({
      property: { streetNumber: "1234", streetName: "NE Example Ave" },
    } as never)!;
    expect(/\b\d+\b/.test(label)).toBe(true);
    expect(label.split(/\s+/)[0]).toMatch(/^\d+$/);
  });
});

describe("firstPresentString", () => {
  it("trims strings, stringifies finite numbers, and skips everything else", () => {
    expect(firstPresentString({ a: "  x  " }, ["a"])).toBe("x");
    expect(firstPresentString({ a: 12 }, ["a"])).toBe("12");
    expect(firstPresentString({ a: "   " }, ["a"])).toBeNull();
    expect(firstPresentString({ a: Number.NaN }, ["a"])).toBeNull();
    expect(firstPresentString({ a: null, b: "y" }, ["a", "b"])).toBe("y");
  });
});

// AC-S71-3: exactly one composer is reachable. Scans real source, ignoring comments and tests, so a
// fourth implementation cannot be reintroduced without turning this red.
describe("AC-S71-3 — one composer, not four", () => {
  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        sourceFiles(full, acc);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        acc.push(full);
      }
    }
    return acc;
  }

  /** Strip block and line comments so a documented key name is not mistaken for an implementation. */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  }

  it("composes streetNumber in exactly one file under lib/", () => {
    const offenders = sourceFiles(join(root, "lib"))
      .filter((file) =>
        stripComments(readFileSync(file, "utf8")).includes('"streetNumber"'),
      )
      .map((file) => file.slice(root.length + 1).replace(/\\/g, "/"));

    expect(
      offenders,
      `streetNumber composition found in: ${offenders.join(", ")}`,
    ).toEqual(["lib/integrations/rentvine/address.ts"]);
  });

  it("leaves no first-hit-wins street-name key walk behind", () => {
    // Matches the CODE SHAPE (a for-of over a key array whose first member is the street-name key),
    // not a quoted literal. An earlier version searched for the literal array, which collided with
    // the doc comments describing the very defect it guards against.
    const keyWalk = /for\s*\(\s*const\s+\w+\s+of\s*\[\s*"streetName"/;
    const offenders = sourceFiles(join(root, "lib"))
      .filter((file) => keyWalk.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => file.slice(root.length + 1).replace(/\\/g, "/"));

    expect(offenders, `the old key walk survives in: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });
});
