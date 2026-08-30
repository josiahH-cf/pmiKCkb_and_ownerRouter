// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminTaskIndex } from "@/components/admin/AdminTaskIndex";
import { ADMIN_TASK_GROUPS } from "@/lib/navigation/admin-connections";

afterEach(cleanup);

describe("AdminTaskIndex", () => {
  it("renders the five bounded task groups as ordinary keyboard links", () => {
    render(<AdminTaskIndex />);

    expect(screen.getByRole("heading", { name: "Find an Admin task" })).toBeVisible();
    for (const group of ADMIN_TASK_GROUPS) {
      expect(screen.getByRole("region", { name: group.label })).toBeVisible();
      for (const link of group.links) {
        expect(screen.getByRole("link", { name: link.label })).toHaveAttribute(
          "href",
          link.href,
        );
      }
    }
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("tabindex");
    }
  });

  it("states that the index grants no role, connection, or action authority", () => {
    render(<AdminTaskIndex />);

    expect(document.body.textContent).toContain(
      "They do not change roles, connection truth, or action authority.",
    );
    expect(document.body.textContent).not.toMatch(
      /API_KEY|CLIENT_SECRET|PASSWORD|TOKEN|@[a-z0-9.-]+\.[a-z]{2,}/i,
    );
  });
});
