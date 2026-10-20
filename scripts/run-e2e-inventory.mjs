import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MUTABLE_EMULATOR_FILES = new Set([
  "tests/e2e/approval-queue.e2e.test.mjs",
  "tests/e2e/capture.e2e.test.mjs",
  "tests/e2e/process-definitions.e2e.test.mjs",
  "tests/e2e/work-accountability.e2e.test.mjs",
]);

export function e2eDataContextForFile(file, env = process.env) {
  if (!MUTABLE_EMULATOR_FILES.has(file.replaceAll("\\", "/"))) return "live_readonly";
  if (!env.FIRESTORE_EMULATOR_HOST) return "live_readonly";
  const emulatorPort = Number(env.FIRESTORE_EMULATOR_HOST.split(":").at(-1));
  if (
    !/^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(env.FIRESTORE_EMULATOR_HOST) ||
    emulatorPort < 1 ||
    emulatorPort > 65535 ||
    env.FIREBASE_PROJECT_ID !== "pmi-kc-kb-e2e" ||
    env.GOOGLE_CLOUD_PROJECT !== "pmi-kc-kb-e2e"
  )
    throw new Error(
      "Mutable HTTP fixtures require the exact local E2E emulator project.",
    );
  return "demo";
}

export function discoverE2eFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("E2E inventory cannot contain links.");
    if (entry.isDirectory()) files.push(...discoverE2eFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".e2e.test.mjs")) files.push(path);
  }
  return files.sort();
}

export function readFileVerdict(report, expectedFile, exitCode) {
  const results = report?.testResults;
  if (
    !Array.isArray(results) ||
    results.length !== 1 ||
    resolve(results[0].name) !== resolve(expectedFile) ||
    !Number.isInteger(report.numTotalTests) ||
    report.numTotalTests < 1
  )
    throw new Error("Missing or mismatched complete-file E2E report.");
  return {
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests,
    total: report.numTotalTests,
    success: exitCode === 0 && report.success === true && report.numFailedTests === 0,
  };
}

export function main() {
  const files = discoverE2eFiles(join(root, "tests", "e2e"));
  if (!files.length) throw new Error("The complete E2E inventory is empty.");
  const started = Date.now();
  const deadline = Number(process.env.E2E_SUITE_DEADLINE_MS ?? started + 600_000);
  if (!Number.isFinite(deadline) || deadline <= started || deadline - started > 900_000)
    throw new Error("E2E suite requires its existing finite total time bound.");
  const logRoot = join(root, "temp", "e2e");
  mkdirSync(logRoot, { recursive: true });
  const output = mkdtempSync(join(logRoot, "inventory-"));
  const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  const inventory = files.map((file) => ({
    file: relative(root, file),
    sha256: digest(file),
    environmentKind: "demo",
    dataContext: e2eDataContextForFile(relative(root, file)),
  }));
  const results = [];
  let infrastructureFailure = null;
  for (const [index, file] of files.entries()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      infrastructureFailure = "suite_deadline";
      break;
    }
    const reportPath = join(output, `${index}.json`);
    console.log(
      `E2E file ${index + 1}/${files.length}: ${relative(root, file)} (${inventory[index].environmentKind}/${inventory[index].dataContext})`,
    );
    const child = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        "vitest.e2e.config.ts",
        "--reporter=default",
        "--reporter=json",
        `--outputFile=${reportPath}`,
        relative(root, file),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          E2E_INVENTORY_INDEX: String(index),
          E2E_INVENTORY_FILE: relative(root, file),
        },
        stdio: "inherit",
        timeout: remaining,
        killSignal: "SIGKILL",
      },
    );
    if (child.error || child.signal) {
      infrastructureFailure = child.error?.code ?? child.signal;
      break;
    }
    try {
      const verdict = readFileVerdict(
        JSON.parse(readFileSync(reportPath, "utf8")),
        file,
        child.status,
      );
      results.push({
        file: relative(root, file),
        environmentKind: "demo",
        dataContext: inventory[index].dataContext,
        ...verdict,
      });
    } catch (error) {
      infrastructureFailure = error.message;
      break;
    }
  }
  const sourceChanged = inventory.some(
    (row, index) => digest(files[index]) !== row.sha256,
  );
  const totals = results.reduce(
    (sum, row) => ({
      passed: sum.passed + row.passed,
      failed: sum.failed + row.failed,
      skipped: sum.skipped + row.skipped,
      total: sum.total + row.total,
    }),
    { passed: 0, failed: 0, skipped: 0, total: 0 },
  );
  const success =
    results.length === files.length &&
    results.every((row) => row.success) &&
    !infrastructureFailure &&
    !sourceChanged;
  const summary = {
    inventory,
    results,
    totals,
    success,
    infrastructureFailure,
    sourceChanged,
    elapsedMs: Date.now() - started,
    deadlineMs: deadline,
    missingFiles: inventory.slice(results.length),
  };
  writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `Complete E2E inventory: ${JSON.stringify({
      output,
      ...totals,
      files: results.length,
      expectedFiles: files.length,
      success,
      infrastructureFailure,
    })}`,
  );
  return success ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
