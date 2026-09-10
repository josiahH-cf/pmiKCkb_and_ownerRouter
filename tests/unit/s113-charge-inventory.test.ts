import { describe, expect, it } from "vitest";
import { loadRenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory";
const charge = (id: string, accountId = "9") => ({
  leaseRecurringChargeID: id,
  leaseID: "81",
  accountID: accountId,
  amount: "1200",
  description: "Recurring rent",
  dayDue: "1",
  frequency: "1",
  startDate: "01/01/2026",
  endDate: null,
  isMoveInCharge: "0",
  isFromImport: "0",
  nextChargeDate: null,
  rentIncreaseID: null,
  importSourceKey: null,
  recurringStatusID: 1,
  account: { accountID: accountId, name: "Rent account", isRent: "1" },
});
function reads(entries: Record<string, unknown>[]) {
  return {
    getLease: async () => ({
      leaseID: "81",
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      increaseEligibilityDate: null,
      baseRentAmount: "1200",
      rentAmount: "1275",
    }),
    listRecurringCharges: async () => entries,
    getRecurringCharge: async (_leaseId: string, id: string) =>
      entries.find((e) => e.leaseRecurringChargeID === id)!,
  };
}
describe("S113 verified recurring charge selection", () => {
  it("preserves provider account classification without interpreting descriptions as rent", async () => {
    const rent = charge("301"),
      other = {
        ...charge("302", "10"),
        account: { accountID: "10", name: "Rent-like description", isRent: "0" },
      };
    const result = await loadRenewalChargeInventory(
      reads([rent, other]),
      "81",
      "2026-09-10",
    );
    expect(result.charges[0]).toMatchObject({
      id: "301",
      classification: "rent",
      current: true,
    });
    expect(result.charges[1]).toMatchObject({ id: "302", classification: "non_rent" });
  });
  it("refuses cross-lease, duplicate and changed list/detail identities", async () => {
    await expect(
      loadRenewalChargeInventory(
        reads([{ ...charge("301"), leaseID: "82" }]),
        "81",
        "2026-09-10",
      ),
    ).rejects.toThrow();
    await expect(
      loadRenewalChargeInventory(
        reads([charge("301"), charge("301")]),
        "81",
        "2026-09-10",
      ),
    ).rejects.toThrow();
    const source = reads([charge("301")]);
    source.getRecurringCharge = async () => charge("302");
    await expect(
      loadRenewalChargeInventory(source, "81", "2026-09-10"),
    ).rejects.toThrow();
  });
  it("keeps missing classification unknown and boundary-day schedules unresolved", async () => {
    const result = await loadRenewalChargeInventory(
      reads([
        {
          ...charge("301"),
          endDate: "09/10/2026",
          account: { accountID: "10", name: "Mismatched account", isRent: "1" },
        },
      ]),
      "81",
      "2026-09-10",
    );
    expect(result.charges[0]).toMatchObject({ classification: "unknown", current: null });
  });
});
