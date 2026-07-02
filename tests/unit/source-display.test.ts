import { describe, expect, it } from "vitest";

import { displaySourceLabel } from "@/lib/lease-renewal/source-display";
import { RENTVINE_SOURCE_SYSTEM } from "@/lib/integrations/rentvine/lease-mapper";

describe("displaySourceLabel", () => {
  it("strips the read-authoritative qualifier and normalizes the RentVine brand", () => {
    expect(displaySourceLabel("Rentvine (read-authoritative)")).toBe("RentVine");
    expect(displaySourceLabel(RENTVINE_SOURCE_SYSTEM)).toBe("RentVine");
    expect(displaySourceLabel("rentvine")).toBe("RentVine");
    expect(displaySourceLabel("Rentvine building level")).toBe("RentVine building level");
  });

  it("leaves other source labels unchanged", () => {
    expect(displaySourceLabel("Renewal sheet")).toBe("Renewal sheet");
    expect(displaySourceLabel("Google Form intake")).toBe("Google Form intake");
    expect(displaySourceLabel("Zillow")).toBe("Zillow");
    expect(displaySourceLabel("Sheet")).toBe("Sheet");
  });

  it("is idempotent on an already-clean label", () => {
    expect(displaySourceLabel(displaySourceLabel(RENTVINE_SOURCE_SYSTEM))).toBe(
      "RentVine",
    );
  });

  it("does NOT mutate the internal source-system constant (render seam only)", () => {
    // The stored value keeps its authoritative qualifier so the pipeline / golden data are untouched.
    expect(RENTVINE_SOURCE_SYSTEM).toBe("Rentvine (read-authoritative)");
  });
});
