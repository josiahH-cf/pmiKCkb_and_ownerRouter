import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("S130 dedicated scanner HTTP/engine-controller fixture contract", () => {
  it("preserves JSON boundaries and qualifies the separate raw PDF seam", () => {
    const result = spawnSync(
      "python3",
      ["-B", "infra/publication-scanner/test_scanner_service.py"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 35_000);
});
