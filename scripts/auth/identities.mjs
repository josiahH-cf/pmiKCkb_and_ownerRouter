// S112: exact identity approved for local WSL development and release on 2026-09-08.
export const MANAGED_DOMAIN = "pmikcmetro.com";
export const PROJECT = "pmi-kc-kb-prod";
export const LOCAL_PRINCIPAL = "josiah@pmikcmetro.com";

/** Verification identities: signed in by the assurance harness, never actors of a product effect. */
export const CANARIES = Object.freeze({
  admin: Object.freeze({
    label: "admin",
    email: "canary-admin@pmikcmetro.com",
    expectedRole: "Admin",
  }),
  editor: Object.freeze({
    label: "editor",
    email: "canary-editor@pmikcmetro.com",
    expectedRole: "Editor",
  }),
});

/** `.env.local` keys the live RentVine reads need; values are never read back or printed. */
export const REQUIRED_ENV_KEYS = Object.freeze([
  "RENTVINE_API_KEY",
  "RENTVINE_API_SECRET",
  "RENTVINE_API_BASE_URL",
]);

/** Environment variables cannot widen the recorded local identity policy. */
export function resolveIdentities() {
  return Object.freeze({
    managedDomain: MANAGED_DOMAIN,
    project: PROJECT,
    localPrincipal: LOCAL_PRINCIPAL,
    canaries: CANARIES,
    requiredEnvKeys: REQUIRED_ENV_KEYS,
  });
}

export function isManagedAccount(value, domain = MANAGED_DOMAIN) {
  return new RegExp(`^[a-z0-9][a-z0-9._%+-]{0,63}@${escapeRegExp(domain)}$`, "i").test(
    String(value ?? "").trim(),
  );
}

export function isProjectServiceAccount(value, project = PROJECT) {
  return new RegExp(
    `^[a-z][a-z0-9-]{0,62}@${escapeRegExp(project)}\\.iam\\.gserviceaccount\\.com$`,
    "i",
  ).test(String(value ?? "").trim());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
