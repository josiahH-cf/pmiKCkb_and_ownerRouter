// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalQueueAdminPanel } from "@/components/admin/ApprovalQueueAdminPanel";
import {
  ADMIN_TASK_GROUPS,
  CONNECTION_TASK_GROUPS,
  TASK_NAVIGATION_LINKS,
} from "@/lib/navigation/admin-connections";

afterEach(cleanup);

describe("S179 Admin surfaces no longer present the retired notification email as a setup", () => {
  it("shows earlier queue email preferences for audit with no control to change them", () => {
    render(
      <ApprovalQueueAdminPanel
        initialSettings={[
          {
            id: "created",
            event_type: "created",
            trigger_condition: "Fixture trigger",
            subject_preview: "Fixture subject",
            cooldown_hours: 0,
            email_enabled: true,
            recipient_roles: ["Assignee"],
          } as never,
        ]}
      />,
    );
    const section = screen.getByRole("region", {
      name: "Earlier queue email preferences",
    });
    const boxes = within(section).getAllByRole("checkbox");
    expect(boxes).toHaveLength(5);
    for (const box of boxes) expect(box).toBeDisabled();
    expect(within(section).queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/legacy/i);
  });

  it("keeps legacy sender wording out of the Admin and Connections task copy", () => {
    const copy = JSON.stringify([
      ADMIN_TASK_GROUPS,
      CONNECTION_TASK_GROUPS,
      TASK_NAVIGATION_LINKS,
    ]);
    expect(copy).not.toMatch(/legacy/i);
    expect(copy).toContain("Workflow-linked Gmail status.");
    expect(readFileSync(join(process.cwd(), "app/admin/page.tsx"), "utf8")).not.toMatch(
      /legacy sender/i,
    );
  });
});
