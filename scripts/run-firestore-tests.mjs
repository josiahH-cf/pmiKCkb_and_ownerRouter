import { execFileSync, spawnSync } from "node:child_process";

const projectId = "pmi-kc-kb-test";
const testCommand = "vitest run --config vitest.firestore.config.ts";

const env = { ...process.env };

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
          `firebase emulators:exec --only firestore --project ${projectId} '${testCommand}'; exit $LASTEXITCODE`,
        ],
        { env, stdio: "inherit" },
      )
    : spawnSync(
        "firebase",
        ["emulators:exec", "--only", "firestore", "--project", projectId, testCommand],
        { env, stdio: "inherit" },
      );

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

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
