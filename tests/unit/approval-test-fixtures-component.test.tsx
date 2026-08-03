import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("retired Approval Test fixture panel", () => {
  it("is absent while the ordinary Approval Queue remains mounted", () => {
    const queue = readFileSync(
      resolve(root, "components/approval/ApprovalQueue.tsx"),
      "utf8",
    );

    expect(
      existsSync(resolve(root, "components/approval/ApprovalTestFixturePanel.tsx")),
    ).toBe(false);
    expect(queue).not.toContain("ApprovalTestFixturePanel");
    expect(queue).toContain("QueueListPanel");
    expect(queue).toContain("QueueDetailPanel");
  });
});
