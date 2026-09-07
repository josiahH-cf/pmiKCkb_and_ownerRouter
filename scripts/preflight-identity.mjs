// Live identity probe for the single-identity rule (see docs/auth-identity-and-access-strategy.md
// and AGENTS.md "Authentication"). Asserts the local auth surfaces resolve to a managed
// pmikcmetro.com person (attended) or to the designated S112 automation identity (the automation
// principal impersonating the automation service account), and that no key files are in use, then
// prints the six-identity-system checklist so the surfaces this script cannot auto-verify (Claude
// connector, Firebase CLI, Cloud Build SA, runtime SA) are visible at every cutover instead of
// failing silently.
//
// The evaluation is a pure function (evaluateIdentity) so it is unit-testable; the live
// gathering (gatherIdentity) is best-effort and degrades to warnings when gcloud is absent.
//
//   npm run preflight:identity                # attended or unattended identity accepted
//   npm run preflight:identity -- --unattended   # only the automation identity passes

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveIdentities } from "./auth/identities.mjs";

export const ALLOWED_DOMAIN = "pmikcmetro.com";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

function designatedAutomation(env = process.env) {
  const identities = resolveIdentities(env);
  return {
    principal: identities.automationPrincipal,
    serviceAccount: identities.automationServiceAccount,
  };
}

function isAutomationState(state, automation) {
  if (!automation) return false;
  return (
    same(state.gcloudAccount, automation.principal) &&
    same(state.impersonation, automation.serviceAccount) &&
    same(state.adcAccount, automation.serviceAccount)
  );
}

