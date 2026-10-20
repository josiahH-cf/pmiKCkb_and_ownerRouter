import { expect, it, vi } from "vitest";
import { searchEntities } from "@/lib/search/server-search";
import { SEARCHABLE_ENTITY_TYPES } from "@/lib/search/entity-types";
import type { AuthenticatedUser } from "@/lib/auth/session";
it("does not read retired sources or present them as access/connection limitations in shared search", async () => {
  const actor: AuthenticatedUser = {
    uid: "fixture-staff",
    email: "fixture@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  };
  const maintenance = vi.fn(),
    vendors = vi.fn();
  const page = await searchEntities(
    actor,
    { q: "fixture", type: "all", limit: 20 },
    {
      renewals: async () => ({
        source: "renewals",
        status: "ok",
        asOf: "2026-10-20T12:00:00Z",
        note: null,
        entities: [],
      }),
      maintenance,
      vendors,
    },
  );
  expect(maintenance).not.toHaveBeenCalled();
  expect(vendors).not.toHaveBeenCalled();
  expect(page.limitations).toEqual([]);
  expect(SEARCHABLE_ENTITY_TYPES).not.toContain("ticket");
  expect(SEARCHABLE_ENTITY_TYPES).not.toContain("vendor");
});
