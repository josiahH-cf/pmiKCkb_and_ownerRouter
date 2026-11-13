#!/usr/bin/env node
// S284 ARCH-S284-2 (R-S284-2, AC-S284-2): fail on a direct call of the sequences route's refresh,
// resume, send or schedule action in this batch's drivers and journey modules
// (tests/browser/one-path-november-12-*.mjs, including files added later), the rehearsal seed and
// the November 10 core journeys, whose N10-02 S284 replays on the staff path. The rule and what it
// recognizes are in scripts/lib/one-path-rehearsal/staff-path-check.mjs.
//
//   node scripts/check-staff-path-calls.mjs              the default file list on this tree
//   node scripts/check-staff-path-calls.mjs <file ...>   the named files only
//   node scripts/check-staff-path-calls.mjs --json       the result as JSON on stdout
//
// Exit 0 when no listed file makes such a call, 1 when one does, and 2 when a listed file is
// missing or cannot be parsed.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkStaffPathCalls,
  formatStaffPathResult,
  selectStaffPathFiles,
} from "./lib/one-path-rehearsal/staff-path-check.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const named = argv.filter((argument) => argument !== "--json");

/** A repository-relative path with forward slashes, or the absolute path outside the tree. */
function display(path) {
  const local = relative(ROOT, path);
  return !local || local.startsWith("..") || isAbsolute(local)
    ? path
    : local.split(sep).join("/");
}

const files = named.length
  ? named.map((path) => resolve(ROOT, path))
  : selectStaffPathFiles(
      readdirSync(join(ROOT, "tests/browser")).map((name) => `tests/browser/${name}`),
    ).map((path) => join(ROOT, path));
const missing = files.filter((path) => !existsSync(path));
if (missing.length) {
  process.stderr.write(
    `Staff path check could not run: ${missing.map(display).join(", ")} not found.\n`,
  );
  process.exit(2);
}

const result = checkStaffPathCalls(
  files.map((path) => ({ file: display(path), text: readFileSync(path, "utf8") })),
);
if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
else
  (result.passed ? process.stdout : process.stderr).write(formatStaffPathResult(result));
process.exitCode = result.unparsed.length ? 2 : result.violations.length ? 1 : 0;
