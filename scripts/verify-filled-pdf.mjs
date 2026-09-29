#!/usr/bin/env node
// Independent test-only acceptance. Python/pypdf is never a production dependency.
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const python = value("--python"),
  directory = value("--dir");
if (!python || !directory || !isAbsolute(python) || !isAbsolute(directory)) {
  console.error(
    "NOT RUN: provide --python <absolute isolated Python with pypdf> --dir <absolute synthetic acceptance output directory>.",
  );
  process.exit(2);
}
const result = spawnSync(
  python,
  [fileURLToPath(new URL("./verify-filled-pdf.py", import.meta.url)), resolve(directory)],
  { stdio: "inherit", env: { ...process.env, PYTHONNOUSERSITE: "1" }, timeout: 30000 },
);
if (result.error) {
  console.error("NOT RUN: independent parser unavailable.");
  process.exit(2);
}
process.exit(result.status ?? 1);
