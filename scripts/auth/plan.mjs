// S112 — the pure decision core behind `npm run auth:ensure`. Given a probe of the local credential
// state, decide per credential whether it is ok, repairable without a browser, or blocked on exactly
// one human step. No I/O here, so every branch is unit-testable and the runner's behavior is the
// planner's behavior. Nothing in this module ever sees a token; `redact` guards the text that does.

import { isManagedAccount, isProjectServiceAccount } from "./identities.mjs";

export const CREDENTIALS = Object.freeze(["gcloud", "adc", "env", "gh", "canary"]);
export const DEFAULT_NEED = Object.freeze(["gcloud", "adc", "env", "gh"]);
export const STATES = Object.freeze([
  "ok",
  "repaired",
  "repairable",
  "blocked",
  "skipped",
]);

/** Parse `--need=a,b`; undefined means the four non-browser credentials. */
export function parseNeed(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return [...DEFAULT_NEED];
  }
  const need = [
    ...new Set(
      String(value)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  for (const entry of need) {
    if (!CREDENTIALS.includes(entry)) {
      throw new Error(
        `unknown credential "${entry}"; expected one of ${CREDENTIALS.join(", ")}`,
      );
    }
  }
  return need;
}

/** The one interactive step that can restore a Google login. Attended = the owner's own account. */
export function enrollCommand({
  attended = false,
  account,
  platform = process.platform,
} = {}) {
  // Each shell enrolls its own store: PowerShell for the Windows store, bash for the WSL store.
  if (platform !== "win32") {
    if (!attended) return "npm run auth:enroll:wsl";
    return account
      ? `npm run auth:enroll:wsl -- --attended --account=${account}`
      : "npm run auth:enroll:wsl -- --attended";
  }
  if (!attended) return "npm run auth:enroll";
  return account
    ? `npm run auth:enroll -- -Attended -Account ${account}`
    : "npm run auth:enroll -- -Attended";
}

/** The one interactive step that can restore a canary browser session on an origin. */
export function canaryEnrollCommand({ profile, origin, email }) {
  return `npm run auth:enroll-canary -- --profile=${profile} --origin=${origin} --email=${email}`;
}

/**
 * The gcloud CLI store a shell uses. An explicit CLOUDSDK_CONFIG wins; otherwise the shell's own
 * store. A shell is never redirected to another store: the Google client libraries read ADC only
 * from the shell's own home directory, so a redirected CLI would disagree with the libraries.
 */
export function chooseGcloudStore({ cloudsdkConfig } = {}) {
  const explicit = typeof cloudsdkConfig === "string" ? cloudsdkConfig.trim() : "";
  if (explicit) return { store: "env", cloudsdkConfig: explicit };
  return { store: "local", cloudsdkConfig: undefined };
}

const SECRET_PATTERNS = [
  /ya29\.[A-Za-z0-9._-]+/g,
  /1\/\/[A-Za-z0-9._-]+/g,
  /\bops_[A-Za-z0-9]+/g,
  /\bgh[opsur]_[A-Za-z0-9]+/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /-----BEGIN [A-Z ]+-----[\s\S]*?(?:-----END [A-Z ]+-----|$)/g,
  /"private_key"\s*:\s*"[^"]*"/g,
  /\bBearer\s+[A-Za-z0-9._-]+/g,
];

/** Strip every token shape from free text before it can reach a log, report, or receipt. */
export function redact(text) {
  let out = String(text ?? "");
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redacted]");
  return out;
}

