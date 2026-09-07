// S112 — the designated identities for unattended work. Non-secret configuration only: names,
// never credentials. The owner creates these once (docs/feature-suites/unattended-authentication.md,
// Appendix B); the runner reads and reports them and never edits their IAM, claims, or policy.

export const MANAGED_DOMAIN = "pmikcmetro.com";
export const PROJECT = "pmi-kc-kb-prod";

/** The Cloud Identity user the unattended loop signs gcloud/ADC in as, once enrolled. */
export const AUTOMATION_PRINCIPAL = "pmi-runner@pmikcmetro.com";

/** The least-privilege service account every unattended cloud call impersonates. */
export const AUTOMATION_SERVICE_ACCOUNT =
  "pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com";

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

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Resolve the identity set, allowing a non-secret environment override per name. */
export function resolveIdentities(env = process.env) {
  return Object.freeze({
    managedDomain: readString(env.PMI_AUTH_MANAGED_DOMAIN) ?? MANAGED_DOMAIN,
    project: readString(env.PMI_AUTH_PROJECT) ?? PROJECT,
    automationPrincipal:
      readString(env.PMI_AUTH_AUTOMATION_PRINCIPAL) ?? AUTOMATION_PRINCIPAL,
    automationServiceAccount:
      readString(env.PMI_AUTH_AUTOMATION_SERVICE_ACCOUNT) ?? AUTOMATION_SERVICE_ACCOUNT,
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
