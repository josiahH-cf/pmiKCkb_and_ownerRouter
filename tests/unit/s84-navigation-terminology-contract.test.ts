import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("S84 bounded navigation terminology", () => {
  it("renames the two destination surfaces without renaming routes or internal models", () => {
    const consoleView = source("components/console/ConsoleView.tsx");
    const anticipated = source("components/console/ConsoleAnticipatedWork.tsx");
    const spaces = source("app/spaces/page.tsx");
    const spaceDetail = source("app/spaces/[spaceId]/page.tsx");

    expect(consoleView).toContain('<h1 className="section-title">Dashboard</h1>');
    expect(consoleView).not.toContain('<h1 className="section-title">Console</h1>');
    expect(anticipated).toContain(
      "Computed on request · it runs only when you open the Dashboard, and a person sends every message.",
    );
    expect(spaces).toContain('<h1 className="section-title">Internal Processes</h1>');
    expect(spaceDetail).toContain("Back to Internal Processes");
    expect(spaceDetail).toContain('href="/spaces"');
    expect(source("components/ask/AskForm.tsx")).toContain("Started from the Console.");
    expect(source("components/console/StartRunButton.tsx")).toContain(
      "Started from the Console anticipation lane.",
    );
  });

  it("uses the exact corrected notification ownership copy", () => {
    const notifications = source("app/notifications/page.tsx");
    const queueAdmin = source("components/admin/ApprovalQueueAdminPanel.tsx");

    expect(notifications).toContain(
      "Everything that needs your attention, newest first.",
    );
    expect(notifications).not.toContain("The Console stays your");
    expect(queueAdmin).toContain("In-app notifications stay on.");
    expect(queueAdmin).not.toContain("Console notifications stay on.");
  });

  it("keeps internal Space entity and scope terminology intact", () => {
    expect(source("components/work/WorkAccountabilityBoard.tsx")).toContain("All Spaces");
    expect(source("components/admin/UserManagementPanel.tsx")).toContain("Spaces");
    expect(source("components/admin/PublicationPolicyAdminPanel.tsx")).toContain(
      "Allowed Spaces",
    );
  });
});
