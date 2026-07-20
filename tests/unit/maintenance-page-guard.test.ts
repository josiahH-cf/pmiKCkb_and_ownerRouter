import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// LR-04: the Maintenance desk must not couple VIEWING to write authority. The page is a Next server
// component (a render test would need the full auth + Firestore harness), so this pins the guard altitude
// at the source level — the same static-guard approach used for the /notifications page.
describe("maintenance page capability altitude (LR-04)", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../app/maintenance/page.tsx", import.meta.url)),
    "utf8",
  );

  it("gates viewing on read, not edit, so read-capable users can see the desk", () => {
    expect(source).toMatch(/requirePageCapability\("read"\)/);
    expect(source).not.toMatch(/requirePageCapability\("edit"\)/);
  });

  it("renders the editor-only Capture surface ONLY in the edit-capable branch", () => {
    // Pin the POSITIVE, non-inverted guard: `{can(user.role, "edit") ? (<MaintenanceCapture`. The leading
    // `{` (not `!`) rules out a negated guard, and requiring <MaintenanceCapture> immediately after `? (`
    // rules out an inverted `? null : <MaintenanceCapture` — either of which would flip who sees Capture.
    expect(source).toMatch(
      /\{\s*can\(user\.role,\s*"edit"\)\s*\?\s*\(\s*<MaintenanceCapture/,
    );
    // And the guard must not be negated anywhere around Capture.
    expect(source).not.toMatch(/!\s*can\(user\.role,\s*"edit"\)/);
  });
});
