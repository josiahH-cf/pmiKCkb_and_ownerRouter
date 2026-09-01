// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/NotificationMenu", () => ({
  NotificationMenu: () => null,
}));
vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import { AppShell } from "@/components/layout/AppShell";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("AppShell space-scoped navigation", () => {
  it("renders the explicit Live-read-only badge and hides the persistent write control", () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "live_readonly");

    render(
      <AppShell
        user={{
          uid: "admin",
          email: "admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
        }}
      >
        <main>Read-only Console</main>
      </AppShell>,
    );

    expect(screen.getByText("Live data, read only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Feedback" })).toBeNull();
  });

  it("hides the renewals queue but exposes self-service Admin access to a maintenance-only principal", () => {
    render(
      <AppShell
        user={
          {
            uid: "maintenance-editor",
            email: "maintenance-editor@pmikcmetro.com",
            hd: "pmikcmetro.com",
            role: "Editor",
            scopes: ["maintenance"],
          } as const
        }
      >
        <main>Maintenance home</main>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Console" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spaces" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connections" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Approval Queue" })).toBeNull();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin/access",
    );
  });

  it("lets an Admin without Renewals scope reach only the global access lane", () => {
    render(
      <AppShell
        user={{
          uid: "scoped-admin",
          email: "scoped-admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
          scopes: ["maintenance"],
        }}
      >
        <main>Maintenance Admin</main>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Approval Queue" })).toHaveAttribute(
      "href",
      "/approval-queue?view=access",
    );
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("preserves every existing nav item for a wildcard Admin", () => {
    render(
      <AppShell
        user={{
          uid: "admin",
          email: "admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role: "Admin",
        }}
      >
        <main>Console</main>
      </AppShell>,
    );

    for (const link of [
      "Console",
      "Spaces",
      "Approval Queue",
      "Communications",
      "Connections",
      "Admin",
    ]) {
      expect(screen.getByRole("link", { name: link })).toBeInTheDocument();
    }
  });
});
