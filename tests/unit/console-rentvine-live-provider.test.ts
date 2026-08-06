import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeaseExportReadResult } from "@/lib/integrations/rentvine/client";
import {
  createRentvineConsoleProvider,
  resetRentvineConsoleCacheForTests,
} from "@/lib/console/rentvine-live-provider";

const ACTOR = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
} as const;

function exportRow(id: number): Record<string, unknown> {
  return {
    lease: {
      leaseID: id,
      endDate: "2027-01-31T00:00:00.000Z",
      tenants: [{ name: `Household ${id}` }],
    },
    unit: {
      rent: "1250.00",
      streetName: "Maple Court",
      streetNumber: String(id),
    },
  };
}

function readerOf(rows: Record<string, unknown>[], complete = true) {
  return vi.fn(
    async (): Promise<LeaseExportReadResult> => ({ rows, pages: 1, complete }),
  );
}

describe("Console Rentvine Live provider", () => {
  beforeEach(() => resetRentvineConsoleCacheForTests());

  it("projects bounded authenticated operations without raw provider ids", async () => {
    const listAllLeasesExport = vi.fn(
      async (): Promise<LeaseExportReadResult> => ({
        rows: [
          {
            lease: {
              leaseID: 42,
              endDate: "2027-01-31T00:00:00.000Z",
              tenants: [{ name: "Test Household" }],
            },
            unit: {
              address2: "Unit 2",
              rent: "1250.00",
              streetName: "Maple Court",
              streetNumber: "204",
            },
          },
        ],
        pages: 1,
        complete: true,
      }),
    );
    const provider = createRentvineConsoleProvider({
      client: { listAllLeasesExport },
      now: () => new Date("2026-07-15T12:00:00.000Z"),
    });
    const result = await provider.load(ACTOR);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      currentRent: { value: "$1,250.00" },
      leaseEnd: { value: "2027-01-31T00:00:00.000Z" },
      property: { value: "204 Maple Court Unit 2" },
      tenant: { value: "Test Household" },
      workflowHref: "/lease-renewal/live",
    });
    expect(result.rows[0]?.rowKey).toMatch(/^rentvine-[a-f0-9]{24}$/);
    expect(JSON.stringify(result)).not.toContain('"leaseID":42');
  });

  // AC-S57-9: the display cap is applied AFTER a complete read, and the projection states the cap
  // as a subset of the read's stated total — never 30 rows with no sign that more exist.
  it("caps the display after a complete portfolio read and states the total", async () => {
    const rows = Array.from({ length: 305 }, (_, i) => exportRow(i + 1));
    const provider = createRentvineConsoleProvider({
      client: { listAllLeasesExport: readerOf(rows) },
      now: () => new Date("2026-08-06T12:00:00.000Z"),
    });
    const result = await provider.load(ACTOR);
    expect(result.rows).toHaveLength(30);
    const rentvineHealth = result.sourceHealth.find((h) => h.source === "Rentvine");
    expect(rentvineHealth?.state).toBe("fresh");
    expect(rentvineHealth?.guidance).toContain("30 of 305");
  });

  it("does not restate a capped subset when the whole portfolio fits the cap", async () => {
    const provider = createRentvineConsoleProvider({
      client: { listAllLeasesExport: readerOf([exportRow(1)]) },
      now: () => new Date("2026-08-06T12:00:00.000Z"),
    });
    const result = await provider.load(ACTOR);
    const rentvineHealth = result.sourceHealth.find((h) => h.source === "Rentvine");
    expect(rentvineHealth?.state).toBe("fresh");
    expect(rentvineHealth?.guidance).not.toContain(" of ");
  });

  it("degrades the source health when the paged read is incomplete", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => exportRow(i + 1));
    const provider = createRentvineConsoleProvider({
      client: { listAllLeasesExport: readerOf(rows, false) },
      now: () => new Date("2026-08-06T12:00:00.000Z"),
    });
    const result = await provider.load(ACTOR);
    const rentvineHealth = result.sourceHealth.find((h) => h.source === "Rentvine");
    expect(rentvineHealth?.state).toBe("needs_review");
    expect(rentvineHealth?.guidance).toContain("partial");
  });

  it("returns explicit source health when a read fails", async () => {
    const provider = createRentvineConsoleProvider({
      client: {
        listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
          throw new Error("secret provider detail");
        }),
      },
    });
    const result = await provider.load(ACTOR);
    expect(result.rows).toEqual([]);
    expect(result.sourceHealth[0]).toMatchObject({
      source: "Rentvine",
      state: "unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("secret provider detail");
  });
});
