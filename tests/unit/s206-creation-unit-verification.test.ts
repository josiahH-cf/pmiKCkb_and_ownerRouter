import { it, expect } from "vitest";
import { verifyMaintenanceCreationUnit } from "@/lib/maintenance/verified-ticket-property";
import type { UnitSourceOutcome } from "@/lib/maintenance/live-unit-source";
const selected = { unitId: "unit:801", label: "Local 801 Fixture Lane" };
it("resolves the actual current unit and property without using an arbitrary browser label or ID", async () => {
  const good = async (): Promise<UnitSourceOutcome> => ({
    status: "ok",
    candidates: [{ ...selected, propertyId: "901" }],
    skipped: 0,
  });
  expect(await verifyMaintenanceCreationUnit(selected, good)).toBe("901");
  for (const unit of [
    { ...selected, unitId: "unit:999" },
    { ...selected, label: "Made-up name" },
  ])
    await expect(verifyMaintenanceCreationUnit(unit, good)).rejects.toMatchObject({
      status: 409,
    });
});
it("holds missing, ambiguous, conflicting, unknown-address and unavailable source inputs without fabricating a property", async () => {
  for (const candidates of [
    [],
    [selected, selected],
    [{ ...selected, propertyConflict: true as const }],
    [{ ...selected, label: "Needs Verification: missing address" }],
  ])
    await expect(
      verifyMaintenanceCreationUnit(selected, async () => ({
        status: "ok",
        candidates,
        skipped: 0,
      })),
    ).rejects.toMatchObject({ status: 409 });
  await expect(
    verifyMaintenanceCreationUnit(selected, async () => ({ status: "read_error" })),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await verifyMaintenanceCreationUnit(selected, async () => ({
      status: "ok",
      candidates: [selected],
      skipped: 0,
    })),
  ).toBeUndefined();
});
