import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BATCH005_HANDOFF,
  readBatch005Requirements,
  validateBatch005Evidence,
} from "./lib/batch005-evidence.mjs";

const root = process.cwd();
const path = join(root, "docs/evidence/application-usability-batch005.json");
const rows = readBatch005Requirements(root);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
if (process.argv.includes("--initialize")) {
  if (existsSync(path))
    throw new Error("Existing evidence must be preserved and updated in place");
  const routes = files(join(root, "app"))
    .filter((file) => /[/\\]page\.tsx$/.test(file))
    .map((file) => ({
      owner: file.slice(root.length + 1).replaceAll("\\", "/"),
      inspected: false,
      checks: [],
    }));
  const consumers = files(join(root, "components"))
    .filter(
      (file) =>
        file.endsWith(".tsx") &&
        /\b(fetch\(|async |useTransition\(|<table\b|<InfoTip\b|<Disclosure\b)/.test(
          readFileSync(file, "utf8"),
        ),
    )
    .map((file) => ({
      owner: file.slice(root.length + 1).replaceAll("\\", "/"),
      inspected: false,
      checks: [],
    }));
  writeFileSync(
    path,
    `${JSON.stringify({ schema: "pmi-kc-batch005-evidence.v1", handoff: BATCH005_HANDOFF, startingCommit: "7f46974673ad15b7f6f9dd0e4d8033405cc8dc43", requirements: rows.map((row) => ({ ...row, status: "not_run", baseline: { outcome: "not_run", test: null }, checks: [], humanVerdict: "NOT RUN — no human observer" })), inventory: { routes, consumers }, feedback: { start: { status: "not_run" }, end: { status: "not_run" } }, preservation: { status: "not_run", checks: [] }, release: { status: "not_run" } }, null, 2)}\n`,
    { flag: "wx" },
  );
}
const evidence = JSON.parse(readFileSync(path, "utf8"));
validateBatch005Evidence(rows, evidence, {
  requireComplete: process.argv.includes("--require-complete"),
  expectedInventory: {
    routes: files(join(root, "app"))
      .filter((file) => /[/\\]page\.tsx$/.test(file))
      .map((file) => file.slice(root.length + 1).replaceAll("\\", "/")),
    consumers: files(join(root, "components"))
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => file.slice(root.length + 1).replaceAll("\\", "/")),
  },
});
console.log(
  JSON.stringify({
    requirements: rows.length,
    suites: new Set(rows.map((row) => row.suite)).size,
    routes: evidence.inventory.routes.length,
    consumers: evidence.inventory.consumers.length,
    verified: evidence.requirements.filter((row) =>
      ["passed", "preserved"].includes(row.status),
    ).length,
    release: evidence.release.status,
  }),
);
