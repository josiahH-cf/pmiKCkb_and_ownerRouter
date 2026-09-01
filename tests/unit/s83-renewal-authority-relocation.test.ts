import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("S83 renewal authority relocation", () => {
  it("keeps renewal desk and workspace focused on renewal work", () => {
    expect(source("components/lease-renewal/RenewalDesk.tsx")).not.toContain(
      "RenewalAuthorityPanel",
    );
    expect(source("components/lease-renewal/RenewalWorkspace.tsx")).not.toContain(
      "RenewalAuthorityPanel",
    );
  });

  it("owns role, inherited capabilities, Spaces, and requests on the Admin access surface", () => {
    const access = source("components/admin/AccessCenter.tsx");
    expect(access).toContain("My access");
    expect(access).toContain("Inherited capabilities");
    expect(access).toContain("Request access");
    expect(access).toContain("My requests");
  });
});
