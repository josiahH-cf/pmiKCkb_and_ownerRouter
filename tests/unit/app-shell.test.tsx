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
import { validateAuthClaims } from "@/lib/auth/session";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("AppShell role-based navigation", () => {
  it("S170 acknowledges selected routes while retaining the usable current screen", async () => {
    render(
      await AppShell({
        user: {
          uid: "admin",
          email: "admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
        },
        children: (
          <main>
            <input aria-label="Unsaved task" defaultValue="Keep this edit" />
          </main>
        ),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    fireEvent.click(screen.getByRole("link", { name: "Maintenance" }));
    expect(screen.getByRole("status", { name: "Page navigation" })).toHaveTextContent(
      /Opening Maintenance/,
    );
    expect(screen.getByLabelText("Unsaved task")).toHaveValue("Keep this edit");
  });
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

  // S167: a maintenance-only claim used to hide the Approval Queue and Lease Renewal links.
  it("shows an Editor with a leftover maintenance-only claim every Space link and self-service Admin access", async () => {
    vi.stubEnv("ALLOWED_HD", "pmikcmetro.com");
    render(
      await AppShell({
        user: validateAuthClaims({
          uid: "maintenance-editor",
          email: "maintenance-editor@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Editor",
          scopes: ["maintenance"],
        }),
        children: <main>Maintenance home</main>,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "My Work" }));
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Approval Queue" })).toHaveAttribute(
      "href",
      "/approval-queue",
    );
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    expect(screen.getByRole("link", { name: "Internal Processes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Maintenance" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lease Renewal" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByRole("link", { name: "Connections" })).toBeInTheDocument();
    // The role still keeps a non-Admin on the self-service access page.
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin/access",
    );
  });

  // S167: this Admin used to reach only the access-request lane of the Approval Queue.
  it("gives an Admin with a leftover maintenance-only claim the full Approval Queue and Admin", async () => {
    vi.stubEnv("ALLOWED_HD", "pmikcmetro.com");
    render(
      await AppShell({
        user: validateAuthClaims({
          uid: "scoped-admin",
          email: "scoped-admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
          scopes: ["maintenance"],
        }),
        children: <main>Maintenance Admin</main>,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "My Work" }));
    expect(screen.getByRole("link", { name: "Approval Queue" })).toHaveAttribute(
      "href",
      "/approval-queue",
    );
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    expect(screen.getByRole("link", { name: "Lease Renewal" })).toBeInTheDocument();
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
