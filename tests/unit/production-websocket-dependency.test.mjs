import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PRODUCTION_SOURCE_ROOTS = ["app", "components", "lib"];
const FORBIDDEN_DATABASE_IMPORT =
  /(?:from\s+["'](?:@firebase\/database|firebase\/database)["']|require\(["'](?:@firebase\/database|firebase\/database)["']\)|\bgetDatabase\s*\()/;

describe("production WebSocket dependency boundary", () => {
  it("pins websocket-driver at the patched release", () => {
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
    expect(lock.packages?.["node_modules/websocket-driver"]?.version).toBe("0.7.5");
  });

  it("keeps Firebase Realtime Database and its WebSocket transport unreachable from app source", () => {
    const offenders = PRODUCTION_SOURCE_ROOTS.flatMap((root) =>
      sourceFiles(join(ROOT, root)),
    )
      .filter((path) => FORBIDDEN_DATABASE_IMPORT.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));

    expect(offenders).toEqual([]);
  });
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry) ? [path] : [];
  });
}
