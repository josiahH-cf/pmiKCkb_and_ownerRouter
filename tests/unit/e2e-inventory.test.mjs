import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { expect, it } from "vitest";
import {
  discoverE2eFiles,
  readFileVerdict,
  e2eDataContextForFile,
} from "../../scripts/run-e2e-inventory.mjs";
import { shouldDetachDevServer, stopProcessTree } from "../e2e/global-setup.mjs";

it("restricts mutable fixture contexts to explicit files in the local emulator project", () => {
  const file = "tests/e2e/capture.e2e.test.mjs";
  const env = {
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8090",
    FIREBASE_PROJECT_ID: "pmi-kc-kb-e2e",
    GOOGLE_CLOUD_PROJECT: "pmi-kc-kb-e2e",
  };
  expect(e2eDataContextForFile(file, env)).toBe("demo");
  expect(e2eDataContextForFile(file, {})).toBe("live_readonly");
  expect(e2eDataContextForFile("tests/e2e/auth-guards.e2e.test.mjs", env)).toBe(
    "live_readonly",
  );
  expect(() =>
    e2eDataContextForFile(file, {
      ...env,
      FIRESTORE_EMULATOR_HOST: "provider.invalid:8090",
    }),
  ).toThrow(/local E2E/);
  expect(() =>
    e2eDataContextForFile(file, { ...env, GOOGLE_CLOUD_PROJECT: "pmi-kc-kb-prod" }),
  ).toThrow(/local E2E/);
});

it("discovers every nested HTTP file while excluding helpers and other suites", () => {
  const directory = mkdtempSync(join(tmpdir(), "pmi-e2e-inventory-"));
  try {
    mkdirSync(join(directory, "nested"));
    for (const name of [
      "a.e2e.test.mjs",
      "helper.mjs",
      "unit.test.mjs",
      "nested/b.e2e.test.mjs",
    ])
      writeFileSync(join(directory, name), "");
    expect(discoverE2eFiles(directory)).toEqual([
      join(directory, "a.e2e.test.mjs"),
      join(directory, "nested/b.e2e.test.mjs"),
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("refuses missing/different-file reports and cannot turn failed tests into a green file", () => {
  const file = "/app/tests/e2e/ai-history.e2e.test.mjs";
  const report = {
    testResults: [{ name: file }],
    numTotalTests: 2,
    numPassedTests: 1,
    numFailedTests: 1,
    numPendingTests: 0,
    success: false,
  };
  expect(readFileVerdict(report, file, 0).success).toBe(false);
  expect(() => readFileVerdict(report, "/app/tests/e2e/ask.e2e.test.mjs", 0)).toThrow(
    /mismatched/,
  );
  expect(() => readFileVerdict({ ...report, testResults: [] }, file, 0)).toThrow(
    /Missing/,
  );
});

it("confirms hard-killed own server exit and listener closure before replacement", async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM',()=>{}); const s=require('node:http').createServer(); s.listen(0,()=>console.log(s.address().port));",
    ],
    { detached: shouldDetachDevServer(), stdio: ["ignore", "pipe", "pipe"] },
  );
  const replacement = createServer();
  try {
    const [chunk] = await once(child.stdout, "data");
    const serverPort = Number(chunk.toString().trim());
    await stopProcessTree(child, { serverPort, timeoutMs: 500 });
    expect(child.signalCode ?? child.exitCode).not.toBeNull();
    await new Promise((resolve, reject) => {
      replacement.once("error", reject);
      replacement.listen(serverPort, resolve);
    });
    expect(replacement.listening).toBe(true);
  } finally {
    if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
    if (replacement.listening) await new Promise((resolve) => replacement.close(resolve));
  }
});
