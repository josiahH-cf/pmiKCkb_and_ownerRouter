import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCESS_INTENT_MANIFEST,
  buildSurfaceAccessRequestHref,
} from "@/lib/access/intent-manifest";

const ROOT = process.cwd();
const ACCESS_IMPLEMENTATION_SOURCES = new Set([
  "app/admin/access/page.tsx",
  "components/admin/AccessCenter.tsx",
  "components/admin/UserManagementPanel.tsx",
]);
const NON_DENIAL_ROLE_GUARDS = new Set([
  // This guard chooses the existing Admin page for Admins and /admin/access for everyone else.
  // It does not hide or disable an Admin control, so it is a direct access route rather than a denial.
  "components/layout/AppShell.tsx",
]);

describe("S83 first-party access-intent manifest", () => {
  it("produces only the frozen v1 handoff", () => {
    for (const entry of ACCESS_INTENT_MANIFEST) {
      expect(buildSurfaceAccessRequestHref(entry.key)).toMatch(
        /^\/admin\/access\?v=1&capability=[A-Za-z]+(?:&space=[a-z-]+)?(?:&return_to=[^#]+)?$/,
      );
    }
  });

  it("renders every classified denial and classifies every rendered request link", () => {
    const renderedSurfaceKeys = new Set(
      listTsxFiles(["app", "components"]).flatMap((file) =>
        Array.from(
          fs
            .readFileSync(path.join(ROOT, file), "utf8")
            .matchAll(/<RequestAccessLink\b[^>]*\bsurface="([^"]+)"/gu),
          (match) => match[1],
        ),
      ),
    );
    expect(renderedSurfaceKeys).toEqual(
      new Set(ACCESS_INTENT_MANIFEST.map((entry) => entry.key)),
    );
  }, 20_000);

  it("classifies every direct user-facing role gate outside the access implementation", () => {
    const guardedSources = listTsxFiles(["app", "components"])
      .filter((file) => !file.startsWith("app/api/"))
      .filter((file) => /\bcan\(/u.test(fs.readFileSync(path.join(ROOT, file), "utf8")))
      .filter((file) => !ACCESS_IMPLEMENTATION_SOURCES.has(file))
      .filter((file) => !NON_DENIAL_ROLE_GUARDS.has(file));
    const classifiedSources = new Set<string>(
      ACCESS_INTENT_MANIFEST.map((entry) => entry.source_path),
    );
    expect(guardedSources.filter((file) => !classifiedSources.has(file))).toEqual([]);
  }, 20_000);
});

function listTsxFiles(roots: readonly string[]) {
  const files: string[] = [];
  const visit = (relative: string) => {
    const absolute = path.join(ROOT, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(".tsx")) files.push(child);
    }
  };
  roots.forEach(visit);
  return files.sort();
}
