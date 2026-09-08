import { describe, expect, it } from "vitest";
import {
  deriveVerifiedTicketProperty,
  maintenancePropertyIdentity,
  effectivePropertyPreapproval,
} from "@/lib/maintenance/property-identity";
import { deriveUnitCandidatesFromExport } from "@/lib/maintenance/unit-matcher";

describe("S108 verified property identity", () => {
  it("derives a property from the exact verified unit without a work-order read", () => {
    expect(
      deriveVerifiedTicketProperty("unit:42", [
        { unitId: "unit:42", label: "Unit", propertyId: "21" },
      ]),
    ).toBe("21");
    expect(
      maintenancePropertyIdentity(
        { unit: { unitId: "unit:42" }, property_id: "21" },
        null,
      ),
    ).toEqual({ status: "verified", propertyId: "21" });
  });
  it("preserves an unknown legacy property and refuses conflicting sources", () => {
    expect(maintenancePropertyIdentity({ unit: { unitId: "unit:42" } }, null)).toEqual({
      status: "unknown",
      propertyId: null,
    });
    expect(
      maintenancePropertyIdentity(
        { unit: { unitId: "unit:42" }, property_id: "21" },
        { provider_snapshot: { property_id: "22" } },
      ),
    ).toEqual({ status: "conflict", propertyId: null });
    expect(
      deriveVerifiedTicketProperty("unit:42", [
        { unitId: "unit:42", label: "A", propertyId: "21" },
        { unitId: "unit:42", label: "B", propertyId: "22" },
      ]),
    ).toBeNull();
  });
  it("does not hide contradictory unit properties when deduplicating export rows", () => {
    const result = deriveUnitCandidatesFromExport([
      { unit: { unitID: "42", propertyID: "21" } },
      { unit: { unitID: "42", propertyID: "22" } },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).not.toHaveProperty("propertyId");
    expect(deriveVerifiedTicketProperty("unit:42", result.candidates)).toBeNull();
  });
});

it("waits until a recorded preapproval's effective date", () => {
  const record = {
    property_key: "21",
    amount_cents: 50000,
    effective_from_iso: "2026-10-01T00:00:00.000Z",
    recorded_by_uid: "admin",
    version: 1,
  };
  expect(effectivePropertyPreapproval(record, "2026-09-07T00:00:00.000Z")).toBeNull();
  expect(effectivePropertyPreapproval(record, "2026-10-01T00:00:00.000Z")).toBe(record);
});
