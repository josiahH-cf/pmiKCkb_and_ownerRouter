// S284: deterministic checks on the rehearsal's served tree, under its network refusal guard.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
const VITEST = "node_modules/vitest/vitest.mjs";
const RUN_TIMEOUT_MS = 12 * 60 * 1000;

export async function runRehearsalVitest(
  rehearsal,
  directory,
  name,
  files,
  { args = [], env = {} } = {},
) {
  const dir = join(rehearsal.runDir, directory);
  mkdirSync(dir, { recursive: true });
  const report = join(dir, `${name}.json`);
  const network = join(dir, `${name}-network.jsonl`);
  const started = Date.now();
  const outcome = await new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        VITEST,
        "run",
        ...args,
        // The rehearsal's node_modules is hard-linked from the lane. Keep the cache off.
        "--no-cache",
        "--pool=forks",
        "--maxWorkers=2",
        "--reporter=json",
        `--outputFile=${report}`,
        ...files,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH,
          HOME: dir,
          TMPDIR: process.env.TMPDIR ?? "/tmp",
          LANG: "en_US.UTF-8",
          TZ: "America/Chicago",
          CI: "true",
          NODE_ENV: "test",
          NODE_OPTIONS: `--max-old-space-size=4096 --import ${join(process.cwd(), PRELOAD)}`,
          NOVDEC_JOURNEY_NETWORK_LOG: network,
          ...env,
        },
      },
    );
    let tail = "";
    const keep = (chunk) => {
      tail = (tail + chunk).slice(-4000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGTERM"), RUN_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ code: null, error: String(error), tail });
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, tail });
    });
  });

  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(report, "utf8"));
  } catch {
    // An unreadable report is not a passing run.
  }
  const cases = (parsed?.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? []).map((entry) => ({
      file: String(file.name ?? "").replace(`${process.cwd()}/`, ""),
      name: [...(entry.ancestorTitles ?? []), entry.title].join(" "),
      status: entry.status,
    })),
  );
  let refused = null;
  try {
    const entries = readFileSync(network, "utf8").trim().split("\n").map(JSON.parse);
    if (entries.some((entry) => entry.event === "network_guard_ready"))
      refused = entries.filter((entry) => entry.refused).length;
  } catch {
    // An unreadable guard log leaves the network result unverified.
  }
  return {
    name,
    code: outcome.code ?? null,
    signal: outcome.signal ?? null,
    error: outcome.error ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
    totals: parsed
      ? {
          passed: parsed.numPassedTests,
          failed: parsed.numFailedTests,
          pending: parsed.numPendingTests,
          todo: parsed.numTodoTests,
          files: parsed.numTotalTestSuites,
        }
      : null,
    cases,
    refused,
    tail: parsed && outcome.code === 0 ? null : outcome.tail.slice(-1500),
  };
}
