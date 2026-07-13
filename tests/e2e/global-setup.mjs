import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = Number(process.env.E2E_PORT ?? 4310);
// The sign-in page redirects 127.0.0.1 hosts to localhost, so use localhost.
const baseUrl = `http://localhost:${port}`;
const READINESS_TIMEOUT_MS = 120_000;
const WARMUP_PATHS = ["/", "/ask", "/approval-queue", "/processes", "/spaces", "/admin"];

export default async function setup({ provide }) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    await seedEmulator();
  }

  const { child, logPath, logTail } = startDevServer();

  try {
    await waitForReady(logTail);
    await warmUp();
  } catch (error) {
    await stopProcessTree(child);
    throw error;
  }

  provide("e2eBaseUrl", baseUrl);
  console.log(`e2e dev server ready at ${baseUrl} (log: ${logPath})`);

  return async () => {
    await stopProcessTree(child);
  };
}

async function seedEmulator() {
  const { resetDemoRecords } = await import("../../scripts/demo-firestore.mjs");
  await resetDemoRecords({ note: "Seed e2e flow-test records." });
  console.log(
    `Seeded demo records into the Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}.`,
  );
}

function startDevServer() {
  const logDir = join(root, "temp", "e2e");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "next-dev.log");
  const logStream = createWriteStream(logPath);
  const logTail = [];

  const child = spawn(
    process.execPath,
    [join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", `${port}`],
    {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        ASK_DEMO_MODE: "true",
        LOCAL_DEMO_AUTH: "true",
        NEXT_E2E_ISOLATED_BUILD: "true",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      logStream.write(chunk);
      logTail.push(chunk.toString());

      while (logTail.length > 50) {
        logTail.shift();
      }
    });
  }

  return { child, logPath, logTail };
}

async function waitForReady(logTail) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/sign-in`, { redirect: "manual" });

      if (response.status === 200) {
        return;
      }
    } catch {
      // Server not accepting connections yet.
    }

    await sleep(500);
  }

  throw new Error(
    `next dev did not become ready on ${baseUrl} within ${READINESS_TIMEOUT_MS}ms.\n` +
      `Last server output:\n${logTail.join("")}`,
  );
}

// First-hit route compiles take seconds in next dev; warm the routes the suites
// use so individual tests stay inside their timeouts.
async function warmUp() {
  for (const path of WARMUP_PATHS) {
    try {
      await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    } catch {
      // Warmup is best-effort.
    }
  }

  try {
    await fetch(`${baseUrl}/api/auth/demo`, { method: "POST" });
  } catch {
    // Warmup is best-effort.
  }
}

async function stopProcessTree(child) {
  if (child.exitCode !== null || child.signalCode) {
    return;
  }

  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
  });

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  const timeout = sleep(5_000).then(() => "timeout");

  if ((await Promise.race([exited, timeout])) === "timeout") {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
