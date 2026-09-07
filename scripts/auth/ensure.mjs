#!/usr/bin/env node
// S112 — `npm run auth:ensure`: probe every credential the unattended loop needs, repair what can be
// repaired without a browser, re-establish canary browser sessions on request, and report. Exit 0
// when everything requested is usable; exit 2 with exactly one human step per blocked credential.
//
// Never opens a browser, never types a credential, never prints or persists a token: every token
// probe discards stdout and reads only the exit code (TOKEN_PROBE_STDIO), and every free-text
// detail passes through `redact`. Runs under WSL (the unattended path) and under Windows node.
//
//   npm run auth:ensure                       # gcloud, adc, env, gh (attended-tolerant)
//   npm run auth:ensure -- --unattended       # require the designated automation identity
//   npm run auth:ensure -- --need=canary --origins=<a>,<b> --admin-profile=<p> --editor-profile=<p>
//   npm run auth:ensure -- --json | --quiet | --hook

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GoogleAuth } from "google-auth-library";

import { classifyAdcError } from "../preflight-adc.mjs";
import { resolveIdentities } from "./identities.mjs";
import {
  assessCredentials,
  chooseGcloudStore,
  exitCodeFor,
  formatStatus,
  parseNeed,
  redact,
  summarize,
} from "./plan.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const WINDOWS_GH = "/mnt/c/Program Files/GitHub CLI/gh.exe";

/** Token mints discard stdout; only the exit code and a redacted last stderr line are read. */
export const TOKEN_PROBE_STDIO = Object.freeze(["ignore", "ignore", "pipe"]);

export function isWsl(procVersion = readProcVersion(), platform = process.platform) {
  return platform === "linux" && /microsoft|wsl/i.test(procVersion);
}

function readProcVersion() {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return "";
  }
}

function gcloudCommand(env) {
  const bin = readString(env.GCLOUD_BIN) ?? "gcloud";
  // On Windows gcloud is a .cmd shim; invoke it through cmd.exe so the args stay an escaped array.
  if (process.platform === "win32") {
    return { file: env.ComSpec ?? "cmd.exe", prefix: ["/c", bin] };
  }
  return { file: bin, prefix: [] };
}

/** Capture stdout of a non-token gcloud read (config, account list). Null when it fails. */
function gcloudCapture(args, env) {
  const { file, prefix } = gcloudCommand(env);
  try {
    return execFileSync(file, [...prefix, ...args], {
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    }).trim();
  } catch {
    return null;
  }
}

