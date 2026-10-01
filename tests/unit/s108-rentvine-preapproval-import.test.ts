import { describe, expect, it, vi } from "vitest";

import {
  RentVineAuthError,
  type RentVineClient,
} from "@/lib/integrations/rentvine/client";
import type { LiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import type { MaintenancePropertyPreapproval } from "@/lib/maintenance/property-preapproval";
import {
  planPreapprovalImport,
  preapprovalImportChanges,
  rentVineLimitCents,
  type RentVinePropertyLimit,
} from "@/lib/maintenance/rentvine-preapproval-import";
import {
  loadRentVinePropertyLimits,
  toRentVinePropertyLimit,
} from "@/lib/maintenance/rentvine-property-limits";

// S108 amendment (owner decision 2026-10-01, B-MNT1): RentVine's per-property maintenance limit is
// imported as the app's preapproval only through an exact, hashed plan. Values are synthetic.

function property(
  key: string,
  limit: unknown,
  extra: Partial<RentVinePropertyLimit> = {},
): RentVinePropertyLimit {
  return {
    propertyKey: key,
    label: `Sample property ${key}`,
    limitAmount: limit,
    maintenanceNotes: null,
    active: true,
    ...extra,
  };
}

function current(
  key: string,
  cents: number,
  version = 1,
): MaintenancePropertyPreapproval {
  return {
    property_key: key,
    amount_cents: cents,
    effective_from_iso: "2026-01-01T00:00:00.000Z",
    recorded_by_uid: "admin-1",
    version,
  };
}

describe("S108 RentVine maintenance limit parsing (AC-S108-5)", () => {
  it("reads RentVine's plain decimal limit as exact cents", () => {
    expect(rentVineLimitCents("500.00")).toEqual({ kind: "amount", cents: 50_000 });
    expect(rentVineLimitCents("1250.5")).toEqual({ kind: "amount", cents: 125_050 });
    expect(rentVineLimitCents(750)).toEqual({ kind: "amount", cents: 75_000 });
    expect(rentVineLimitCents(" 300 ")).toEqual({ kind: "amount", cents: 30_000 });
  });

  it("treats an empty, null or zero limit as no limit", () => {
    for (const raw of [null, undefined, "", "  ", "0", "0.00", 0]) {
      expect(rentVineLimitCents(raw)).toEqual({ kind: "absent" });
    }
  });

  it("refuses a limit it cannot read exactly", () => {
    for (const raw of ["$500", "1,000.00", "-5", "12.345", "abc", true, {}]) {
      expect(rentVineLimitCents(raw)).toEqual({ kind: "invalid_amount" });
    }
  });

  it("refuses a limit above the app's preapproval limit", () => {
    expect(rentVineLimitCents("100000.01")).toEqual({ kind: "above_app_limit" });
    expect(rentVineLimitCents("100000.00")).toEqual({
      kind: "amount",
      cents: 10_000_000,
    });
  });
});

describe("S108 RentVine preapproval import plan (ARCH-S108-3 / BEH-S108-4)", () => {
  it("adds, changes or keeps each property with an exact limit", () => {
    const plan = planPreapprovalImport(
      [property("10", "500.00"), property("11", "250.00"), property("12", "400.00")],
      [current("11", 20_000, 3), current("12", 40_000, 2)],
    );
    expect(
      plan.rows.map((row) => [
        row.propertyKey,
        row.amountCents,
        row.currentAmountCents,
        row.currentVersion,
        row.action,
      ]),
    ).toEqual([
      ["10", 50_000, null, null, "add"],
      ["11", 25_000, 20_000, 3, "update"],
      ["12", 40_000, 40_000, 2, "unchanged"],
    ]);
    expect(preapprovalImportChanges(plan).map((row) => row.propertyKey)).toEqual([
      "10",
      "11",
    ]);
  });

  it("never clears an app preapproval for a property without a RentVine limit (AC-S108-5)", () => {
    const plan = planPreapprovalImport(
      [property("20", null), property("21", "0.00")],
      [current("20", 30_000), current("21", 10_000), current("22", 5_000)],
    );
    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(preapprovalImportChanges(plan)).toEqual([]);
  });

  it("skips inactive properties and lists unreadable ones for manual review", () => {
    const plan = planPreapprovalImport(
      [
        property("30", "500.00", { active: false }),
        property("31", "abc"),
        property("32", "200000.00"),
        property("33", "100.00"),
        property("33", "150.00"),
        property("x-1", "100.00"),
      ],
      [],
    );
    expect(plan.propertiesRead).toBe(6);
    expect(plan.rows).toEqual([]);
    expect(plan.skipped.map((skip) => [skip.propertyKey, skip.reason])).toEqual([
      ["31", "invalid_amount"],
      ["32", "above_app_limit"],
      ["33", "duplicate_property"],
      ["33", "duplicate_property"],
      ["x-1", "invalid_property"],
    ]);
  });

  it("carries RentVine maintenance notes for review and orders rows by property id", () => {
    const plan = planPreapprovalImport(
      [
        property("100", "300.00"),
        property("9", "200.00", { maintenanceNotes: "  Call the owner for HVAC work. " }),
      ],
      [],
    );
    expect(plan.rows.map((row) => row.propertyKey)).toEqual(["9", "100"]);
    expect(plan.rows[0].maintenanceNotes).toBe("Call the owner for HVAC work.");
    expect(plan.rows[1].maintenanceNotes).toBeNull();
  });

  it("keeps one hash for the same RentVine and app state", () => {
    const sources = [property("40", "500.00"), property("41", "250.00")];
    const first = planPreapprovalImport(sources, [current("41", 20_000)]);
    const second = planPreapprovalImport([...sources].reverse(), [current("41", 20_000)]);
    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.planHash).toBe(first.planHash);
  });

  it("changes the hash when any amount, version, note or skip changes (AC-S108-6)", () => {
    const base = planPreapprovalImport(
      [property("50", "500.00"), property("51", "250.00")],
      [current("51", 20_000, 1)],
    ).planHash;
    const variants = [
      planPreapprovalImport(
        [property("50", "500.01"), property("51", "250.00")],
        [current("51", 20_000, 1)],
      ),
      planPreapprovalImport(
        [property("50", "500.00"), property("51", "250.00")],
        [current("51", 20_000, 2)],
      ),
      planPreapprovalImport(
        [property("50", "500.00"), property("51", "250.00")],
        [current("51", 25_000, 1)],
      ),
      planPreapprovalImport(
        [
          property("50", "500.00", { maintenanceNotes: "New note" }),
          property("51", "250.00"),
        ],
        [current("51", 20_000, 1)],
      ),
      planPreapprovalImport(
        [property("50", "500.00"), property("51", "250.00"), property("52", "abc")],
        [current("51", 20_000, 1)],
      ),
    ];
    for (const variant of variants) expect(variant.planHash).not.toBe(base);
  });
});

