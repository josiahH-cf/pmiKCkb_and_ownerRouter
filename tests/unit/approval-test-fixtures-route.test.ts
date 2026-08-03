import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const fixtureRoute = "app/api/approval-queue/test-fixtures/route.ts";

describe("retired Approval Queue fixture route", () => {
  it("removes the Production Test-fixture route instead of leaving a dormant handler", () => {
    expect(existsSync(resolve(root, fixtureRoute))).toBe(false);
  });

  it("keeps the ordinary read-only Approval Queue route", () => {
    const route = readFileSync(resolve(root, "app/api/approval-queue/route.ts"), "utf8");

    expect(route).toContain("export async function GET");
    expect(route).toContain('requireCapabilityInSpace("read", "renewals")');
    expect(route).not.toContain("test-fixtures");
  });

  it("removes both the fixture restorer and its confirmation contract", () => {
    expect(existsSync(resolve(root, "lib/firestore/approval-test-fixtures.ts"))).toBe(
      false,
    );
    expect(existsSync(resolve(root, "lib/approval/test-fixture-contract.ts"))).toBe(
      false,
    );
  });

  it("leaves no shipped import or URL reference to the removed fixture surface", () => {
    for (const relative of [
      "app/api/approval-queue/route.ts",
      "components/approval/ApprovalQueue.tsx",
      "lib/firestore/approval-queue.ts",
    ]) {
      const source = readFileSync(resolve(root, relative), "utf8");
      expect(source).not.toMatch(/approval-test-fixtures|approval-queue\/test-fixtures/);
    }
  });
});
