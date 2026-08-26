import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const E2E_PROJECT_ID = "pmi-kc-kb-e2e";
export const E2E_FIREBASE_CONFIG = "firebase.e2e.json";

const TEST_COMMAND = "vitest run --config vitest.e2e.config.ts";
const DEFAULT_RUN_TIMEOUT_MS = 10 * 60_000;
const MAX_RUN_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_PROBE_TIMEOUT_MS = 90_000;
const MAX_PROBE_TIMEOUT_MS = 3 * 60_000;
// A quote-free no-op: emulators:exec starts the emulator first, so any inner command that exits 0
// proves the emulator came up. Avoiding inner quotes keeps the Windows PowerShell wrapper robust.
const EMULATOR_PROBE_COMMAND = "node --version";

export function parseE2eArgs(argv) {
  const flags = new Set(argv);

  if (flags.has("--firestore") && flags.has("--no-firestore")) {
    throw new Error("Pass either --firestore or --no-firestore, not both.");
  }

  return {
    // --firestore makes an unavailable emulator fatal instead of degrading.
    requireFirestore: flags.has("--firestore"),
    skipFirestore: flags.has("--no-firestore"),
  };
}

export function buildEmulatorExecArgs(command = TEST_COMMAND) {
  return [
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    E2E_PROJECT_ID,
    "--config",
    E2E_FIREBASE_CONFIG,
    command,
  ];
}

function boundedTimeout(value, fallback, maximum, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return parsed;
}

/** The top-level harness is always time-bounded, including its emulator availability probe. */
export function resolveE2eTimeouts(env = process.env) {
  return {
    runMs: boundedTimeout(
      env.E2E_RUN_TIMEOUT_MS,
      DEFAULT_RUN_TIMEOUT_MS,
      MAX_RUN_TIMEOUT_MS,
      "E2E_RUN_TIMEOUT_MS",
    ),
    probeMs: boundedTimeout(
      env.E2E_PROBE_TIMEOUT_MS,
      DEFAULT_PROBE_TIMEOUT_MS,
      MAX_PROBE_TIMEOUT_MS,
      "E2E_PROBE_TIMEOUT_MS",
    ),
  };
}

function syncRunOptions(env, stdio, timeout) {
  return { env, stdio, timeout, killSignal: "SIGKILL" };
}

function completedStatus(result, label, timeout) {
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(
      `${label} exceeded its ${timeout}ms safety timeout and was terminated.`,
    );
  }
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`${label} terminated by ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

// firebase emulators:exec needs its inner command as ONE argument, so the inner command stays
// single-quoted. Used only for the Windows PowerShell path.
function emulatorExecCommandString(command = TEST_COMMAND) {
  return (
    `firebase emulators:exec --only firestore --project ${E2E_PROJECT_ID} ` +
    `--config ${E2E_FIREBASE_CONFIG} '${command}'`
  );
}

function readWindowsEnvironment(name, scope) {
  try {
    return execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `[Environment]::GetEnvironmentVariable('${name}', '${scope}')`,
      ],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

// Windows resolves the firebase/vitest CLI shims (and Java for the emulator) only through a
// fully-populated PATH, so merge Machine/User PATH + JAVA_HOME before shelling out. Mirrors
// scripts/run-firestore-tests.mjs. A bare spawnSync("vitest"|"firebase") ENOENTs on Windows.
function windowsEnv(baseEnv) {
  const env = { ...baseEnv };
  const machinePath = readWindowsEnvironment("Path", "Machine");
  const userPath = readWindowsEnvironment("Path", "User");
  const javaHome =
    readWindowsEnvironment("JAVA_HOME", "User") ||
    readWindowsEnvironment("JAVA_HOME", "Machine") ||
    env.JAVA_HOME;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
  const pathParts = [env[pathKey], machinePath, userPath];

  if (javaHome) {
    env.JAVA_HOME = javaHome;
    pathParts.unshift(`${javaHome}\\bin`);
  }

  env[pathKey] = pathParts.filter(Boolean).join(";");
  return env;
}

function runWindows(commandString, env, stdio, timeout) {
  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `${commandString}; exit $LASTEXITCODE`,
    ],
    syncRunOptions(windowsEnv(env), stdio, timeout),
  );
}

function runVitestDirectly(env, timeout) {
  let result;

  if (process.platform === "win32") {
    result = runWindows(TEST_COMMAND, env, "inherit", timeout);
  } else {
    const [command, ...args] = TEST_COMMAND.split(" ");
    result = spawnSync(command, args, syncRunOptions(env, "inherit", timeout));
  }

  return completedStatus(result, "Core e2e run", timeout);
}

function runWithEmulator(env, timeout) {
  const result =
    process.platform === "win32"
      ? runWindows(emulatorExecCommandString(), env, "inherit", timeout)
      : spawnSync(
          "firebase",
          buildEmulatorExecArgs(),
          syncRunOptions(env, "inherit", timeout),
        );

  return completedStatus(result, "Firestore-backed e2e run", timeout);
}

// The emulator needs Java plus a one-time jar download. Probe with a no-op exec
// before committing, so an unavailable emulator degrades to the core group while
// real test failures inside the emulator run still propagate.
export function probeEmulator(env, timeout = resolveE2eTimeouts(env).probeMs) {
  const result =
    process.platform === "win32"
      ? runWindows(
          emulatorExecCommandString(EMULATOR_PROBE_COMMAND),
          env,
          "pipe",
          timeout,
        )
      : spawnSync("firebase", buildEmulatorExecArgs(EMULATOR_PROBE_COMMAND), {
          ...syncRunOptions(env, "pipe", timeout),
        });

  return !result.error && (result.status ?? 1) === 0;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseE2eArgs(argv);
  const env = {
    ...process.env,
    FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: E2E_PROJECT_ID,
  };
  const timeouts = resolveE2eTimeouts(env);

  if (options.skipFirestore) {
    console.log("Running e2e flow tests without the Firestore emulator (core group).");
    return runVitestDirectly(env, timeouts.runMs);
  }

  if (!probeEmulator(env, timeouts.probeMs)) {
    if (options.requireFirestore) {
      console.error("Firestore emulator is unavailable and --firestore was passed.");
      return 1;
    }

    console.warn(
      "Firestore emulator is unavailable (missing Java or emulator jar download " +
        "failed); running the core e2e group without Firestore. The emulator-backed " +
        "suites self-skip. Pass --firestore to make this fatal.",
    );
    return runVitestDirectly(env, timeouts.runMs);
  }

  console.log("Running e2e flow tests inside the Firestore emulator.");
  return runWithEmulator(env, timeouts.runMs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
