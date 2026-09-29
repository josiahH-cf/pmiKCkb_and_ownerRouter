import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const portable = (path) => path.replaceAll("\\", "/");

it("fails a child unit test even when it catches the missing Firestore double refusal", () => {
  const scratch = mkdtempSync(join(tmpdir(), "pmi-unit-firestore-isolation-"));
  const fixture = join(scratch, "caught-refusal.test.ts");
  const config = join(scratch, "vitest.config.mjs");
  const unguardedConfig = join(scratch, "without-setup.config.mjs");
  writeFileSync(
    fixture,
    `import { getAdminFirestore } from "@/lib/firestore/admin";

// A regression that removes the store guard still cannot discover ADC or construct an SDK app.
vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminApp() { throw new Error("synthetic_firebase_app_forbidden"); },
}));

it("otherwise passes after catching the refused store access", () => {
  let caught = false;
  try { getAdminFirestore(); } catch { caught = true; }
  expect(caught).toBe(true);
  console.log("synthetic_caught_refusal_body_passed");
});
`,
  );
  function childConfig(withoutSetup = false) {
    return `import canonical from ${JSON.stringify(pathToFileURL(join(root, "vitest.config.ts")).href)};
export default {
  ...canonical,
  root: ${JSON.stringify(portable(root))},
  test: {
    ...canonical.test,
    include: [${JSON.stringify(portable(fixture))}],
    pool: "threads",
    maxWorkers: 1,
    ${withoutSetup ? "setupFiles: []," : ""}
  },
};\n`;
  }
  // The main child inherits the actual unit suite's setup registration. Hard-coding the guard
  // here would let this regression pass even if somebody removed it from vitest.config.ts.
  writeFileSync(config, childConfig());
  writeFileSync(unguardedConfig, childConfig(true));
  function runChild(configPath, receiptName) {
    const result = spawnSync(
      process.execPath,
      [join(root, "node_modules/vitest/vitest.mjs"), "run", "--config", configPath],
      {
        cwd: root,
        env: { ...process.env, NODE_OPTIONS: "", FORCE_COLOR: "0" },
        encoding: "utf8",
        timeout: 15_000,
        killSignal: "SIGKILL",
        maxBuffer: 1_048_576,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    writeFileSync(join(scratch, `${receiptName}.log`), output);
    writeFileSync(
      join(scratch, `${receiptName}.json`),
      JSON.stringify({
        status: result.status,
        signal: result.signal,
        error: result.error?.code ?? null,
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(output).toContain("synthetic_caught_refusal_body_passed");
    return { result, output };
  }
  // Preserve the deliberately failing child receipt outside Git. A threads-only worker pool
  // shares the killed child process, so timeout cleanup cannot leave a forked test runner behind.
  const { result, output } = runChild(config, "child");
  expect(result.status).not.toBe(0);
  expect(output).toContain(
    "unit test attempted Firestore access without an explicit double",
  );
  // The isolated counterfactual proves that the failure comes from canonical setup registration,
  // not a broken fixture or startup failure. Its separate Firebase app double still forbids ADC.
  const unguarded = runChild(unguardedConfig, "without-setup");
  expect(unguarded.result.status).toBe(0);
  expect(unguarded.output).not.toContain(
    "unit test attempted Firestore access without an explicit double",
  );
}, 40_000);