describe("S108 RentVine property limit source", () => {
  it("keeps only the fields the import needs", () => {
    expect(
      toRentVinePropertyLimit({
        propertyID: "84",
        isActive: "1",
        name: null,
        address: "1 Sample St",
        city: "Sampletown",
        maintenanceLimitAmount: "500.00",
        maintenanceNotes: "  Call first  ",
        reserveAmount: "250.00",
      }),
    ).toEqual({
      propertyKey: "84",
      label: "1 Sample St, Sampletown",
      limitAmount: "500.00",
      maintenanceNotes: "Call first",
      active: true,
    });
    expect(
      toRentVinePropertyLimit({ propertyID: 85, isActive: "0", name: "Sample Commons" }),
    ).toMatchObject({
      propertyKey: "85",
      label: "Sample Commons",
      active: false,
      limitAmount: null,
    });
  });

  function configWith(
    listPropertiesPage: RentVineClient["listPropertiesPage"],
  ): LiveRentVineConfig {
    return {
      ok: true,
      rentvineClient: { listPropertiesPage } as unknown as RentVineClient,
    };
  }

  it("reads pages until a short page", async () => {
    const pages = vi.fn(async (page: number, pageSize: number) =>
      Array.from({ length: page === 1 ? pageSize : 21 }, (_, index) => ({
        propertyID: String(page * 1_000 + index),
        isActive: "1",
      })),
    );
    const outcome = await loadRentVinePropertyLimits(configWith(pages));
    expect(outcome.status).toBe("ok");
    expect(outcome.status === "ok" ? outcome.properties.length : 0).toBe(121);
    expect(pages.mock.calls.map(([page, size]) => [page, size])).toEqual([
      [1, 100],
      [2, 100],
    ]);
  });

  it("refuses a portfolio larger than one import reads instead of truncating it", async () => {
    const pages = vi.fn(async () =>
      Array.from({ length: 100 }, (_, index) => ({ propertyID: String(index + 1) })),
    );
    expect(await loadRentVinePropertyLimits(configWith(pages))).toEqual({
      status: "too_many",
    });
    expect(pages).toHaveBeenCalledTimes(20);
  });

  it("names a missing configuration, an auth refusal and a failed read", async () => {
    expect(
      await loadRentVinePropertyLimits({ ok: false, reason: "not_configured" }),
    ).toEqual({
      status: "not_configured",
    });
    expect(
      await loadRentVinePropertyLimits(
        configWith(async () => {
          throw new RentVineAuthError(401);
        }),
      ),
    ).toEqual({ status: "auth_error" });
    expect(
      await loadRentVinePropertyLimits(
        configWith(async () => {
          throw new Error("socket closed");
        }),
      ),
    ).toEqual({ status: "read_error" });
  });
});
