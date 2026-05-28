import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

let requestHeaders;

await main().catch((error) => {
  console.error(readSetupError(error));
  process.exitCode = 1;
});

async function main() {
  loadEnvLocal();

  const projectId =
    readArg("--project") ?? process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID;
  const clientId =
    readArg("--client-id") ??
    process.env.FIREBASE_GOOGLE_CLIENT_ID ??
    process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    readArg("--client-secret") ??
    process.env.FIREBASE_GOOGLE_CLIENT_SECRET ??
    process.env.GOOGLE_CLIENT_SECRET;

  if (!projectId) {
    throw new Error(
      "Missing project ID. Set FIREBASE_PROJECT_ID/GCP_PROJECT_ID or pass --project=<id>.",
    );
  }

  requestHeaders = {
    Authorization: `Bearer ${printAccessToken(buildCommandEnv())}`,
    "Content-Type": "application/json",
    "x-goog-user-project": projectId,
  };

  await initializeAuth(projectId);
  const authorizedDomains = await ensureAuthorizedDomains(projectId);
  await ensureGoogleProvider(projectId, clientId, clientSecret);

  console.log(`Firebase Auth initialized for ${projectId}.`);
  console.log("Google sign-in provider is enabled.");
  console.log(`Authorized domains: ${authorizedDomains.join(", ")}`);
}

async function initializeAuth(projectId) {
  const response = await identityRequest(
    `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/identityPlatform:initializeAuth`,
    { method: "POST", allowStatuses: [409] },
  );

  return response;
}

async function ensureAuthorizedDomains(projectId) {
  const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
  const config = await identityRequest(configUrl, { method: "GET" });
  const currentDomains = Array.isArray(config.authorizedDomains)
    ? config.authorizedDomains
    : [];
  const nextDomains = [
    ...new Set(
      [
        ...currentDomains,
        "localhost",
        "127.0.0.1",
        `${projectId}.firebaseapp.com`,
        `${projectId}.web.app`,
      ].filter(Boolean),
    ),
  ].sort();

  if (JSON.stringify([...currentDomains].sort()) === JSON.stringify(nextDomains)) {
    return nextDomains;
  }

  const nextConfig = await identityRequest(`${configUrl}?updateMask=authorizedDomains`, {
    method: "PATCH",
    body: {
      name: `projects/${projectId}/config`,
      authorizedDomains: nextDomains,
    },
  });

  return nextConfig.authorizedDomains ?? nextDomains;
}

async function ensureGoogleProvider(projectId, clientId, clientSecret) {
  const providerName = `projects/${projectId}/defaultSupportedIdpConfigs/google.com`;
  const providerUrl = `https://identitytoolkit.googleapis.com/admin/v2/${providerName}`;
  const existing = await identityRequest(providerUrl, {
    method: "GET",
    allowStatuses: [404],
  });

  if (existing?.status === 404) {
    if (!clientId || !clientSecret) {
      throw new Error(
        [
          "Google sign-in provider is not configured yet.",
          "Create a Web OAuth client in Google Auth Platform, then set",
          "FIREBASE_GOOGLE_CLIENT_ID and FIREBASE_GOOGLE_CLIENT_SECRET in .env.local.",
        ].join(" "),
      );
    }

    return identityRequest(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs?idpId=google.com`,
      {
        method: "POST",
        body: {
          enabled: true,
          clientId,
          clientSecret,
        },
      },
    );
  }

  const body = {
    name: providerName,
    enabled: true,
  };
  const updateMask = ["enabled"];

  if (clientId) {
    body.clientId = clientId;
    updateMask.push("clientId");
  }

  if (clientSecret) {
    body.clientSecret = clientSecret;
    updateMask.push("clientSecret");
  }

  return identityRequest(`${providerUrl}?updateMask=${updateMask.join(",")}`, {
    method: "PATCH",
    body,
  });
}

async function identityRequest(url, options) {
  const response = await fetch(url, {
    method: options.method,
    headers: requestHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (options.allowStatuses?.includes(response.status)) {
    return response.ok ? parsed : { status: response.status, error: parsed.error };
  }

  if (!response.ok) {
    throw new Error(
      `${options.method} ${url} failed ${response.status}: ${JSON.stringify(parsed)}`,
    );
  }

  return parsed;
}

function loadEnvLocal() {
  if (!existsSync(".env.local")) {
    return;
  }

  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
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

function readSetupError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("BILLING_NOT_ENABLED")) {
    return [
      "Firebase Auth setup is blocked because billing is not enabled for the demo project.",
      "A human must attach or create a billing account for pmikckb-test in Google Cloud Console.",
      "After billing is active, rerun npm run firebase:setup-auth.",
    ].join("\n");
  }

  if (message.includes("CONFIGURATION_NOT_FOUND")) {
    return [
      "Firebase Auth setup is blocked because the Auth configuration does not exist yet.",
      "Enable Authentication once in Firebase Console or attach billing, then rerun npm run firebase:setup-auth.",
    ].join("\n");
  }

  return message;
}
