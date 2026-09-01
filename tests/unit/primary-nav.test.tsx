// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrimaryNav } from "@/components/layout/PrimaryNav";
import type { ResolvedPrimaryNavigationGroup } from "@/lib/navigation/primary-navigation-contract";

const navigation = vi.hoisted(() => ({ pathname: "/connections" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const groups: readonly ResolvedPrimaryNavigationGroup[] = [
  {
    id: "admin",
    label: "Admin",
    tone: "admin",
    items: [
      {
        id: "connections",
        href: "/connections",
        label: "Connections",
        description: "Check connected-service status and available setup actions.",
        activePaths: ["/connections"],
        icon: "plug-connected",
      },
      {
        id: "admin",
        href: "/admin",
        label: "Admin",
        description: "Manage people, access, policies, and app readiness.",
        activePaths: ["/admin"],
        icon: "shield-user",
      },
    ],
  },
];

afterEach(cleanup);

describe("PrimaryNav task destinations", () => {
  it("marks Connections active and preserves ordinary-link keyboard order", () => {
    navigation.pathname = "/connections";
    render(<PrimaryNav groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: /Admin/ }));

    const links = screen.getAllByRole("link");
    expect(
      links.map(
        (link) =>
          document.getElementById(link.getAttribute("aria-labelledby") ?? "")
            ?.textContent,
      ),
    ).toEqual(["Connections", "Admin"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(links.every((link) => !link.hasAttribute("tabindex"))).toBe(true);
  });

  it("marks Admin active for a task-index subroute", () => {
    navigation.pathname = "/admin/migration";
    render(<PrimaryNav groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: /Admin/ }));

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Connections" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
