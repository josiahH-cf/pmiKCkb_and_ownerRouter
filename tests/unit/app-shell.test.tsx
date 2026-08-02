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

  it("hides the renewals-only Approval Queue from a maintenance-only principal", () => {
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
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
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
