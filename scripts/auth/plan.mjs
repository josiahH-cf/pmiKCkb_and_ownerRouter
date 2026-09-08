// S112 — the pure decision core behind `npm run auth:ensure`. Given a probe of the local credential
// state, decide per credential whether it is ok, repairable without a browser, or blocked on exactly
// one human step. No I/O here, so every branch is unit-testable and the runner's behavior is the
// planner's behavior. Nothing in this module ever sees a token; `redact` guards the text that does.

import { isManagedAccount, LOCAL_PRINCIPAL } from "./identities.mjs";

export const CREDENTIALS = Object.freeze(["gcloud", "adc", "env", "gh", "canary"]);
export const DEFAULT_NEED = Object.freeze(["gcloud", "adc", "env", "gh"]);
export const STATES = Object.freeze([
  "ok",
  "repaired",
  "repairable",
  "blocked",
  "skipped",
  "unverified",
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

/** Both familiar commands enroll the WSL store. No arbitrary identity interpolation. */
export function enrollCommand() {
  return `npm run auth:enroll:wsl -- --attended --account=${LOCAL_PRINCIPAL}`;
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
  const principal = lower(identities.localPrincipal);
  const domain = identities.managedDomain;
  const kind = unattended ? "unattended" : "attended";
  const step = enrollCommand();
  for (const credential of ["gcloud", "adc"]) {
    if (!wanted.has(credential)) {
      items.push(skipped(credential));
      continue;
    }
    const value = probe[credential] ?? {};
    const identity = lower(
      credential === "gcloud" ? value.activeAccount : value.principal,
    );
    let code, detail;
    if (keyFile) {
      code = "key_file_forbidden";
      detail = "GOOGLE_APPLICATION_CREDENTIALS is forbidden; unset it before enrollment";
    } else if (value.errorKind === "wrong_store" || probe.wrongStore) {
      code = "wrong_store";
      detail =
        "CLI and ADC must use this WSL user's default credential store; unset CLOUDSDK_CONFIG";
    } else if (probe.platform === "win32") {
      code = "wrong_store";
      detail =
        "Run authentication in WSL; the Windows credential store is not used by the app";
    } else if (credential === "gcloud" && !value.available) {
      code = "gcloud_unavailable";
      detail = "gcloud is not on the WSL PATH";
    } else if (credential === "adc" && !value.present) {
      code = "adc_missing";
      detail = "Application Default Credentials are missing from the WSL store";
    } else if (value.errorKind === "credential_type_forbidden") {
      code = "credential_type_forbidden";
      detail =
        "Local ADC must be an enrolled authorized user; key files and impersonation are refused";
    } else if (!identity) {
      code = "principal_unknown";
      detail =
        "Credential identity is unverified; fresh owner enrollment is required before a token probe";
    } else if (identity !== principal) {
      code = isManagedAccount(identity, domain)
        ? "unexpected_identity"
        : "personal_identity";
      detail = "Credential does not belong to the specifically authorized local account";
    } else if (credential === "gcloud" && value.impersonation) {
      code = "unexpected_impersonation";
      detail = "Local account enrollment requires no impersonation";
    }
    if (code) {
      items.push(blocked(credential, code, step, { identity, kind, detail }));
      continue;
    }
    const fresh = credential === "gcloud" ? value.tokenFresh : value.fresh;
    if (fresh === false && value.errorKind === "identity_probe_unavailable") {
      items.push(
        blocked(
          credential,
          "identity_probe_unavailable",
          "npm run auth:ensure -- --unattended",
          {
            identity,
            kind,
            detail:
              "Google identity lookup did not complete; readiness is unverified. Retry the preflight",
          },
        ),
      );
    } else if (fresh === false) {
      items.push(
        blocked(credential, credential === "gcloud" ? "stale_token" : "adc_stale", step, {
          identity,
          kind,
          detail: `Refresh failed (${value.errorKind ?? "reauthentication required"}); independent local work can continue`,
        }),
      );
    } else {
      items.push({
        credential,
        identity,
        kind,
        state: fresh === true ? "ok" : "unverified",
        detail:
          fresh === true
            ? "authorized local account; token refresh verified"
            : "identity inspected; token freshness not attempted",
      });
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
    if (gh.tokenEnv && gh.loggedIn) {
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
          detail: `${where}: signed in as ${session.role ?? "unknown role"} (${session.method ?? "unreported"})`,
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
  return items.some(
    (item) =>
      item.state === "blocked" ||
      item.state === "repairable" ||
      item.state === "unverified",
  )
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
  const shownSteps = new Set();
  for (const item of items) {
    lines.push(
      `${item.credential.padEnd(7)} ${item.state.padEnd(10)} ${String(item.identity ?? "").padEnd(52)} ${redact(item.detail ?? "")}`.trimEnd(),
    );
    if (item.state === "blocked" && item.humanStep && !shownSteps.has(item.humanStep)) {
      shownSteps.add(item.humanStep);
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
