// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/connections" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { PrimaryNav } from "@/components/layout/PrimaryNav";

afterEach(cleanup);

const items = [
  { href: "/connections", label: "Connections" },
  { href: "/admin", label: "Admin" },
] as const;

describe("PrimaryNav task destinations", () => {
  it("marks Connections active on its route and preserves keyboard order", () => {
    navigation.pathname = "/connections";
    render(<PrimaryNav items={items} />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Connections", "Admin"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(links.every((link) => !link.hasAttribute("tabindex"))).toBe(true);
  });

  it("marks Admin active for a task-index subroute", () => {
    navigation.pathname = "/admin/migration";
    render(<PrimaryNav items={items} />);

    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Connections" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
