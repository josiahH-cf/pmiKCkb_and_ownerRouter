import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/lib/firestore/renewal-rehearsal-sheet-config", async (importActual) => ({
  ...(await importActual<
    typeof import("@/lib/firestore/renewal-rehearsal-sheet-config")
  >()),
  readRenewalRehearsalSheetAdminConfig: mocks.read,
  updateRenewalRehearsalSheetAdminConfig: mocks.update,
}));

import { GET, PATCH } from "@/app/api/admin/renewal-rehearsal-sheet/route";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

afterEach(() => vi.clearAllMocks());

function patch(body: unknown) {
  return PATCH(
    new Request("https://example.test/api/admin/renewal-rehearsal-sheet", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("Admin rehearsal-Sheet route", () => {
  it("reads through manageAdmin", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    mocks.read.mockResolvedValue({ rehearsal: { configured: false } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.requireCapability).toHaveBeenCalledWith("manageAdmin");
    expect(mocks.read).toHaveBeenCalledWith(admin);
  });

  it("validates and saves only through manageAdmin", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    mocks.update.mockResolvedValue({
      operating: { configured: true },
      rehearsal: { configured: true, spreadsheetId: "copy" },
    });
    const response = await patch({ spreadsheet: "copy" });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(admin, { spreadsheet: "copy" });
  });

  it("rejects extra or blank fields before saving", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    expect((await patch({ spreadsheet: "", extra: true })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
