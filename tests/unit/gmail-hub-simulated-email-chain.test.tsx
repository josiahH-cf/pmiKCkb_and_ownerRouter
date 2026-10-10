import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const componentPath = join(
  process.cwd(),
  "components",
  "gmail-hub",
  "SimulatedEmailChain.tsx",
);
const homePath = join(process.cwd(), "components", "gmail-hub", "GmailHubHome.tsx");

describe("retired browser email simulator", () => {
  it("removes the shipped simulator component", () => {
    expect(existsSync(componentPath)).toBe(false);
  });

  it("removes the simulator import and render from Workflow Communications", () => {
    const source = readFileSync(homePath, "utf8");
    expect(source).not.toMatch(/SimulatedEmailChain/);
    expect(source).not.toMatch(
      /Simulated email chain|Add simulated reply|Reset demo thread/,
    );
  });

  it("uses the linked-workflow hub while keeping Gmail discovery in its scoped Incoming tab", () => {
    const source = readFileSync(homePath, "utf8");
    expect(source).toMatch(/<WorkflowCommunicationsHub/);
    expect(source).toMatch(/Workflow Communications/);
  });
});
