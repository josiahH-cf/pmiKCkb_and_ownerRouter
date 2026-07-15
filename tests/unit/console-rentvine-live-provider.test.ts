import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRentvineConsoleProvider,
  resetRentvineConsoleCacheForTests,
} from "@/lib/console/rentvine-live-provider";

describe("Console Rentvine Live provider", () => {
  beforeEach(() => resetRentvineConsoleCacheForTests());

  it("projects bounded authenticated operations without raw provider ids", async () => {
    const listLeasesExport = vi.fn(async () => [
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
    ]);
    const provider = createRentvineConsoleProvider({
      client: { listLeasesExport },
      now: () => new Date("2026-07-15T12:00:00.000Z"),
    });
    const result = await provider.load({
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      uid: "admin-1",
    });
    expect(listLeasesExport).toHaveBeenCalledTimes(1);
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

  it("returns explicit source health when a read fails", async () => {
    const provider = createRentvineConsoleProvider({
      client: {
        listLeasesExport: vi.fn(async () => {
          throw new Error("secret provider detail");
        }),
      },
    });
    const result = await provider.load({
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      uid: "admin-1",
    });
    expect(result.rows).toEqual([]);
    expect(result.sourceHealth[0]).toMatchObject({
      source: "Rentvine",
      state: "unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("secret provider detail");
  });
});
