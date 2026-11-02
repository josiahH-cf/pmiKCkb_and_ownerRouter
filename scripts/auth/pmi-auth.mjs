import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureAuthenticated } from "./ensure.mjs";
import { LOCAL_PRINCIPAL } from "./identities.mjs";
import { selectReleaseCheckoutPair } from "../release-checkout-pair.mjs";
import {
  establishAppSession,
  resolveHarnessBrowser,
  validateProfilePath,
} from "./browser.ts";
import { verifyProviderHealth, safeProviderFailure } from "./provider-health.mjs";
import { recordBrowserEnrollment } from "./browser-enrollment.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const APP_ORIGIN = "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app";
const GITHUB_ACCOUNT = "josiahH-cf";
const NEED = ["gcloud", "adc", "env", "gh"];
const RECOVERABLE = new Set([
  "stale_token",
  "adc_stale",
  "adc_missing",
  "principal_unknown",
]);

export function configurationRoot(root = ROOT) {
  const home = homedir();
  const pair = selectReleaseCheckoutPair({
    stateRoot: join(home, ".local/state/pmi-kc-release"),
    nativeAnchor: join(home, "pmi-kc-work/main"),
    sourceAnchor: "/mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter",
    callerRoot: root,
  });
  if (!pair.valid || !existsSync(join(pair.nativeRoot, ".env.local"))) {
    throw new Error("registered_configuration_unavailable");
  }
  return realpathSync(pair.nativeRoot);
}

export function githubIdentity(env = process.env, run = spawnSync) {
  for (const file of ["gh", "/mnt/c/Program Files/GitHub CLI/gh.exe"]) {
    const result = run(file, ["api", "user", "--jq", ".login"], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
    });
    if (result.error?.code === "ENOENT") continue;
    if (result.status !== 0)
      return {
        state: "blocked",
        code: "github_identity_unverified",
        detail:
          "GitHub could not verify its current account. No credentials were replaced.",
      };
    if (result.stdout.trim().toLowerCase() !== GITHUB_ACCOUNT.toLowerCase())
      return {
        state: "blocked",
        code: "github_wrong_identity",
        detail: "GitHub is using a different account. No account was switched.",
      };
    return {
      state: "ok",
      identity: GITHUB_ACCOUNT,
      detail: "Authenticated GitHub identity verified by its API.",
    };
  }
  return {
    state: "blocked",
    code: "github_unavailable",
    detail: "GitHub CLI is unavailable.",
  };
}

export function canEnrollGoogle(items) {
  const blocked = items.filter(
    (item) =>
      ["gcloud", "adc"].includes(item.credential) &&
      !["ok", "repaired"].includes(item.state),
  );
  return (
    blocked.length > 0 &&
    blocked.every((item) => RECOVERABLE.has(item.code)) &&
    !items.some(
      (item) =>
        ["gcloud", "adc"].includes(item.credential) &&
        item.identity &&
        item.identity.toLowerCase() !== LOCAL_PRINCIPAL,
    )
  );
}

