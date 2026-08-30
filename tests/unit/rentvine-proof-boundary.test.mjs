import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const provider = readFileSync("lib/lease-renewal/rentvine-proof-provider.ts", "utf8");
const service = readFileSync("lib/lease-renewal/rentvine-proof-service.ts", "utf8");
const runner = readFileSync("scripts/prove-rentvine-renewal-write.ts", "utf8");
const registry = readFileSync("lib/integrations/action-registry-seed.ts", "utf8");

describe("S30 static effect boundary", () => {
  it("keeps the proof runner at one lease endDate update with no generic or charge operation", () => {
    expect(provider).toContain("updateLease(");
    expect(provider).not.toContain("updateExistingRecurringCharge(");
    expect(provider).not.toMatch(/\bfetch\s*\(/);
    expect(service).not.toContain("updateExistingRecurringCharge");
    expect(service).not.toMatch(/google[_-]sheets|gmail|sendMail|delete|createCharge/i);
  });

  it("binds the runner to the exact action and has no gate mutation code", () => {
    expect(runner).toContain("RENTVINE_PROOF_ACTION_KEY");
    expect(runner).toContain("runProductionRuntimeGatedAction");
    expect(runner).not.toMatch(
      /production_allowed\s*=(?!=)|seedActionRegistry|setRuntimeAction/,
    );
    expect(runner).not.toMatch(/google[_-]sheets|gmail|sendMail/i);
  });

  it("preserves the committed production key as closed", () => {
    const entry = registry.match(
      /key:\s*["']rentvine\.lease\.renewal_writeback["'][\s\S]*?production_allowed:\s*(true|false)/,
    );
    expect(entry?.[1]).toBe("false");
  });
});
