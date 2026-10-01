import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MaintenancePropertyPreapproval } from "@/lib/maintenance/property-preapproval";
import {
  planPreapprovalImport,
  type RentVinePropertyLimit,
} from "@/lib/maintenance/rentvine-preapproval-import";

// S108 amendment (B-MNT1): the import route is Admin-only, reads RentVine on request, and records
// nothing unless the re-read plan still has the exact hash the Admin confirmed. Values are synthetic.

const mocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" as string },
  source: { status: "ok", properties: [] as unknown[] } as Record<string, unknown>,
  current: [] as unknown[],
  imported: [] as unknown[],
  requireCapabilityInSpace: vi.fn(),
  importMaintenancePropertyPreapprovals: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: mocks.requireCapabilityInSpace,
}));

vi.mock("@/lib/maintenance/rentvine-property-limits", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/maintenance/rentvine-property-limits")>()),
  loadRentVinePropertyLimits: vi.fn(async () => mocks.source),
}));

vi.mock("@/lib/firestore/maintenance-property-preapprovals", async (importActual) => ({
  ...(await importActual<
    typeof import("@/lib/firestore/maintenance-property-preapprovals")
  >()),
  listMaintenancePropertyPreapprovals: vi.fn(async () => mocks.current),
  importMaintenancePropertyPreapprovals: mocks.importMaintenancePropertyPreapprovals,
}));

import {
  GET,
  POST,
} from "@/app/api/maintenance/property-preapprovals/rentvine-import/route";

const ROUTE_URL =
  "http://localhost/api/maintenance/property-preapprovals/rentvine-import";

function property(key: string, limit: string): RentVinePropertyLimit {
  return {
    propertyKey: key,
    label: `Sample property ${key}`,
    limitAmount: limit,
    maintenanceNotes: null,
    active: true,
  };
}

function post(body: unknown) {
  return POST(
    new Request(ROUTE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mocks.requireCapabilityInSpace.mockReset().mockImplementation(async () => mocks.user);
  mocks.importMaintenancePropertyPreapprovals
    .mockReset()
    .mockImplementation(async () => mocks.imported);
  mocks.source = {
    status: "ok",
    properties: [property("10", "500.00"), property("11", "250.00")],
  };
  mocks.current = [];
  mocks.imported = [];
});

describe("S108 RentVine preapproval import route (AC-S108-6 / AC-S108-7)", () => {
  it("previews the plan for a Maintenance Admin", async () => {
    const response = await GET();
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith(
      "manageAdmin",
      "maintenance",
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      plan: { rows: unknown[]; planHash: string };
    };
    expect(payload.plan.rows).toHaveLength(2);
    expect(payload.plan.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.importMaintenancePropertyPreapprovals).not.toHaveBeenCalled();
  });

  it("names why RentVine could not be read", async () => {
    mocks.source = { status: "not_configured" };
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "not_configured",
      error: expect.stringMatching(/RentVine is not connected/),
    });
  });

  it("records the confirmed plan with the chosen effective date", async () => {
    const plan = planPreapprovalImport(
      mocks.source.properties as RentVinePropertyLimit[],
      [],
    );
    const record: MaintenancePropertyPreapproval = {
      property_key: "10",
      amount_cents: 50_000,
      effective_from_iso: "2026-10-01T00:00:00.000Z",
      recorded_by_uid: "admin-1",
      version: 1,
    };
    mocks.imported = [record];
    const response = await post({
      plan_hash: plan.planHash,
      effective_from: "2026-10-01",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "imported",
      recorded: 1,
      unchanged: 0,
    });
    expect(mocks.importMaintenancePropertyPreapprovals).toHaveBeenCalledWith(mocks.user, {
      rows: plan.rows,
      effectiveFromIso: "2026-10-01T00:00:00.000Z",
      note: expect.stringMatching(
        /^Imported from the RentVine maintenance limit on \d{2}\/\d{2}\/\d{4}\.$/,
      ),
    });
  });

  it("refuses a confirmation whose preview no longer matches RentVine or the app", async () => {
    const stale = planPreapprovalImport(
      mocks.source.properties as RentVinePropertyLimit[],
      [],
    ).planHash;
    mocks.source = {
      status: "ok",
      properties: [property("10", "600.00"), property("11", "250.00")],
    };
    const response = await post({ plan_hash: stale, effective_from: "2026-10-01" });
    expect(response.status).toBe(409);
    expect(mocks.importMaintenancePropertyPreapprovals).not.toHaveBeenCalled();
  });

  it("refuses an inexact effective date or an unexpected field", async () => {
    const hash = planPreapprovalImport(
      mocks.source.properties as RentVinePropertyLimit[],
      [],
    ).planHash;
    expect((await post({ plan_hash: hash, effective_from: "2026-02-30" })).status).toBe(
      400,
    );
    expect(
      (await post({ plan_hash: hash, effective_from: "2026-10-01", amount_cents: 1 }))
        .status,
    ).toBe(400);
    expect(mocks.importMaintenancePropertyPreapprovals).not.toHaveBeenCalled();
  });
});
