import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// S54 verification-lane parity.
//
// Two lanes are supposed to license the same push: `scripts/verify.sh` (the local all-in-one) and
// `.github/workflows/ci.yml`. On 2026-08-25 they had DRIFTED in both directions at once — verify.sh
// ran verify:copy-voice but not check:budget-guard, and ci.yml ran check:budget-guard but not
// verify:copy-voice. Each was missing exactly what the other had, so a regression in either gate could
// reach main through whichever lane omitted it, and neither lane's green told the whole truth.
//
// This sentinel makes the drift visible the moment it reappears.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// The real npm script vocabulary, so prose like "npm is required" or "Run npm install first" in
// verify.sh is never mistaken for an invocation.
const DECLARED_SCRIPTS = new Set(
  Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts),
);

/** npm scripts each lane invokes, ignoring argument suffixes like `-- --allow-multiple-spaces`. */
function npmScripts(text) {
  return new Set(
    [...text.matchAll(/npm(?:_CMD"?)?\s+(?:run\s+)?([a-z][a-z0-9:-]*)/gi)]
      .map((m) => m[1])
      .filter((name) => DECLARED_SCRIPTS.has(name) && name !== "ci"),
  );
}

const verifySh = readFileSync(join(root, "scripts", "verify.sh"), "utf8");
const ciYml = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
// CI invokes these explicit command arrays through the OS-isolation driver. Follow only tasks
// actually selected by workflow run steps, so a renamed/missing lane still fails this sentinel.
const isolatedLanes = JSON.parse(
  readFileSync(join(root, "scripts", "isolation", "lanes.json"), "utf8"),
);
const ciCommands = [...ciYml.matchAll(/isolated-verify\.py[^\n]*--task\s+([a-z0-9-]+)/g)]
  .flatMap((match) => isolatedLanes[match[1]] ?? [])
  .map((args) => `npm ${args.join(" ")}`)
  .join("\n");

// Gates that MUST run in both lanes. Each one exists because something shipped past it before.
const REQUIRED_IN_BOTH = [
  "format:check",
  "lint",
  "typecheck",
  "test",
  "test:firestore",
  "verify:router-boundary",
  "verify:falsification",
  "verify:context-freshness",
  "verify:active-doc-paths",
  "verify:spec-traceability",
  "verify:copy-voice",
  "verify:redaction",
  "verify:help-coverage",
  "verify:help-controls",
  "verify:help-screenshots",
  "verify:help-content",
  "check:budget-guard",
  "build",
  "test:e2e",
  "test:e2e:core",
];

describe("S54 verification lane parity", () => {
  const local = npmScripts(verifySh);
  const ci = npmScripts(`${ciYml}\n${ciCommands}`);

  it.each(REQUIRED_IN_BOTH)("scripts/verify.sh runs %s", (name) => {
    expect(local.has(name), `scripts/verify.sh does not run ${name}`).toBe(true);
  });

  it.each(REQUIRED_IN_BOTH)("ci.yml runs %s", (name) => {
    expect(ci.has(name), `.github/workflows/ci.yml does not run ${name}`).toBe(true);
  });

  it("neither lane runs a gate the other omits", () => {
    const onlyLocal = [...local].filter((n) => !ci.has(n));
    const onlyCi = [...ci].filter((n) => !local.has(n));
    expect(
      { onlyLocal, onlyCi },
      "The two verification lanes have drifted. A gate that runs in only one lane means a regression can reach main through the other.",
    ).toEqual({ onlyLocal: [], onlyCi: [] });
  });

  it("CI runs every unit shard, so the split lane still covers the complete inventory", () => {
    const tasks = [
      ...ciYml.matchAll(/isolated-verify\.py[^\n]*--task\s+([a-z0-9-]+)/g),
    ].map((match) => match[1]);
    const unitCommands = tasks
      .flatMap((task) => isolatedLanes[task] ?? [])
      .filter((args) => args[0] === "test");
    expect(unitCommands.length, "ci.yml runs no unit lane").toBeGreaterThan(0);
    const shards = unitCommands.map((args) =>
      args.find((arg) => arg.startsWith("--shard="))?.slice("--shard=".length),
    );
    if (shards.includes(undefined)) return; // an unsharded run already covers every file
    const totals = new Set(shards.map((shard) => shard.split("/")[1]));
    expect(totals.size, `mixed shard counts: ${shards.join(", ")}`).toBe(1);
    const total = Number([...totals][0]);
    expect(
      shards.map((shard) => Number(shard.split("/")[0])).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: total }, (_, index) => index + 1));
  });

  it("public asset preparation preserves the native build command and default engine", () => {
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
    expect(scripts.build).toBe("next build");
    expect(local.has("build")).toBe(true);
    expect(ci.has("build")).toBe(true);
  });
});
