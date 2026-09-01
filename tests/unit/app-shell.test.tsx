// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/NotificationMenu", () => ({
  NotificationMenu: () => null,
}));
vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));
vi.mock("@/lib/navigation/primary-navigation-projection", () => ({
  readPrimaryNavigationProjection: vi.fn(async (user: { role: string }) =>
    user.role === "Admin" ? { pendingAccessRequestCount: 3 } : {},
  ),
}));

import { AppShell } from "@/components/layout/AppShell";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("AppShell space-scoped navigation", () => {
  it("renders the explicit Live-read-only badge and hides the persistent write control", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "live_readonly");

    render(
      await AppShell({
        user: {
          uid: "admin",
          email: "admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
        },
        children: <main>Read-only Dashboard</main>,
      }),
    );

    expect(screen.getByText("Live data, read only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Feedback" })).toBeNull();
  });

  it("hides the renewals queue but exposes self-service Admin access to a maintenance-only principal", async () => {
    render(
      await AppShell({
        user: {
          uid: "maintenance-editor",
          email: "maintenance-editor@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Editor",
          scopes: ["maintenance"],
        } as const,
        children: <main>Maintenance home</main>,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "My Work" }));
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Approval Queue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    expect(screen.getByRole("link", { name: "Internal Processes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Maintenance" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lease Renewal" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByRole("link", { name: "Connections" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Approval Queue" })).toBeNull();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin/access",
    );
  });

  it("lets an Admin without Renewals scope reach only the global access lane", async () => {
    render(
      await AppShell({
        user: {
          uid: "scoped-admin",
          email: "scoped-admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
          scopes: ["maintenance"],
        },
        children: <main>Maintenance Admin</main>,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "My Work" }));
    expect(screen.getByRole("link", { name: "Approval Queue" })).toHaveAttribute(
      "href",
      "/approval-queue?view=access",
    );
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("preserves every existing destination under the three groups for a wildcard Admin", async () => {
    render(
      await AppShell({
        user: {
          uid: "admin",
          email: "admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
        },
        children: <main>Dashboard</main>,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "My Work" }));
    for (const link of ["My Work", "Dashboard", "Approval Queue"]) {
      expect(screen.getByRole("link", { name: link })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    for (const link of ["Lease Renewal", "Maintenance", "Internal Processes"]) {
      expect(screen.getByRole("link", { name: link })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    for (const link of ["Admin", "Connections", "Communications"]) {
      expect(screen.getByRole("link", { name: link })).toBeInTheDocument();
    }
  });
});