export function evaluateIdentity(
  state,
  { allowedDomain = ALLOWED_DOMAIN, automation, unattended = false } = {},
) {
  const errors = [];
  const warnings = [];
  const { gcloudAccount, adcPresent, adcAccount, googleAppCreds, gcloudAvailable } =
    state;
  const impersonation = state.impersonation ?? null;

  if (!gcloudAvailable) {
    warnings.push(
      "gcloud CLI not found or not runnable; could not probe the local identity. Verify manually.",
    );
    return { ok: true, errors, warnings };
  }

  if (!gcloudAccount) {
    errors.push(
      `No active gcloud account. Run: gcloud auth login <user>@${allowedDomain}`,
    );
  } else if (!isDomainAccount(gcloudAccount, allowedDomain)) {
    errors.push(
      `Active gcloud account ${gcloudAccount} is not @${allowedDomain}. ` +
        `Run: gcloud config set account <user>@${allowedDomain}`,
    );
  }

  if (googleAppCreds) {
    errors.push(
      `GOOGLE_APPLICATION_CREDENTIALS is set (${googleAppCreds}). Key files are banned — ` +
        `use ADC. Unset it.`,
    );
  }

  const adcIsServiceAccount = Boolean(adcAccount) && isServiceAccount(adcAccount);

  if (!adcPresent) {
    errors.push(
      "Application Default Credentials are missing. Run: gcloud auth application-default login",
    );
  } else if (adcIsServiceAccount) {
    if (!automation || !same(adcAccount, automation.serviceAccount)) {
      errors.push(
        `ADC principal ${adcAccount} is not the designated automation service account` +
          (automation ? ` (${automation.serviceAccount})` : "") +
          ". Re-run: npm run auth:enroll",
      );
    } else if (!same(impersonation, automation.serviceAccount)) {
      errors.push(
        `ADC principal is the automation service account but gcloud impersonation is not configured ` +
          `(auth/impersonate_service_account). Re-run: npm run auth:enroll`,
      );
    }
  } else if (adcAccount && !isDomainAccount(adcAccount, allowedDomain)) {
    errors.push(
      `ADC principal ${adcAccount} is not @${allowedDomain}. ` +
        `Re-run: gcloud auth application-default login as <user>@${allowedDomain}`,
    );
  } else if (!adcAccount) {
    warnings.push(
      `Could not resolve the ADC principal email; verify it is @${allowedDomain} manually.`,
    );
  }

  if (unattended && !isAutomationState(state, automation)) {
    errors.push(
      `Unattended work requires the automation identity` +
        (automation
          ? ` (${automation.principal} impersonating ${automation.serviceAccount})`
          : "") +
        `; the current identity is attended. Run: npm run auth:enroll`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function buildIdentityChecklist(state, { automation } = {}) {
  const mark = (ok) => (ok === true ? "ok" : ok === false ? "FAIL" : "verify manually");
  const attendedOk =
    Boolean(state.gcloudAccount) &&
    isDomainAccount(state.gcloudAccount ?? "", ALLOWED_DOMAIN) &&
    state.adcPresent &&
    (!state.adcAccount || isDomainAccount(state.adcAccount, ALLOWED_DOMAIN)) &&
    !state.googleAppCreds;
  const automationOk =
    Boolean(state.adcPresent) &&
    !state.googleAppCreds &&
    isAutomationState(state, automation);
  return [
    {
      system:
        "(a) agent runner's file/Drive connector (Claude MCP today; N/A under Codex)",
      status: mark(undefined),
      detail:
        "Under Claude Code, check claude.ai → Settings → Connectors is the pmikcmetro.com account; not applicable under Codex.",
    },
    {
      system: "(b) gcloud user / ADC",
      status: mark(attendedOk || automationOk),
      detail: `gcloud=${state.gcloudAccount ?? "none"}${
        state.impersonation ? ` impersonating ${state.impersonation}` : ""
      }; adc=${
        state.adcPresent ? (state.adcAccount ?? "present") : "missing"
      }; GOOGLE_APPLICATION_CREDENTIALS=${state.googleAppCreds ?? "unset"}`,
    },
    {
      system: "(c) Cloud Run runtime service account",
      status: mark(undefined),
      detail:
        "Deploy with --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com.",
    },
    {
      system: "(d) Firebase end-user auth",
      status: mark(undefined),
      detail: "ALLOWED_HD must be pmikcmetro.com (enforced by preflight:production).",
    },
    {
      system: "(e) Firebase CLI",
      status: mark(undefined),
      detail: "Run `npx firebase login:list`; must be the pmikcmetro.com account.",
    },
    {
      system: "(f) Cloud Build / buildpack identity",
      status: mark(undefined),
      detail: "Confirm the build SA is a pmi-kc-kb-prod identity (see strategy §2f).",
    },
  ];
}

export async function gatherIdentity({ env = process.env } = {}) {
  const gcloudAccount = runGcloud(["config", "get-value", "account"], env);
  const gcloudAvailable = gcloudAccount !== null || runGcloud(["version"], env) !== null;
  const googleAppCreds = readString(env.GOOGLE_APPLICATION_CREDENTIALS);
  const impersonationRaw = readString(
    runGcloud(["config", "get-value", "auth/impersonate_service_account"], env),
  );
  const impersonation =
    impersonationRaw && !/^\(unset\)$/i.test(impersonationRaw) ? impersonationRaw : null;

  const adcToken = runGcloud(["auth", "application-default", "print-access-token"], env);
  const adcPresent = Boolean(adcToken) || adcFileExists(env);
  const adcAccount = adcToken ? await resolveTokenEmail(adcToken) : null;

  return {
    gcloudAvailable,
    gcloudAccount: normalizeAccount(gcloudAccount),
    impersonation,
    adcPresent,
    adcAccount,
    googleAppCreds,
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const json = argv.includes("--json");
  const unattended = argv.includes("--unattended");
  const automation = designatedAutomation(env);
  const state = await gatherIdentity({ env });
  const result = evaluateIdentity(state, {
    allowedDomain: ALLOWED_DOMAIN,
    automation,
    unattended,
  });
  const checklist = buildIdentityChecklist(state, { automation });

  if (json) {
    console.log(JSON.stringify({ ...result, checklist, state }, null, 2));
  } else {
    console.log("Identity preflight — six systems (all must be pmikcmetro.com):");
    for (const item of checklist) {
      console.log(`  [${item.status}] ${item.system} — ${item.detail}`);
    }
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    if (result.ok) {
      console.log(
        `Local gcloud/ADC identity preflight passed (${
          isAutomationState(state, automation)
            ? "unattended automation identity"
            : "attended"
        }).`,
      );
    } else {
      console.error("Identity preflight failed:");
      for (const error of result.errors) {
        console.error(`- ${error}`);
      }
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function isDomainAccount(value, domain) {
  return new RegExp(`@${domain.replace(/\./g, "\\.")}$`, "i").test(String(value).trim());
}

function isServiceAccount(value) {
  return /\.gserviceaccount\.com$/i.test(String(value).trim());
}

function same(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.trim().toLowerCase() === right.trim().toLowerCase()
  );
}

function normalizeAccount(value) {
  const trimmed = readString(value);
  return trimmed && trimmed.includes("@") ? trimmed : undefined;
}

function runGcloud(args, env) {
  const bin = readString(env.GCLOUD_BIN) ?? "gcloud";
  // On Windows gcloud is a .cmd shim; invoke it through cmd.exe without `shell: true` so the
  // args stay an escaped array (avoids the DEP0190 shell-args deprecation).
  const isWindows = process.platform === "win32";
  const file = isWindows ? (process.env.ComSpec ?? "cmd.exe") : bin;
  const fileArgs = isWindows ? ["/c", bin, ...args] : args;

  try {
    const out = execFileSync(file, fileArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return readString(out) ?? null;
  } catch {
    return null;
  }
}

function adcFileExists(env) {
  const candidates = [];

  if (process.platform === "win32" && env.APPDATA) {
    candidates.push(join(env.APPDATA, "gcloud", "application_default_credentials.json"));
  }

  candidates.push(
    join(homedir(), ".config", "gcloud", "application_default_credentials.json"),
  );

  return candidates.some((path) => existsSync(path));
}

async function resolveTokenEmail(token) {
  try {
    const response = await fetch(TOKENINFO_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return readString(payload?.email) ?? null;
  } catch {
    return null;
  }
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
