import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { e2eDataContextForFile } from "../../scripts/run-e2e-inventory.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = Number(process.env.E2E_PORT ?? 4310);
// The sign-in page redirects 127.0.0.1 hosts to localhost, so use localhost.
const baseUrl = `http://localhost:${port}`;
const READINESS_TIMEOUT_MS = 120_000;
const WARMUP_PATHS = [
  "/",
  "/ask",
  "/approval-queue",
  "/processes",
  "/spaces",
  "/spaces/lease-renewals",
  "/spaces/owner-email",
  "/processes/lease-renewal",
  "/work",
  "/admin",
  "/admin/team-work",
];

export default async function setup({ provide }) {
  if (
    process.env.FIRESTORE_EMULATOR_HOST &&
    (!process.env.E2E_INVENTORY_INDEX || process.env.E2E_INVENTORY_INDEX === "0")
  ) {
    await seedEmulator();
  }

  const firstFile =
    !process.env.E2E_INVENTORY_INDEX || process.env.E2E_INVENTORY_INDEX === "0";
  let server;

  try {
    if (firstFile) {
      server = startDevServer("warmup");
      await waitForReady(server.child, server.logTail);
      await warmUp();
      assertDevServerRunning(server.child, server.logTail);
      // Preserve the original eleven authenticated route checks once per complete inventory.
      await stopProcessTree(server.child);
    }
    server = startDevServer("test");
    await waitForReady(server.child, server.logTail);
    assertDevServerRunning(server.child, server.logTail);
  } catch (error) {
    if (server) await stopProcessTree(server.child);
    throw error;
  }

  provide("e2eBaseUrl", baseUrl);
  console.log(`e2e dev server ready at ${baseUrl} (log: ${server.logPath})`);

  return async () => {
    await stopProcessTree(server.child);
  };
}

async function seedEmulator() {
  const { resetDemoRecords } = await import("../../scripts/demo-firestore.mjs");
  await resetDemoRecords({ note: "Seed e2e flow-test records." });
  console.log(
    `Seeded demo records into the Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}.`,
  );
}

function startDevServer(phase) {
  const logDir = join(root, "temp", "e2e");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "next-dev.log");
  const logStream = createWriteStream(logPath, { flags: "a" });
  const dataContext =
    phase === "warmup"
      ? "live_readonly"
      : e2eDataContextForFile(process.env.E2E_INVENTORY_FILE ?? "");
  logStream.write(
    `[e2e harness] ${phase} ${process.env.E2E_INVENTORY_FILE ?? "direct run"} (demo/${dataContext})\n`,
  );
  const logTail = [];

  const child = spawn(
    process.execPath,
    [join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", `${port}`],
    {
      cwd: root,
      // On Windows, a detached Next CLI exits shortly after its parent setup scope returns,
      // even while its piped stdio remains attached. Keep it as a direct child there; POSIX
      // still uses a process group so teardown can include descendants.
      detached: shouldDetachDevServer(),
      env: {
        ...process.env,
        // Mutable app-owned fixtures use only the verified local emulator's Demo context.
        DATA_CONTEXT: dataContext,
        ENVIRONMENT_KIND: "demo",
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

  child.once("error", (error) => {
    appendHarnessLog(logStream, logTail, `next dev process error: ${error.message}`);
  });
  child.once("close", (code, signal) => {
    appendHarnessLog(
      logStream,
      logTail,
      `next dev exited (code=${code ?? "none"}, signal=${signal ?? "none"})`,
    );
    logStream.end();
  });

  return { child, logPath, logTail };
}

export function shouldDetachDevServer(platform = process.platform) {
  return platform !== "win32";
}

async function waitForReady(child, logTail) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    assertDevServerRunning(child, logTail);

    try {
      const response = await fetch(`${baseUrl}/sign-in`, {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });

      if (response.status === 200) {
        await response.text();
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

function assertDevServerRunning(child, logTail) {
  if (child.exitCode === null && !child.signalCode) {
    return;
  }

  throw new Error(
    `next dev exited before the e2e run could use ${baseUrl} ` +
      `(code=${child.exitCode ?? "none"}, signal=${child.signalCode ?? "none"}).\n` +
      `Last server output:\n${logTail.join("")}`,
  );
}

function appendHarnessLog(logStream, logTail, message) {
  const line = `[e2e harness] ${message}\n`;
  logStream.write(line);
  logTail.push(line);

  while (logTail.length > 50) {
    logTail.shift();
  }
}

// First-hit route compiles take seconds in next dev; warm the routes the suites
// use so individual tests stay inside their timeouts.
export async function warmUp({ origin = baseUrl, fetchImpl = fetch } = {}) {
  const auth = await fetchImpl(`${origin}/api/auth/demo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "Admin" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (auth.status !== 200) throw new Error("e2e_warmup_auth_failed");
  const cookie = auth.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("e2e_warmup_session_missing");
  await auth.text();
  for (const path of WARMUP_PATHS) {
    const response = await fetchImpl(`${origin}${path}`, {
      redirect: "manual",
      headers: { cookie },
      signal: AbortSignal.timeout(90_000),
    });
    // Await the full streamed render so a 200 shell cannot hide an unfinished cold compilation.
    await response.text();
    if (response.status !== 200)
      throw new Error(`e2e_warmup_route_failed: ${path} (${response.status})`);
  }
}

export async function stopProcessTree(
  child,
  { serverPort = port, timeoutMs = 5_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const signal = (name) => {
    try {
      process.kill(-child.pid, name);
    } catch {
      child.kill(name);
    }
  };
  if (child.exitCode === null && !child.signalCode) {
    signal("SIGTERM");
    if (!(await waitForExit(child, Math.floor(timeoutMs * 0.7)))) {
      signal("SIGKILL");
      if (!(await waitForExit(child, Math.max(0, deadline - Date.now()))))
        throw new Error("e2e_server_exit_unconfirmed");
    }
  }
  while (Date.now() < deadline) {
    if (await serverPortClosed(serverPort, Math.min(100, deadline - Date.now()))) return;
    await sleep(Math.min(50, Math.max(0, deadline - Date.now())));
  }
  throw new Error("e2e_server_listener_did_not_close");
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

function serverPortClosed(serverPort, timeoutMs) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "localhost", port: serverPort });
    const finish = (closed) => {
      socket.destroy();
      resolve(closed);
    };
    socket.once("connect", () => finish(false));
    socket.once("error", (error) => finish(error.code === "ECONNREFUSED"));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