/** Mint a token with prompts disabled and stdout discarded; only the exit code is meaningful. */
function gcloudTokenProbe(args, env) {
  const { file, prefix } = gcloudCommand(env);
  const result = spawnSync(file, [...prefix, ...args], {
    encoding: "utf8",
    env: { ...env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" },
    stdio: [...TOKEN_PROBE_STDIO],
    timeout: 90_000,
  });
  const stderrLines = String(result.stderr ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    ok: result.status === 0,
    error: redact(
      stderrLines.at(-1) ?? (result.error ? String(result.error.message) : ""),
    ),
  };
}

export function probeGcloud(env) {
  const available =
    gcloudCapture(["version", "--format=value(core)"], env) !== null ||
    gcloudCapture(["config", "get-value", "account"], env) !== null;
  if (!available) {
    return {
      available: false,
      activeAccount: undefined,
      impersonation: null,
      storeAccounts: [],
    };
  }
  const activeAccount = normalizeAccount(
    gcloudCapture(["config", "get-value", "account"], env),
  );
  const impersonationRaw = readString(
    gcloudCapture(["config", "get-value", "auth/impersonate_service_account"], env),
  );
  const impersonation =
    impersonationRaw && !/^\(unset\)$/i.test(impersonationRaw) ? impersonationRaw : null;
  const storeAccounts = (
    gcloudCapture(["auth", "list", "--format=value(account)"], env) ?? ""
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("@"));
  const token = gcloudTokenProbe(["auth", "print-access-token"], env);
  return {
    available: true,
    activeAccount,
    impersonation,
    storeAccounts,
    tokenFresh: token.ok,
    ...(token.ok ? {} : { error: token.error }),
  };
}

/** Freshness of the library ADC path, exactly as the app's Google clients resolve it. */
export async function probeAdc(env, { fetchImpl = fetch, timeoutMs = 60_000 } = {}) {
  try {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await withTimeout(auth.getClient(), timeoutMs, "adc_probe_timeout");
    const accessToken = await withTimeout(
      client.getAccessToken(),
      timeoutMs,
      "adc_probe_timeout",
    );
    const value = accessToken?.token;
    if (typeof value !== "string" || value.length === 0) {
      return {
        present: true,
        fresh: false,
        principal: null,
        errorKind: "other",
        error: "no token",
      };
    }
    const principal = await readPrincipal(value, fetchImpl, timeoutMs);
    return { present: true, fresh: true, principal, errorKind: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorKind = classifyAdcError(message);
    return {
      present: errorKind !== "missing",
      fresh: false,
      principal: null,
      errorKind,
      error: redact(message.split(/\r?\n/)[0] ?? ""),
    };
  }
}

async function readPrincipal(accessToken, fetchImpl, timeoutMs) {
  try {
    const response = await fetchImpl(TOKENINFO_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return readString(payload?.email) ?? null;
  } catch {
    return null;
  }
}

export function probeEnv(root, requiredKeys) {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return { present: false, missingKeys: [...requiredKeys] };
  const text = readFileSync(path, "utf8");
  const missingKeys = requiredKeys.filter(
    (key) => !new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(text),
  );
  return { present: true, missingKeys };
}

export function probeGh(env) {
  const tokenEnv = Boolean(readString(env.GH_TOKEN) ?? readString(env.GITHUB_TOKEN));
  const candidates = process.platform === "win32" ? ["gh"] : ["gh", WINDOWS_GH];
  for (const file of candidates) {
    if (file !== "gh" && !existsSync(file)) continue;
    const result = spawnSync(file, ["auth", "status"], {
      encoding: "utf8",
      env,
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 30_000,
    });
    if (result.error && result.error.code === "ENOENT") continue;
    return { available: true, loggedIn: result.status === 0, tokenEnv };
  }
  return { available: false, loggedIn: false, tokenEnv };
}

/** Re-establish each canary session through `canary-session.ts` (WSL only; it drives a browser). */
export function runCanarySessions(requests, env, root = ROOT) {
  return requests.map((request) => {
    if (process.platform === "win32") {
      return {
        ...request,
        result: "error",
        error:
          "canary sessions run under WSL: wsl -e bash -lc '... npm run auth:ensure -- --need=canary ...'",
      };
    }
    const tsx = join(root, "node_modules", ".bin", "tsx");
    const command = existsSync(tsx) ? tsx : "npx";
    const args = [
      ...(command === "npx" ? ["tsx"] : []),
      join(root, "scripts", "auth", "canary-session.ts"),
      `--profile=${request.profile}`,
      `--origin=${request.origin}`,
      `--email=${request.email}`,
    ];
    const child = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 240_000,
    });
    const line = String(child.stdout ?? "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith("{"))
      .at(-1);
    if (!line) {
      const stderrTail =
        String(child.stderr ?? "")
          .trim()
          .split(/\r?\n/)
          .at(-1) ?? "";
      return {
        ...request,
        result: "error",
        error: redact(
          stderrTail || `canary-session exited ${child.status ?? "without a result"}`,
        ),
      };
    }
    try {
      const parsed = JSON.parse(line);
      return { ...request, ...parsed };
    } catch {
      return {
        ...request,
        result: "error",
        error: "canary-session returned no readable result",
      };
    }
  });
}

/**
 * The in-process entry point. Probe, repair, re-probe, and assess; never throws for a blocked
 * credential (the caller reads `exitCode` and `lines`).
 */
export async function ensureAuthenticated({
  need = parseNeed(),
  unattended = false,
  canary = [],
  env = process.env,
  root = ROOT,
} = {}) {
  const identities = resolveIdentities(env);
  const wsl = isWsl();
  const store = chooseGcloudStore({ cloudsdkConfig: env.CLOUDSDK_CONFIG });
  const keyFile = readString(env.GOOGLE_APPLICATION_CREDENTIALS);
  const wanted = new Set(need);
  const probe = {
    platform: process.platform,
    wsl,
    googleAppCreds: keyFile,
    gcloud: wanted.has("gcloud") ? probeGcloud(env) : {},
    adc: wanted.has("adc") && !keyFile ? await probeAdc(env) : {},
    env: wanted.has("env") ? probeEnv(root, identities.requiredEnvKeys) : {},
    gh: wanted.has("gh") ? probeGh(env) : {},
    canary: [],
  };

  let assessment = assessCredentials(probe, { identities, need, unattended });
  const applied = [];
  if (assessment.repairs.length > 0) {
    for (const repair of assessment.repairs) {
      const output = gcloudCapture(repair.args, env);
      applied.push({ action: repair.action, ok: output !== null });
    }
    probe.gcloud = probeGcloud(env);
    assessment = assessCredentials(probe, { identities, need, unattended });
  }

  if (wanted.has("canary")) {
    probe.canary = runCanarySessions(canary, env, root);
    assessment = assessCredentials(probe, { identities, need, unattended });
  }

  const repairedGcloud = applied.length > 0 && applied.every((entry) => entry.ok);
  const items = assessment.items.map((item) =>
    item.credential === "gcloud" && item.state === "ok" && repairedGcloud
      ? { ...item, state: "repaired" }
      : item,
  );
  return {
    items,
    applied,
    exitCode: exitCodeFor(items),
    lines: formatStatus(items, { unattended, platform: process.platform, wsl, store }),
    identities,
  };
}

function canaryRequests(argv, identities) {
  const origins = (readFlag(argv, "--origins") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requests = [];
  for (const label of ["admin", "editor"]) {
    const profile = readFlag(argv, `--${label}-profile`);
    if (!profile) continue;
    const email = readFlag(argv, `--${label}-email`) ?? identities.canaries[label].email;
    for (const origin of origins) requests.push({ label, profile, origin, email });
  }
  return requests;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const need = parseNeed(readFlag(argv, "--need"));
  const unattended = argv.includes("--unattended");
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet");
  const hook = argv.includes("--hook");
  const identities = resolveIdentities(env);
  const result = await ensureAuthenticated({
    need,
    unattended,
    canary: canaryRequests(argv, identities),
    env,
  });

  if (hook) {
    // Session-start advisory line: always exit 0 so a stale credential informs rather than aborts.
    console.log(`auth: ${summarize(result.items)}`);
    return result;
  }
  if (json) {
    console.log(
      JSON.stringify(
        { items: result.items, applied: result.applied, exitCode: result.exitCode },
        null,
        2,
      ),
    );
  } else if (!quiet || result.exitCode !== 0) {
    for (const line of result.lines) console.log(line);
  }
  process.exitCode = result.exitCode;
  return result;
}

function readFlag(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return undefined;
}

function normalizeAccount(value) {
  const trimmed = readString(value);
  return trimmed && trimmed.includes("@") ? trimmed : undefined;
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function withTimeout(promise, timeoutMs, code) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
