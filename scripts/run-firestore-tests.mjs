import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";

const projectId = "pmi-kc-kb-test";
const testCommand = "vitest run --config vitest.firestore.config.ts";

const env = { ...process.env };
const requestedTarget = env.FIRESTORE_EMULATOR_HOST?.trim();
const defaultPort = requestedTarget ? Number(requestedTarget.split(":").at(-1)) : 8080;
const emulatorPort = await chooseEmulatorPort(defaultPort);
env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${emulatorPort}`;
const temporaryConfig =
  emulatorPort === 8080
    ? undefined
    : join(tmpdir(), `pmi-kc-firebase-emulator-${process.pid}.json`);

if (temporaryConfig) {
  writeFileSync(
    temporaryConfig,
    JSON.stringify({
      firestore: {
        rules: join(process.cwd(), "firestore.rules"),
        indexes: join(process.cwd(), "firestore.indexes.json"),
      },
      emulators: {
        singleProjectMode: true,
        firestore: { host: "127.0.0.1", port: emulatorPort },
        ui: { enabled: false },
      },
    }),
  );
  console.log(
    `Firestore emulator port 8080 is occupied; using isolated port ${emulatorPort}.`,
  );
}

if (process.platform === "win32") {
  const machinePath = readWindowsEnvironment("Path", "Machine");
  const userPath = readWindowsEnvironment("Path", "User");
  const userJavaHome = readWindowsEnvironment("JAVA_HOME", "User");
  const machineJavaHome = readWindowsEnvironment("JAVA_HOME", "Machine");
  const javaHome = userJavaHome || machineJavaHome || env.JAVA_HOME;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
  const pathParts = [env[pathKey], machinePath, userPath];

  if (javaHome) {
    env.JAVA_HOME = javaHome;
    pathParts.unshift(`${javaHome}\\bin`);
  }

  env[pathKey] = pathParts.filter(Boolean).join(";");
}

const result =
  process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `firebase emulators:exec --only firestore --project ${projectId}${temporaryConfig ? ` --config '${temporaryConfig.replaceAll("'", "''")}'` : ""} '${testCommand}'; exit $LASTEXITCODE`,
        ],
        { env, stdio: "inherit" },
      )
    : spawnSync(
        "firebase",
        [
          "emulators:exec",
          "--only",
          "firestore",
          "--project",
          projectId,
          ...(temporaryConfig ? ["--config", temporaryConfig] : []),
          testCommand,
        ],
        { env, stdio: "inherit" },
      );

if (result.error) {
  if (temporaryConfig) rmSync(temporaryConfig, { force: true });
  throw result.error;
}

if (temporaryConfig) rmSync(temporaryConfig, { force: true });
process.exit(result.status ?? 1);

async function chooseEmulatorPort(preferredPort) {
  if (Number.isInteger(preferredPort) && (await portAvailable(preferredPort))) {
    return preferredPort;
  }
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
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
