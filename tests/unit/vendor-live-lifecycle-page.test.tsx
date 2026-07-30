// @vitest-environment jsdom

import fs from "node:fs";

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/admin/LiveVendorLifecyclePanel", () => ({
  LiveVendorLifecyclePanel: ({
    availability,
  }: {
    availability: Record<string, boolean>;
  }) => (
    <div
      data-assignment-available={String(availability["vendor.assignment.change"])}
      data-disable-available={String(availability["vendor.account.disable"])}
      data-invite-available={String(availability["vendor.account.invite"])}
      data-testid="live-vendor-controls"
    />
  ),
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: vi.fn(),
  requirePageSpaceAccess: vi.fn(),
}));
vi.mock("@/lib/integrations/action-gate", () => ({
  isActionExecutable: vi.fn(),
}));

import LiveVendorLifecyclePage from "@/app/admin/vendors/page";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { isActionExecutable } from "@/lib/integrations/action-gate";

beforeEach(() => {
  const actor = {
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin" as const,
    uid: "admin-1",
  };
  vi.mocked(requirePageCapability).mockResolvedValue(actor);
  vi.mocked(requirePageSpaceAccess).mockResolvedValue(actor);
  vi.mocked(isActionExecutable).mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("/admin/vendors environment fence", () => {
  it("is discoverable from the Admin page", () => {
    const adminPage = fs.readFileSync("app/admin/page.tsx", "utf8");

    expect(adminPage).toContain('href="/admin/vendors"');
    expect(adminPage).toContain("Manage Live Vendor accounts and assignments");
  });

  it("renders lifecycle controls with truthful closed-key availability in explicit Production+Live", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");

    render(await LiveVendorLifecyclePage());

    const controls = screen.getByTestId("live-vendor-controls");
    expect(controls).toBeInTheDocument();
    expect(controls).toHaveAttribute("data-invite-available", "false");
    expect(controls).toHaveAttribute("data-assignment-available", "false");
    expect(controls).toHaveAttribute("data-disable-available", "false");
    expect(isActionExecutable).toHaveBeenCalledWith("vendor.account.invite");
    expect(isActionExecutable).toHaveBeenCalledWith("vendor.assignment.change");
    expect(isActionExecutable).toHaveBeenCalledWith("vendor.account.disable");
    expect(
      screen.queryByRole("heading", { name: "Live controls are unavailable here" }),
    ).toBeNull();
    expect(requirePageSpaceAccess).toHaveBeenCalledWith("maintenance");
    expect(requirePageCapability).toHaveBeenCalledWith("manageAdmin");
  });

  it("passes independently opened action keys to the client controls", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    vi.mocked(isActionExecutable).mockImplementation(
      (actionKey) => actionKey === "vendor.assignment.change",
    );

    render(await LiveVendorLifecyclePage());

    const controls = screen.getByTestId("live-vendor-controls");
    expect(controls).toHaveAttribute("data-invite-available", "false");
    expect(controls).toHaveAttribute("data-assignment-available", "true");
    expect(controls).toHaveAttribute("data-disable-available", "false");
  });

  it.each([
    { environmentKind: "demo", dataContext: "demo" },
    { environmentKind: "demo", dataContext: "live_readonly" },
  ])(
    "renders no lifecycle controls in $environmentKind+$dataContext",
    async ({ environmentKind, dataContext }) => {
      vi.stubEnv("ENVIRONMENT_KIND", environmentKind);
      vi.stubEnv("DATA_CONTEXT", dataContext);

      render(await LiveVendorLifecyclePage());

      expect(screen.queryByTestId("live-vendor-controls")).toBeNull();
      expect(
        screen.getByRole("heading", { name: "Live controls are unavailable here" }),
      ).toBeInTheDocument();
    },
  );

  it("renders no lifecycle controls for the legacy Production descriptor", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "");
    vi.stubEnv("DATA_CONTEXT", "");
    vi.stubEnv("NODE_ENV", "production");

    render(await LiveVendorLifecyclePage());

    expect(screen.queryByTestId("live-vendor-controls")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Live controls are unavailable here" }),
    ).toBeInTheDocument();
  });

  it("fails closed when the environment descriptor is incomplete", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "");

    render(await LiveVendorLifecyclePage());

    expect(screen.queryByTestId("live-vendor-controls")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Live controls are unavailable here" }),
    ).toBeInTheDocument();
  });
});
