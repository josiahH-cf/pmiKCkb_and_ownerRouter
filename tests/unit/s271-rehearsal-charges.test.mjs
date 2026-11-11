import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { currentBaseRent } from "@/lib/lease-renewal/current-rent";
import { loadRenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory";
import { projectRecurringCharge } from "@/lib/lease-renewal/writeback/proposal-contract";
import { setRecurringCharges } from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  checkNovember5MixShape,
  loadNovember5Mix,
  readNovember5Mix,
  rentvineStandInResponse,
  summarizeNovember5Mix,
} from "../../scripts/lib/one-path-rehearsal/november-5-mix.mjs";
import {
  baseRentCharges,
  offerCharges,
  syntheticCharge,
} from "../../scripts/lib/one-path-rehearsal/synthetic-charges.mjs";

// S271: the rehearsal transport serves synthetic recurring charges only when its control flag
// names a lease. Without the flag every lease still has none, as before (the S260 replay's
// assumption), and the November 5 mix itself is unchanged.

const fixture = readNovember5Mix();
const mix = loadNovember5Mix(fixture, "2026-11-10");
const row = mix.leases.find((entry) => entry.lease.leaseID === 9101);
const lease = {
  leaseId: 9101,
  startDate: row.lease.startDate,
  rent: Number(row.unit.rent),
  secondPetStart: "2026-03-01",
  endedPetEnd: "2026-06-30",
};
const url = (path) => new URL("https://pmikcmetro.rentvine.com/api/manager/" + path);

/** The RentVine client's own unwrapping: list envelopes and the detail merge their account. */
function readsFor(flags) {
  const unwrap = (entry) => ({ ...entry.recurringCharge, account: entry.account });
  return {
    getLease: async (id) =>
      rentvineStandInResponse(mix, url("leases/" + id), flags).body.lease,
    listRecurringCharges: async (id) =>
      rentvineStandInResponse(mix, url(`leases/${id}/recurring-charges`), flags).body.map(
        unwrap,
      ),
    getRecurringCharge: async (id, chargeId) => {
      const body = rentvineStandInResponse(
        mix,
        url(`leases/${id}/recurring-charges/${chargeId}?includes=account`),
        flags,
      ).body;
      if (!body) throw new Error("404");
      return unwrap(body);
    },
  };
}

