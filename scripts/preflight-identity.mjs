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

import { pathToFileURL } from "node:url";
import { probeGcloud, probeAdc } from "./auth/ensure.mjs";
import { LOCAL_PRINCIPAL } from "./auth/identities.mjs";

export const ALLOWED_DOMAIN = "pmikcmetro.com";
export function evaluateIdentity(state) {
  const errors = [];
  if (!state.gcloudAvailable) errors.push("gcloud CLI not found in WSL.");
  if (!state.gcloudAccount) errors.push("No active gcloud account.");
  else if (state.gcloudAccount !== LOCAL_PRINCIPAL)
    errors.push("Active gcloud account is not the authorized local managed account.");
  if (state.impersonation)
    errors.push("Unexpected impersonation; use local WSL enrollment.");
  if (state.googleAppCreds)
    errors.push("GOOGLE_APPLICATION_CREDENTIALS is set; key files are banned.");
  if (!state.adcPresent) errors.push("Application Default Credentials are missing.");
  else if (state.adcAccount !== LOCAL_PRINCIPAL)
    errors.push("ADC principal is not the verified local managed account.");
  if (state.adcFresh === false || state.gcloudFresh === false)
    errors.push("Credential refresh failed; run npm run auth:session.");
  return { ok: errors.length === 0, errors, warnings: [] };
}

export function buildIdentityChecklist(state) {
  const mark = (ok) => (ok === true ? "ok" : ok === false ? "FAIL" : "verify manually");
  const localOk = evaluateIdentity(state).ok;
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
      status: mark(localOk),
      detail: `gcloud=${state.gcloudAccount ?? "none"}${
        state.impersonation ? ` impersonating ${state.impersonation}` : ""
      }; adc=${
        state.adcPresent ? (state.adcAccount ?? "present") : "missing"
      }; GOOGLE_APPLICATION_CREDENTIALS=${state.googleAppCreds ? "configured (forbidden)" : "unset"}`,
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
  const cli = probeGcloud(env);
  const adc = await probeAdc(env);
  return {
    gcloudAvailable: cli.available,
    gcloudAccount: cli.activeAccount,
    impersonation: cli.impersonation,
    gcloudFresh: cli.tokenFresh,
    adcPresent: adc.present,
    adcAccount: adc.principal,
    adcFresh: adc.fresh,
    googleAppCreds: Boolean(env.GOOGLE_APPLICATION_CREDENTIALS),
  };
}
export async function main(argv = process.argv.slice(2), env = process.env) {
  const state = await gatherIdentity({ env });
  const result = evaluateIdentity(state);
  const checklist = buildIdentityChecklist(state);
  if (argv.includes("--json"))
    console.log(JSON.stringify({ ...result, checklist, state }));
  else {
    for (const row of checklist)
      console.log(`[${row.status}] ${row.system}: ${row.detail}`);
    console.log(
      result.ok
        ? "Local identity preflight passed."
        : "NOT READY: run npm run auth:session in WSL.",
    );
  }
  process.exitCode = result.ok ? 0 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Local identity inspection failed; run npm run auth:status.");
    process.exitCode = 2;
  });
}
