import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Complete retirement leaves an inert bookmark redirect; the destination enforces normal renewal access.
describe("retired maintenance page boundary", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../app/maintenance/page.tsx", import.meta.url)),
    "utf8",
  );
  it("redirects legacy bookmarks to the current renewal desk", () => {
    expect(source).toMatch(/redirect\("\/lease-renewal"\)/);
  });
  it("contains no capture, history, provider read or operational permission request", () => {
    expect(source).not.toMatch(
      /MaintenanceCapture|MaintenanceHistory|RequestAccessLink|getMaintenance|listMaintenance|RentvineWorkOrderPanel/,
    );
    expect(source.match(/^import /gm)).toHaveLength(1);
    expect(source).toMatch(/import \{ redirect \} from "next\/navigation"/);
  });
});