describe("S271 synthetic recurring charges in the rehearsal transport", () => {
  it("serves none for any lease without the flag, as before", () => {
    expect(
      rentvineStandInResponse(mix, url("leases/9101/recurring-charges")).body,
    ).toEqual([]);
    expect(
      rentvineStandInResponse(mix, url("leases/9101/recurring-charges/61001")).body,
    ).toBeUndefined();
    expect(checkNovember5MixShape(fixture, "2026-11-10")).toEqual([]);
    expect(summarizeNovember5Mix(mix).problems).toEqual([]);
  });

  it("serves one lease's envelopes for the list and each detail, and no other lease's", () => {
    const charges = baseRentCharges(lease, "ready");
    const flags = { recurringCharges: { 9101: charges } };
    expect(
      rentvineStandInResponse(mix, url("leases/9101/recurring-charges"), flags).body,
    ).toEqual(charges);
    expect(
      rentvineStandInResponse(mix, url("leases/9101/recurring-charges/61002"), flags)
        .body,
    ).toEqual(charges[1]);
    expect(
      rentvineStandInResponse(mix, url("leases/9102/recurring-charges"), flags).body,
    ).toEqual([]);
  });

  it("builds charges the app's strict projection accepts", () => {
    for (const entry of [
      ...baseRentCharges(lease, "ready"),
      ...baseRentCharges(lease, "combined"),
      ...offerCharges(lease, "drift"),
    ])
      expect(projectRecurringCharge(entry.recurringCharge).leaseRecurringChargeID).toBe(
        entry.recurringCharge.leaseRecurringChargeID,
      );
  });

  it("gives N10-01 a ready base with a separate pet line, and a conflicting combined charge", async () => {
    const ready = await loadRenewalChargeInventory(
      readsFor({ recurringCharges: { 9101: baseRentCharges(lease, "ready") } }),
      "9101",
      "2026-11-10",
    );
    const decided = currentBaseRent({ inventory: ready, contractualRent: lease.rent });
    expect(decided.state).toBe("ready");
    expect(decided.amount).toBe(lease.rent);
    expect(decided.check).toBeNull();
    expect(decided.separateCharges).toEqual([
      { id: "61002", label: "Synthetic Pet Rent", amount: 40 },
    ]);
    const combined = await loadRenewalChargeInventory(
      readsFor({ recurringCharges: { 9101: baseRentCharges(lease, "combined") } }),
      "9101",
      "2026-11-10",
    );
    const conflict = currentBaseRent({
      inventory: combined,
      contractualRent: lease.rent,
    });
    expect(conflict.state).toBe("needs_verification");
    expect(conflict.check).toMatchObject({ kind: "conflict", leads: true });
  });

  it("gives N10-04 two lines of one account, an ended line and a refused duplicate id", async () => {
    const complete = await loadRenewalChargeInventory(
      readsFor({ recurringCharges: { 9101: offerCharges(lease, "unmapped") } }),
      "9101",
      "2026-11-10",
    );
    const byId = Object.fromEntries(
      complete.charges.map((charge) => [charge.id, charge]),
    );
    expect(byId["61011"].accountId).toBe(byId["61012"].accountId);
    expect(byId["61011"].current).toBe(true);
    expect(byId["61012"].current).toBe(true);
    expect(byId["61013"].current).toBe(false);
    expect(byId["61041"].classification).toBe("non_rent");
    await expect(
      loadRenewalChargeInventory(
        readsFor({ recurringCharges: { 9101: offerCharges(lease, "duplicate") } }),
        "9101",
        "2026-11-10",
      ),
    ).rejects.toThrow();
    const drift = offerCharges(lease, "drift").find(
      (entry) => entry.recurringCharge.leaseRecurringChargeID === "61021",
    );
    expect(drift.recurringCharge.amount).toBe("30.00");
    expect(drift.recurringCharge.description).toMatch(/revised/);
  });

  it("keeps every synthetic value plainly invented", () => {
    const entry = syntheticCharge({
      leaseId: 9101,
      chargeId: 61099,
      accountId: 4100,
      accountName: "Synthetic Rent",
      isRent: true,
      amount: 1,
      description: "Synthetic",
      startDate: "2026-01-01",
    });
    expect(entry.recurringCharge.amount).toBe("1.00");
    expect(entry.account).toEqual({
      accountID: "4100",
      name: "Synthetic Rent",
      isRent: 1,
    });
    for (const charge of offerCharges(lease, "unmapped"))
      expect(charge.account.name).toMatch(/^Synthetic /);
  });
});

describe("S271 control: setRecurringCharges writes the flag for one fixture lease", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const described = () => {
    dir = mkdtempSync(join(tmpdir(), "s271-charges-"));
    return {
      groups: summarizeNovember5Mix(mix).groups,
      files: { rentvineControl: join(dir, "rentvine-control.json") },
    };
  };

  it("sets, keeps other flags and clears", () => {
    const rehearsal = described();
    setRecurringCharges(rehearsal, 9101, baseRentCharges(lease, "ready"));
    const flags = JSON.parse(readFileSync(rehearsal.files.rentvineControl, "utf8"));
    expect(Object.keys(flags.recurringCharges)).toEqual(["9101"]);
    setRecurringCharges(rehearsal, 9101, null);
    expect(
      JSON.parse(readFileSync(rehearsal.files.rentvineControl, "utf8")).recurringCharges,
    ).toEqual({});
  });

  it("refuses another lease's charges, a non-fixture lease and a malformed id", () => {
    const rehearsal = described();
    expect(() =>
      setRecurringCharges(rehearsal, 9102, baseRentCharges(lease, "ready")),
    ).toThrow(/own synthetic/);
    expect(() => setRecurringCharges(rehearsal, 4821, [])).toThrow(
      /existing fixture lease/,
    );
    const broken = baseRentCharges(lease, "ready");
    broken[0].recurringCharge.leaseRecurringChargeID = "0x1";
    expect(() => setRecurringCharges(rehearsal, 9101, broken)).toThrow(/own synthetic/);
  });
});