function lower(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function skipped(credential) {
  return { credential, state: "skipped", identity: "", detail: "not requested" };
}

function blocked(credential, code, humanStep, extra = {}) {
  return {
    credential,
    state: "blocked",
    code,
    humanStep,
    identity: "",
    detail: "",
    ...extra,
  };
}

/**
 * Decide the state of every requested credential. `probe` is the shape `ensure.mjs` gathers:
 * platform/wsl flags, `googleAppCreds`, and per-credential probe results. Returns the items and the
 * browser-free repairs (gcloud config commands) that must run before a re-probe.
 */
export function assessCredentials(probe, { identities, need, unattended = false }) {
  const wanted = new Set(need);
  const items = [];
  const repairs = [];
  const keyFile =
    typeof probe.googleAppCreds === "string" && probe.googleAppCreds.trim() !== "";
  const principal = lower(identities.automationPrincipal);
  const serviceAccount = lower(identities.automationServiceAccount);
  const domain = identities.managedDomain;
  const gcloud = probe.gcloud ?? {};
  const storeAccounts = (gcloud.storeAccounts ?? []).map(lower);
  const principalEnrolled = storeAccounts.includes(principal);
  const active = lower(gcloud.activeAccount);
  const attendedAccount = isManagedAccount(active, domain) ? active : undefined;
  const wantAutomation = unattended || principalEnrolled;
  const enroll = (options) => enrollCommand({ ...options, platform: probe.platform });
  const stepForGoogle = () =>
    wantAutomation
      ? enroll({ attended: false })
      : enroll({ attended: true, account: attendedAccount });

  // gcloud CLI
  if (!wanted.has("gcloud")) {
    items.push(skipped("gcloud"));
  } else if (keyFile) {
    items.push(
      blocked(
        "gcloud",
        "key_file_forbidden",
        "unset GOOGLE_APPLICATION_CREDENTIALS; key files are banned and cannot be created for this project",
        { identity: active || "none", detail: "a key file is configured" },
      ),
    );
  } else if (!gcloud.available) {
    items.push(
      blocked(
        "gcloud",
        "gcloud_unavailable",
        "install the Google Cloud SDK, then re-run npm run auth:ensure",
        { detail: "gcloud is not on PATH" },
      ),
    );
  } else if (wantAutomation) {
    if (!principalEnrolled) {
      items.push(
        blocked("gcloud", "not_enrolled", enroll({ attended: false }), {
          identity: active || "none",
          detail: `the automation principal ${identities.automationPrincipal} is not signed in on this store`,
        }),
      );
    } else {
      const configRepairs = [];
      if (active !== principal) {
        configRepairs.push({
          credential: "gcloud",
          action: "gcloud-config-set-account",
          args: ["config", "set", "account", identities.automationPrincipal],
        });
      }
      if (lower(gcloud.impersonation) !== serviceAccount) {
        configRepairs.push({
          credential: "gcloud",
          action: "gcloud-config-set-impersonation",
          args: [
            "config",
            "set",
            "auth/impersonate_service_account",
            identities.automationServiceAccount,
          ],
        });
      }
      if (configRepairs.length > 0) {
        repairs.push(...configRepairs);
        items.push({
          credential: "gcloud",
          state: "repairable",
          kind: "unattended",
          identity: identities.automationPrincipal,
          detail: `gcloud config drifted (${configRepairs.map((repair) => repair.action).join(", ")}); repairing without a browser`,
        });
      } else if (gcloud.tokenFresh === false) {
        items.push(
          blocked("gcloud", "stale_token", enroll({ attended: false }), {
            kind: "unattended",
            identity: identities.automationPrincipal,
            detail: `token mint failed: ${redact(gcloud.error ?? "reauthentication required")}`,
          }),
        );
      } else {
        items.push({
          credential: "gcloud",
          state: "ok",
          kind: "unattended",
          identity: identities.automationPrincipal,
          detail: `impersonating ${identities.automationServiceAccount}`,
        });
      }
    }
  } else if (!active) {
    items.push(
      blocked("gcloud", "no_account", enroll({ attended: true }), {
        identity: "none",
        detail: "no active gcloud account",
      }),
    );
  } else if (!attendedAccount) {
    items.push(
      blocked(
        "gcloud",
        "personal_identity",
        `gcloud config set account <user>@${domain}, or ${enroll({ attended: true })}`,
        { identity: active, detail: `active account is not @${domain}` },
      ),
    );
  } else if (gcloud.tokenFresh === false) {
    items.push(
      blocked(
        "gcloud",
        "stale_token",
        enroll({ attended: true, account: attendedAccount }),
        {
          kind: "attended",
          identity: attendedAccount,
          detail: `token mint failed: ${redact(gcloud.error ?? "reauthentication required")}`,
        },
      ),
    );
  } else {
    items.push({
      credential: "gcloud",
      state: "ok",
      kind: "attended",
      identity: attendedAccount,
      detail: `attended managed account; unattended work needs ${identities.automationPrincipal} (${enroll({ attended: false })})`,
    });
  }

  // Application Default Credentials
  if (!wanted.has("adc")) {
    items.push(skipped("adc"));
  } else if (keyFile) {
    items.push(
      blocked(
        "adc",
        "key_file_forbidden",
        "unset GOOGLE_APPLICATION_CREDENTIALS; key files are banned and cannot be created for this project",
        { detail: "a key file is configured" },
      ),
    );
  } else {
    const adc = probe.adc ?? {};
    const adcPrincipal = lower(adc.principal);
    if (!adc.present || adc.errorKind === "missing") {
      items.push(
        blocked("adc", "adc_missing", stepForGoogle(), {
          detail: "no Application Default Credentials on this store",
        }),
      );
    } else if (adc.fresh === false) {
      items.push(
        blocked("adc", "adc_stale", stepForGoogle(), {
          detail: `ADC refresh failed: ${redact(adc.error ?? adc.errorKind ?? "reauthentication required")}`,
        }),
      );
    } else if (adcPrincipal && adcPrincipal === serviceAccount) {
      items.push({
        credential: "adc",
        state: "ok",
        kind: "unattended",
        identity: identities.automationServiceAccount,
        detail: "impersonated automation service account",
      });
    } else if (
      adcPrincipal &&
      isProjectServiceAccount(adcPrincipal, identities.project)
    ) {
      items.push(
        blocked("adc", "foreign_principal", enroll({ attended: false }), {
          identity: adc.principal,
          detail: `ADC principal is not the designated ${identities.automationServiceAccount}`,
        }),
      );
    } else if (adcPrincipal && isManagedAccount(adcPrincipal, domain)) {
      if (unattended) {
        items.push(
          blocked("adc", "attended_identity", enroll({ attended: false }), {
            kind: "attended",
            identity: adc.principal,
            detail:
              "ADC is a person's managed account; unattended work needs the impersonated automation identity",
          }),
        );
      } else {
        items.push({
          credential: "adc",
          state: "ok",
          kind: "attended",
          identity: adc.principal,
          detail: "attended managed account",
        });
      }
    } else if (!adcPrincipal) {
      if (unattended) {
        items.push(
          blocked("adc", "principal_unknown", enroll({ attended: false }), {
            detail: "ADC is fresh but its principal could not be read back",
          }),
        );
      } else {
        items.push({
          credential: "adc",
          state: "ok",
          kind: "attended",
          identity: "unresolved",
          detail:
            "ADC is fresh; principal could not be read back, verify it is a managed account",
        });
      }
    } else {
      items.push(
        blocked("adc", "personal_identity", stepForGoogle(), {
          identity: adc.principal,
          detail: `ADC principal is not @${domain}`,
        }),
      );
    }
  }

  // .env.local (presence only; values are never read back)
  if (!wanted.has("env")) {
    items.push(skipped("env"));
  } else {
    const env = probe.env ?? {};
    const missing = env.missingKeys ?? [];
    if (!env.present) {
      items.push(
        blocked(
          "env",
          "env_missing",
          "create .env.local from .env.example with the RentVine values (never commit it)",
          { identity: ".env.local", detail: "file is absent" },
        ),
      );
    } else if (missing.length > 0) {
      items.push(
        blocked("env", "env_incomplete", "add the missing keys to .env.local", {
          identity: ".env.local",
          detail: `missing ${missing.join(", ")}`,
        }),
      );
    } else {
      items.push({
        credential: "env",
        state: "ok",
        identity: ".env.local",
        detail: "RentVine keys present",
      });
    }
  }

  // GitHub CLI
  if (!wanted.has("gh")) {
    items.push(skipped("gh"));
  } else {
    const gh = probe.gh ?? {};
    if (gh.tokenEnv) {
      items.push({
        credential: "gh",
        state: "ok",
        identity: "GH_TOKEN",
        detail: "token in environment",
      });
    } else if (gh.available && gh.loggedIn) {
      items.push({
        credential: "gh",
        state: "ok",
        identity: gh.account ?? "gh login",
        detail: "GitHub CLI is logged in",
      });
    } else if (gh.available) {
      items.push(
        blocked("gh", "gh_logged_out", "gh auth login", {
          identity: "gh",
          detail: "GitHub CLI is not logged in",
        }),
      );
    } else {
      items.push(
        blocked("gh", "gh_unavailable", "install GitHub CLI (gh) or set GH_TOKEN", {
          identity: "gh",
          detail: "GitHub CLI is not available in this shell",
        }),
      );
    }
  }

  // Canary browser sessions (the silent re-sign-in is the repair; a Google prompt is a human step)
  if (!wanted.has("canary")) {
    items.push(skipped("canary"));
  } else {
    const sessions = probe.canary ?? [];
    if (sessions.length === 0) {
      items.push(
        blocked(
          "canary",
          "canary_profile_required",
          "pass --origins=<a>,<b> with --admin-profile=<path> and/or --editor-profile=<path> (and --admin-email/--editor-email when not the designated canaries)",
          { detail: "no canary profile named" },
        ),
      );
    }
    for (const session of sessions) {
      const where = `${session.label ?? "canary"} on ${session.origin}`;
      if (session.result === "signed_in") {
        items.push({
          credential: "canary",
          state: "ok",
          label: session.label,
          identity: session.email,
          detail: `${where}: signed in as ${session.role ?? "unknown role"} (google_session_reuse)`,
        });
      } else if (session.result === "human_required") {
        items.push(
          blocked("canary", "human_required", canaryEnrollCommand(session), {
            label: session.label,
            identity: session.email,
            detail: `${where}: Google needs a person at ${session.url ?? "the Google page"}${session.reason ? ` (${session.reason})` : ""}`,
          }),
        );
      } else {
        items.push(
          blocked(
            "canary",
            session.result === "error" ? "canary_error" : "canary_not_run",
            `fix the named condition, then re-run npm run auth:ensure -- --need=canary; if Google asked for a person: ${canaryEnrollCommand(session)}`,
            {
              label: session.label,
              identity: session.email,
              detail: `${where}: ${redact(session.error ?? "session not attempted")}`,
            },
          ),
        );
      }
    }
  }

  return { items, repairs };
}

/** 0 when everything requested is ok or repaired; 2 when anything is blocked or still repairable. */
export function exitCodeFor(items) {
  return items.some((item) => item.state === "blocked" || item.state === "repairable")
    ? 2
    : 0;
}

/** One line per credential: name, state, identity, detail, and the human step when blocked. */
export function formatStatus(items, { unattended = false, platform, wsl, store } = {}) {
  const context = [
    unattended ? "unattended" : "attended",
    platform ? `${platform}${wsl ? "/WSL" : ""}` : null,
    store?.store === "env" ? `store ${store.cloudsdkConfig}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const lines = [`== auth:ensure (${context}) ==`];
  for (const item of items) {
    lines.push(
      `${item.credential.padEnd(7)} ${item.state.padEnd(10)} ${String(item.identity ?? "").padEnd(52)} ${redact(item.detail ?? "")}`.trimEnd(),
    );
    if (item.state === "blocked" && item.humanStep) {
      lines.push(`        -> ${redact(item.humanStep)}`);
    }
  }
  lines.push(
    exitCodeFor(items) === 0
      ? "READY - every requested credential is usable without a person."
      : "NOT READY - run the step named above; nothing else is blocked by it.",
  );
  return lines;
}

/** A single-line summary for the session-start hook. */
export function summarize(items) {
  return items
    .filter((item) => item.state !== "skipped")
    .map((item) =>
      item.state === "blocked"
        ? `${item.credential} blocked (${item.humanStep})`
        : `${item.credential} ${item.state}${item.identity ? ` ${item.identity}` : ""}`,
    )
    .map((entry) => redact(entry))
    .join("; ");
}
