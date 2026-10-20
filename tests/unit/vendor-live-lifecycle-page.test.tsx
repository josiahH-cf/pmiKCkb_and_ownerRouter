import fs from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redirect: vi.fn(), gate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/operations/runtime-suspension-gate", () => ({
  isProductionRuntimeActionExecutable: mocks.gate,
}));
import RetiredVendorPage from "@/app/admin/vendors/page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirected");
  });
});
it("removes the obsolete Vendor admin entry from the active Admin surface", () => {
  const source = fs.readFileSync("app/admin/page.tsx", "utf8");
  expect(source).not.toContain('href="/admin/vendors"');
  expect(source).not.toContain("Manage Live Vendor accounts and assignments");
});
it("redirects the legacy Vendor page before any key or lifecycle provider can be read", () => {
  expect(() => RetiredVendorPage()).toThrow("redirected");
  expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/lease-renewal");
  expect(mocks.gate).not.toHaveBeenCalled();
});