/** Authenticates existing local stores only. Provider readiness is reported separately and honestly. */
export async function runPmiAuth({
  checkOnly = false,
  emit = console.log,
  deps = {},
} = {}) {
  const resolveRoot = deps.configurationRoot ?? configurationRoot;
  const ensure = deps.ensure ?? ensureAuthenticated;
  const github = deps.github ?? githubIdentity;
  const session = deps.session ?? establishAppSession;
  const enroll =
    deps.enroll ??
    ((root) =>
      spawnSync(
        "bash",
        [
          join(ROOT, "scripts/auth/enroll.sh"),
          "--attended",
          `--account=${LOCAL_PRINCIPAL}`,
          "--browser",
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${dirname(process.execPath)}:/snap/google-cloud-cli/current/bin:${process.env.PATH ?? ""}`,
          },
          stdio: "inherit",
          timeout: 900_000,
        },
      ).status === 0);
  emit(
    "PMI auth: checking registered configuration and existing WSL credentials; values are never printed.",
  );
  const config = resolveRoot();
  const env = { ...process.env, GCLOUD_BIN: "/snap/google-cloud-cli/current/bin/gcloud" };
  let local = await ensure({ root: config, env, need: NEED, unattended: true });
  if (!checkOnly && canEnrollGoogle(local.items)) {
    emit(
      `Google needs attended enrollment as ${LOCAL_PRINCIPAL}; complete only the new Google prompt from this running command.`,
    );
    if (await enroll(config))
      local = await ensure({ root: config, env, need: NEED, unattended: true });
  }
  const checks = local.items
    .filter((item) => item.state !== "skipped")
    .map((item) => ({
      service: item.credential,
      state: item.state,
      code: item.code,
      detail: item.detail,
      ...(item.humanStep ? { nextStep: item.humanStep } : {}),
    }));
  const gh = await github(env);
  checks.push({ service: "github_identity", ...gh });
  for (const item of checks)
    emit(
      `${item.service}: ${item.state}${item.code ? ` (${item.code})` : ""} — ${item.detail}`,
    );
  const coreBlocked = checks.some((item) => !["ok", "repaired"].includes(item.state));
  let browser;
  if (!coreBlocked) {
    const profile =
      deps.profile ??
      validateProfilePath(join(homedir(), "pmi-assurance/owner-admin"), {
        create: false,
        repositoryRoot: ROOT,
      });
    const options = {
      profile,
      origin: APP_ORIGIN,
      email: LOCAL_PRINCIPAL,
      expectedRole: "Admin",
      executablePath: deps.executablePath ?? resolveHarnessBrowser(),
      headless: true,
      humanWaitMs: 0,
      profileWaitMs: 15_000,
      stepTimeoutMs: 90_000,
      onEvent: (event) =>
        emit(`browser: ${event.stage}${event.detail ? ` — ${event.detail}` : ""}`),
    };
    browser = await session(options);
    if (browser.result === "human_required" && !checkOnly) {
      emit(
        `Google needs a person. Complete the visible PMI browser as ${LOCAL_PRINCIPAL}; this command waits for up to ten minutes.`,
      );
      browser = await session({ ...options, headless: false, humanWaitMs: 600_000 });
      if (browser.result === "signed_in")
        (deps.recordEnrollment ?? recordBrowserEnrollment)(profile);
    }
    checks.push({
      service: "app_browser",
      state: browser.result === "signed_in" ? "ok" : "blocked",
      code: browser.code ?? browser.result,
      detail:
        browser.result === "signed_in"
          ? `Exact account and ${browser.role} role verified (${browser.method}).`
          : (browser.error ?? browser.reason),
    });
  } else
    checks.push({
      service: "app_browser",
      state: "not_run",
      detail: "Resolve the local credential/identity condition first.",
    });
  const browserCheck = checks.at(-1);
  emit(
    `app_browser: ${browserCheck.state}${browserCheck.code ? ` (${browserCheck.code})` : ""} — ${browserCheck.detail}`,
  );
  const localAuthReady = !coreBlocked && browser?.result === "signed_in";
  // Authentication and the downstream provider reads have independent outcomes.
  let providerHealth = {
    state: "not_run",
    detail:
      "Resolve local credentials and the exact app identity before provider checks.",
  };
  if (localAuthReady) {
    try {
      providerHealth = await (deps.providers ?? verifyProviderHealth)({
        checkOnly,
        emit,
        configRoot: config,
      });
    } catch (error) {
      providerHealth = { ...safeProviderFailure(error), checks: [] };
    }
  }
  emit(`provider_health: ${providerHealth.state} — ${providerHealth.detail}`);
  const providersReady = providerHealth.state === "verified_with_exceptions";
  const result = {
    result: localAuthReady
      ? providersReady
        ? "auth_ready_with_exceptions"
        : "local_auth_ready_provider_attention_required"
      : "blocked",
    localAuthReady,
    checks,
    providerHealth,
    exitCode: !localAuthReady
      ? browser?.result === "human_required"
        ? 2
        : 1
      : providersReady
        ? 0
        : 3,
  };
  emit(JSON.stringify(result));
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.some((arg) => arg !== "--check")) {
    console.error(
      "Usage: scripts/pmi-auth [--check]. Default reuses credentials first and opens attended recovery only when required; --check never starts attended enrollment.",
    );
    return 2;
  }
  try {
    return (await runPmiAuth({ checkOnly: argv.includes("--check") })).exitCode;
  } catch {
    console.error(
      "NOT READY: PMI auth could not verify its registered local setup. No credentials or accounts were replaced.",
    );
    return 1;
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  process.exitCode = await main();
