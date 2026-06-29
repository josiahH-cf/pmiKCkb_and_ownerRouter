import type { ActionTargetSystem } from "@/lib/firestore/types";

/**
 * Per-system connection health-check contracts. These are deterministic metadata
 * descriptions of what a health check must verify before any external action could be
 * considered for execution. This module performs no I/O: `runHealthCheck` only works
 * through an injected transport, so production code cannot accidentally make a live call
 * from here. The contracts mirror the verified auth/event model in
 * docs/integration-architecture.md and docs/research/integration-capability-2026-06.md.
 */

export type HealthCheckStepKind =
  | "config_presence"
  | "auth_validation"
  | "endpoint_probe"
  | "rate_limit_read";

export interface HealthCheckStep {
  id: string;
  kind: HealthCheckStepKind;
  description: string;
  expected_evidence: string;
}

export interface HealthCheckContract {
  id: string;
  system: ActionTargetSystem;
  label: string;
  steps: HealthCheckStep[];
}

export const HEALTH_CHECK_CONTRACTS: readonly HealthCheckContract[] = [
  {
    id: "health.rentvine.api_key",
    system: "Rentvine",
    label: "Rentvine API key health",
    steps: [
      {
        id: "rentvine.config",
        kind: "config_presence",
        description: "Rentvine API key is configured outside the repository.",
        expected_evidence:
          "Key reference present in approved secret storage; never in git.",
      },
      {
        id: "rentvine.auth",
        kind: "auth_validation",
        description: "API key authenticates with the work-order role.",
        expected_evidence: "Authenticated response from a read-only endpoint.",
      },
      {
        id: "rentvine.probe",
        kind: "endpoint_probe",
        description: "Work-order list endpoint answers a read-only probe.",
        expected_evidence:
          "Successful list/view response; no webhooks exist, polling only.",
      },
      {
        id: "rentvine.rate_limit",
        kind: "rate_limit_read",
        description: "Rate-limit posture is read from response headers.",
        expected_evidence: "Documented or observed rate-limit headers recorded.",
      },
    ],
  },
  {
    id: "health.leadsimple.rest_api",
    system: "LeadSimple",
    label: "LeadSimple REST API health",
    steps: [
      {
        id: "leadsimple.config",
        kind: "config_presence",
        description: "Admin-enabled REST API key is configured outside the repository.",
        expected_evidence: "Key reference present; LeadSimple Operations plan confirmed.",
      },
      {
        id: "leadsimple.auth",
        kind: "auth_validation",
        description: "API key authenticates against the REST API.",
        expected_evidence:
          "Authenticated read response; endpoint coverage is vendor-confirmation-required.",
      },
      {
        id: "leadsimple.probe",
        kind: "endpoint_probe",
        description: "A read-only process/list endpoint answers a probe.",
        expected_evidence:
          "Successful read; direct Rentvine sync status visible in account.",
      },
    ],
  },
  {
    id: "health.dotloop.oauth_app",
    system: "Dotloop",
    label: "Dotloop OAuth app health",
    steps: [
      {
        id: "dotloop.config",
        kind: "config_presence",
        description: "Approved Dotloop OAuth2 application credentials are configured.",
        expected_evidence: "Client credentials referenced from approved secret storage.",
      },
      {
        id: "dotloop.auth",
        kind: "auth_validation",
        description: "OAuth2 token is valid for the connected profile.",
        expected_evidence: "Token introspection or profile read succeeds.",
      },
      {
        id: "dotloop.probe",
        kind: "endpoint_probe",
        description: "Profile read endpoint answers a read-only probe.",
        expected_evidence: "Successful profile response.",
      },
      {
        id: "dotloop.webhooks",
        kind: "endpoint_probe",
        description: "Webhook subscriptions are readable.",
        expected_evidence:
          "Subscription list response (Dotloop documents webhooks + replay).",
      },
    ],
  },
  {
    id: "health.quickbooks.oauth_app",
    system: "QuickBooks",
    label: "QuickBooks Online OAuth app health",
    steps: [
      {
        id: "quickbooks.config",
        kind: "config_presence",
        description: "QuickBooks Online OAuth2 app credentials are configured.",
        expected_evidence: "Client credentials referenced from approved secret storage.",
      },
      {
        id: "quickbooks.auth",
        kind: "auth_validation",
        description: "OAuth2 token carries the accounting scope.",
        expected_evidence:
          "Token refresh succeeds with com.intuit.quickbooks.accounting.",
      },
      {
        id: "quickbooks.probe",
        kind: "endpoint_probe",
        description: "CompanyInfo endpoint answers a read-only probe.",
        expected_evidence: "Successful CompanyInfo response.",
      },
      {
        id: "quickbooks.rate_limit",
        kind: "rate_limit_read",
        description: "Documented throttling posture is recorded.",
        expected_evidence: "Rate-limit/throttling headers or documented limits recorded.",
      },
    ],
  },
  {
    id: "health.boom.partner_api",
    system: "Boom",
    label: "Boom partner API health",
    steps: [
      {
        id: "boom.config",
        kind: "config_presence",
        description: "Boom partner API credentials are configured.",
        expected_evidence:
          "Vendor-packet-dependent: endpoint contract is request-only until Boom provides the API packet.",
      },
      {
        id: "boom.auth",
        kind: "auth_validation",
        description: "Partner credentials authenticate.",
        expected_evidence:
          "Vendor-packet-dependent: exact auth model awaits the Boom vendor packet.",
      },
    ],
  },
  {
    id: "health.google_sheets.api",
    system: "Google Sheets",
    label: "Google Sheets API health",
    steps: [
      {
        id: "google_sheets.config",
        kind: "config_presence",
        description: "The approved control-sheet id is configured.",
        expected_evidence:
          "Sheet id recorded for the approved exception/control sheet only.",
      },
      {
        id: "google_sheets.auth",
        kind: "auth_validation",
        description: "Sheets API credentials authenticate.",
        expected_evidence: "Authenticated values read on the approved sheet.",
      },
      {
        id: "google_sheets.probe",
        kind: "endpoint_probe",
        description: "A values read on the approved sheet answers a probe.",
        expected_evidence:
          "Successful read; Sheets stays an exception surface, not truth.",
      },
    ],
  },
  {
    id: "health.gmail.workspace_api",
    system: "Gmail",
    label: "Gmail Workspace API health",
    steps: [
      {
        id: "gmail.config",
        kind: "config_presence",
        description:
          "A client-approved Gmail access model is configured for Dan's mailbox.",
        expected_evidence:
          "Expected to fail today: no client-approved access model exists yet (docs/products/gmail-inbox-zero.md).",
      },
      {
        id: "gmail.auth",
        kind: "auth_validation",
        description:
          "Credentials carry only the Gmail read-only and label-management scopes for triage.",
        expected_evidence:
          "Granted scopes exclude any send capability; draft work adds gmail.compose only.",
      },
      {
        id: "gmail.probe",
        kind: "endpoint_probe",
        description: "labels.list answers a read-only probe.",
        expected_evidence: "Successful label list response.",
      },
    ],
  },
  {
    id: "health.google_drive.dwd",
    system: "Google Drive",
    label: "Google Drive domain-wide-delegation health",
    steps: [
      {
        id: "google_drive.config",
        kind: "config_presence",
        description: "The DWD service account, subject, and maintenance folder id are configured.",
        expected_evidence:
          "SHEETS_IMPERSONATE_SA + SHEETS_DWD_SUBJECT present; SPACE_DRIVE_FOLDER_IDS includes the maintenance folder.",
      },
      {
        id: "google_drive.auth",
        kind: "auth_validation",
        description:
          "Keyless DWD mints a Drive-scoped token acting AS the pmikcmetro.com subject.",
        expected_evidence:
          "Expected to fail until the Drive scope is authorized for the SA in Admin console → Domain-wide delegation (live attempt returned unauthorized_client).",
      },
      {
        id: "google_drive.probe",
        kind: "endpoint_probe",
        description: "A files.list probe answers as the subject user.",
        expected_evidence:
          "Successful Drive v3 files.list response; the app touches only files it creates (drive.file).",
      },
    ],
  },
];

