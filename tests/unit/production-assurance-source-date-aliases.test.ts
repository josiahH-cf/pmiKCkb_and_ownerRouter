import { describe, expect, it } from "vitest";
import { projectIndependentRentVineRows } from "../../lib/production-assurance/renewal-source-projection";

describe("independent first-present lease date source", () => {
  it("reads the supported source alias only when earlier date fields are absent", () => {
    for (const field of [
      "leaseEndDate",
      "leaseTo",
      "expirationDate",
      "dateEnd",
      "moveOutDate",
    ]) {
      const [row] = projectIndependentRentVineRows(
        [{ lease: { leaseID: "41", endDate: null, [field]: "2027-02-28" } }],
        new Map(),
      );
      expect(row.endDate).toBe("2027-02-28");
    }
    const [primary] = projectIndependentRentVineRows(
      [{ lease: { leaseID: "41", endDate: "2027-01-31", moveOutDate: "2027-02-28" } }],
      new Map(),
    );
    expect(primary.endDate).toBe("2027-01-31");
  });
  it("does not hide an invalid primary date with a later valid alias or invent a missing date", () => {
    for (const lease of [
      { leaseID: "41", endDate: "unresolved", moveOutDate: "2027-02-28" },
      { leaseID: "41" },
    ]) {
      expect(projectIndependentRentVineRows([{ lease }], new Map())[0].endDate).toBe(
        "Needs Verification",
      );
    }
  });
});
