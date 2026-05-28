import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

let requestHeaders;

await main().catch((error) => {
  console.error(readSetupError(error));
  process.exit(1);
});

async function main() {
  const projectId =
    readArg("--project") ?? process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID;
  const webAppDisplayName = readArg("--web-app-name") ?? "PMI KC KB Demo Web";

  if (!projectId) {
    throw new Error(
      "Missing project ID. Set FIREBASE_PROJECT_ID/GCP_PROJECT_ID or pass --project=<id>.",
    );
  }

  const commandEnv = buildCommandEnv();
  const token = printAccessToken(commandEnv);
  requestHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-goog-user-project": projectId,
  };

  await ensureFirebaseProject(projectId);
  const webApp = await ensureWebApp(projectId, webAppDisplayName);
  const webConfig = await firebaseRequest(`${webApp.name}/config`, { method: "GET" });
  updateEnvLocal({
    GCP_PROJECT_ID: projectId,
    FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_API_KEY: webConfig.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      webConfig.authDomain ?? `${projectId}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: webConfig.projectId ?? projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: webConfig.appId,
  });

  console.log(`Firebase project ready: ${projectId}`);
  console.log(`Firebase web app ready: ${webApp.appId}`);
  console.log("Updated .env.local with Firebase browser config.");
}

async function ensureFirebaseProject(id) {
  const existing = await firebaseRequest(`projects/${id}`, {
    method: "GET",
    allowNotFound: true,
  });

  if (existing) {
    return existing;
  }

  const operation = await firebaseRequest(`projects/${id}:addFirebase`, {
    method: "POST",
    body: {},
  });
  return pollOperation(operation.name);
}

async function ensureWebApp(id, displayName) {
  const apps = await firebaseRequest(`projects/${id}/webApps`, { method: "GET" });
  const existing = apps.apps?.find((app) => app.displayName === displayName);

  if (existing) {
    return existing;
  }

  const operation = await firebaseRequest(`projects/${id}/webApps`, {
    method: "POST",
    body: { displayName },
  });
  const result = await pollOperation(operation.name);
  return result.response;
}

async function pollOperation(name) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const operation = await firebaseRequest(name, { method: "GET" });

    if (operation.done) {
      if (operation.error) {
        throw new Error(`${name} failed: ${JSON.stringify(operation.error)}`);
      }

      return operation;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000));
  }

  throw new Error(`${name} did not finish before timeout.`);
}

async function firebaseRequest(path, options) {
  const url = `https://firebase.googleapis.com/v1beta1/${path}`;
  const response = await fetch(url, {
    method: options.method,
    headers: requestHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (response.status === 404 && options.allowNotFound) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${options.method} ${path} failed ${response.status}: ${text}`);
  }

  return parsed;
}

function updateEnvLocal(values) {
  const path = resolve(".env.local");
  const existing = readFileSync(path, "utf8");
  const lines = existing.split(/\r?\n/);
  const written = new Set();
  const nextLines = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);

    if (!match || !(match[1] in values)) {
      return line;
    }

    written.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!written.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  writeFileSync(path, nextLines.join("\n"), "utf8");
}

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function printAccessToken(commandEnv) {
  if (process.platform === "win32") {
    return execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "gcloud auth print-access-token",
      ],
      { encoding: "utf8", env: commandEnv },
    ).trim();
  }

  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    env: commandEnv,
  }).trim();
}

function readSetupError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("projects/") &&
    message.includes(":addFirebase") &&
    message.includes("The caller does not have permission")
  ) {
    return [
      "Firebase project attachment is blocked by Google auth consent.",
      "The current account is project Owner, but the local credential is missing the Firebase Management scope.",
      "A human must complete a browser consent flow for Firebase, or attach Firebase in the Firebase Console, then rerun npm run firebase:setup-demo.",
    ].join("\n");
  }

  return message;
}

function buildCommandEnv() {
  const env = { ...process.env };

  if (process.platform !== "win32") {
    return env;
  }

  const machinePath = readWindowsEnvironment("Path", "Machine");
  const userPath = readWindowsEnvironment("Path", "User");
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
  env[pathKey] = [env[pathKey], machinePath, userPath].filter(Boolean).join(";");
  return env;
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