export function getHealthCheckContract(id: string): HealthCheckContract | undefined {
  return HEALTH_CHECK_CONTRACTS.find((contract) => contract.id === id);
}

export interface HealthCheckProbeResult {
  ok: boolean;
  detail?: string;
}

export interface HealthCheckTransport {
  probe(
    contract: HealthCheckContract,
    step: HealthCheckStep,
  ): Promise<HealthCheckProbeResult>;
}

export interface HealthCheckStepResult extends HealthCheckProbeResult {
  step_id: string;
  kind: HealthCheckStepKind;
}

export interface HealthCheckRunResult {
  contract_id: string;
  system: ActionTargetSystem;
  ok: boolean;
  steps: HealthCheckStepResult[];
}

/**
 * Run a health-check contract through an injected transport. There is intentionally no
 * default transport: this module never performs live network calls, so callers must
 * provide one (tests inject mocks; a future approved live runner would inject its own).
 * Steps run in order; after the first failure the remaining steps are recorded as not
 * attempted so the result shape stays deterministic.
 */
export async function runHealthCheck(
  contract: HealthCheckContract,
  transport: HealthCheckTransport,
): Promise<HealthCheckRunResult> {
  if (typeof transport?.probe !== "function") {
    throw new Error(
      "runHealthCheck requires an injected transport; this module never performs live network calls.",
    );
  }

  const steps: HealthCheckStepResult[] = [];
  let failed = false;

  for (const step of contract.steps) {
    if (failed) {
      steps.push({
        step_id: step.id,
        kind: step.kind,
        ok: false,
        detail: "not attempted",
      });
      continue;
    }

    const result = await transport.probe(contract, step);
    steps.push({
      step_id: step.id,
      kind: step.kind,
      ok: result.ok,
      detail: result.detail,
    });

    if (!result.ok) {
      failed = true;
    }
  }

  return {
    contract_id: contract.id,
    system: contract.system,
    ok: !failed && steps.length === contract.steps.length,
    steps,
  };
}
