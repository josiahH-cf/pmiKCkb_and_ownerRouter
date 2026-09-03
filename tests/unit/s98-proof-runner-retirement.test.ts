import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("S98 sealed-proof runner retirement", () => {
  it("refuses mutation/reconciliation before descriptor, actor, or provider access", () => {
    const scriptPath = resolve(process.cwd(), "scripts/prove-s98-sheet-writeback.ts");
    const source = readFileSync(scriptPath, "utf8");
    const guard = source.indexOf('if (operation !== "status")');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(source.indexOf("requireEnvironmentDescriptor()"));
    expect(guard).toBeLessThan(source.indexOf("const actor = await ownerActor()"));
    expect(source).not.toMatch(/operation === "(propose|execute|reconcile|discard)/);
    expect(source).not.toMatch(/createWriter|executeEffect|executeReversal|saveSheet/);
  });
});
