// End-to-end proof of the LIVE renewal-notice draft path: a real renewal run's data → recipient
// resolution → the governed executor → a REAL unsent Gmail draft in the operator's Drafts folder.
//
//   npm run smoke:renewal-draft-live                 # DRY: governed synthetic chain; no credentials
//   npm run smoke:renewal-draft-live -- --live       # LIVE: bounded RentVine read + one real,
//                                                    # self-addressed UNSENT Gmail draft
//
// SAFETY: live mode preflights the renewal-draft runtime action before it loads live configuration,
// then repeats that check immediately before each provider/token boundary. Dry mode uses an explicit
// diagnostic-only suspension reader and fake Gmail client; it never falls back to a clear production
// reader, ADC, credentials, or network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DRAFT_BANNER } from "../lib/constants";
import type {
  ExternalActionInput,
  ExternalActionReceipt,
} from "../lib/external-execution/types";
import { GmailRuntimeClient } from "../lib/gmail-runtime/client";
import { mintGmailDwdToken } from "../lib/gmail-runtime/dwd-token";
import { GMAIL_COMPOSE_SCOPE } from "../lib/gmail-runtime/scopes";
import {
  RentVineClient,
  assertRentVineAccount,
  createFetchTransport,
  rentVineAccountCode,
  type RawLease,
} from "../lib/integrations/rentvine/client";
import {
  enrichLeaseViewsWithDetail,
  type LeaseDetailReader,
} from "../lib/integrations/rentvine/lease-detail-enrichment";
import { leaseViewsFromExport } from "../lib/integrations/rentvine/lease-mapper";
import {
  LeaseGmailExecutor,
  type WorkflowMessageProvider,
} from "../lib/lease-renewal/execution/providers";
import {
  buildRenewalNoticeDraftAction,
  executeRenewalNoticeDraft,
  RENEWAL_NOTICE_DRAFT_ACTION_KEY,
} from "../lib/lease-renewal/execution/renewal-draft-request";
import {
  LiveRenewalGmailDraftProvider,
  type RenewalDraftGmailClient,
} from "../lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  resolveRenewalRecipient,
  type RenewalRecipientChannel,
} from "../lib/lease-renewal/recipient-resolution";
import {
  assertProductionRuntimeActionExecutable,
  runRuntimeGatedAction,
  type RuntimeSuspensionReader,
} from "../lib/operations/runtime-suspension-gate";
import { RUNTIME_SUSPENSION_CLEAR } from "../lib/operations/runtime-suspension";

const EXPECTED_ACCOUNT = "pmikcmetro";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

interface SmokeLogger {
  log(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

export interface RenewalDraftSmokeDependencies {
  /**
   * Production supplies the Firestore-bound, seed-preserving assertion. Tests may inject the pure
   * wrapper with an explicit reader; there is deliberately no default-clear live assertion.
   */
  assertRuntimeExecutable(actionKey: string): Promise<void>;
  /** Used only by the non-live synthetic chain. */
  diagnosticRuntimeSuspensionReader: RuntimeSuspensionReader;
  loadEnvLocal(): Record<string, string>;
  createRentVineClient(config: {
    baseUrl: string;
    apiKey: string;
    apiSecret: string;
  }): Pick<RentVineClient, "listAllLeasesExport">;
  mintGmailToken(input: {
    subject: string;
    scope: string;
    serviceAccount: string;
  }): Promise<string>;
  createGmailClient(input: { subject: string; token: string }): RenewalDraftGmailClient;
  createDiagnosticGmailClient(input: {
    subject: string;
    recordDraft(draft: { to: string; subject: string; body: string }): void;
  }): RenewalDraftGmailClient;
  createDiagnosticProvider(client: RenewalDraftGmailClient): WorkflowMessageProvider;
  executeRenewalDraft(
    createClient: () => RenewalDraftGmailClient,
    action: ExternalActionInput,
    options: { allowNonAuthoritativeRecipient: true },
  ): Promise<ExternalActionReceipt>;
  fetch: typeof fetch;
  logger: SmokeLogger;
}

function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      out[trimmed.slice(0, separator).trim()] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const DIAGNOSTIC_CLEAR_READER: RuntimeSuspensionReader = async () =>
  RUNTIME_SUSPENSION_CLEAR;

const PRODUCTION_DEPENDENCIES: RenewalDraftSmokeDependencies = {
  assertRuntimeExecutable: assertProductionRuntimeActionExecutable,
  // Explicitly diagnostic-only. Live mode never reads this dependency.
  diagnosticRuntimeSuspensionReader: DIAGNOSTIC_CLEAR_READER,
  loadEnvLocal,
  createRentVineClient: (config) => new RentVineClient(config, createFetchTransport()),
  mintGmailToken: mintGmailDwdToken,
  createGmailClient: ({ subject, token }) =>
    new GmailRuntimeClient({ subject, getToken: async () => token }),
  createDiagnosticGmailClient: ({ subject, recordDraft }) => ({
    subject,
    createDraft: async (input) => {
      recordDraft(input);
      return { draftId: "dry-draft-1" };
    },
  }),
  createDiagnosticProvider: (client) => new LiveRenewalGmailDraftProvider(client),
  executeRenewalDraft: executeRenewalNoticeDraft,
  fetch,
  logger: console,
};

function readArg(argv: readonly string[], name: string): string | undefined {
  const argument = argv.find((entry) => entry.startsWith(`${name}=`));
  return argument ? argument.slice(name.length + 1) : undefined;
}

function hasArg(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

/** Report recipient-resolution COVERAGE across the read — counts only, never an address. */
function coverage(leases: RawLease[]) {
  const channels: RenewalRecipientChannel[] = ["tenant", "owner"];
  const result: Record<string, { resolved: number; needsVerification: number }> = {};
  for (const channel of channels) {
    let resolved = 0;
    let needsVerification = 0;
    for (const lease of leases) {
      if (resolveRenewalRecipient({ lease, channel }).verified) resolved += 1;
      else needsVerification += 1;
    }
    result[channel] = { resolved, needsVerification };
  }
  return result;
}

async function executeDiagnosticRenewalDraft(
  action: ExternalActionInput,
  dependencies: RenewalDraftSmokeDependencies,
  recordDraft: (draft: { to: string; subject: string; body: string }) => void,
  readSuspension: RuntimeSuspensionReader,
): Promise<ExternalActionReceipt> {
  return runRuntimeGatedAction(action.actionKey, readSuspension, () => {
    const client = dependencies.createDiagnosticGmailClient({
      subject: "workflow@pmikcmetro.com",
      recordDraft,
    });
    const executor = new LeaseGmailExecutor(
      dependencies.createDiagnosticProvider(client),
    );
    return executor.execute(action);
  });
}

async function runDry(dependencies: RenewalDraftSmokeDependencies): Promise<void> {
  const lease: RawLease = {
    leaseID: "dry-lease-1",
    tenants: [{ name: "Dry Run Tenant", email: "dry-run-tenant@example.invalid" }],
  };
  const mailbox = "workflow@pmikcmetro.com";
  const resolution = resolveRenewalRecipient({ lease, channel: "tenant" });
  if (!resolution.verified || !resolution.to || !resolution.recipientSourceRef) {
    throw new Error("Dry synthetic lease failed to resolve a recipient (unexpected).");
  }

  const created: { to: string; subject: string; body: string }[] = [];
  const action = buildRenewalNoticeDraftAction({
    workflowId: "smoke-renewal-draft-dry",
    actionId: "dry-1",
    channel: "tenant",
    templateRef: "tenant-renewal:v1.0",
    copy: {
      templateContentHash: "a".repeat(64),
      envelopeFingerprint: "b".repeat(64),
    },
    recipient: {
      channel: "tenant",
      to: resolution.to,
      sourceRef: resolution.recipientSourceRef,
    },
    mailbox: { email: mailbox, sourceRef: "smoke:operator-mailbox" },
    subject: "Your lease renewal (dry)",
    body: "Synthetic renewal notice body for the dry-run proof.",
    workflowContext: "smoke:renewal-draft-dry",
    sourceRefs: ["smoke:renewal-draft-dry"],
  });

  const receipt = await executeDiagnosticRenewalDraft(
    action,
    dependencies,
    (draft) => created.push(draft),
    dependencies.diagnosticRuntimeSuspensionReader,
  );

  dependencies.logger.log(
    "Renewal draft path (DRY) — full governed chain with a FAKE Gmail client:",
  );
  dependencies.logger.log(
    JSON.stringify(
      {
        recipientResolution: resolution,
        draftBannerApplied: String(action.values.body).startsWith(`${DRAFT_BANNER}\n\n`),
        diagnosticGatePassed: true,
        fakeClientCreateDraftCalls: created.length,
        createdDraft: created[0],
        receipt: { providerRef: receipt.providerRef, outcome: receipt.outcome },
      },
      null,
      2,
    ),
  );
  dependencies.logger.log(
    "PASS (DRY): synthetic resolution → explicit diagnostic gate → fake draft provider. No ADC, credentials, or network.",
  );
}

async function runLive(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  dependencies: RenewalDraftSmokeDependencies,
): Promise<void> {
  // Preflight the complete effect set before even loading live configuration. An exact action stop,
  // global stop, or unreadable store therefore yields zero provider, token, or network activity.
  await dependencies.assertRuntimeExecutable(RENEWAL_NOTICE_DRAFT_ACTION_KEY);

  const localEnv = dependencies.loadEnvLocal();
  const get = (name: string): string | undefined =>
    env[name]?.trim() || localEnv[name]?.trim() || undefined;

  const baseUrl = get("RENTVINE_API_BASE_URL");
  const apiKey = get("RENTVINE_API_KEY");
  const apiSecret = get("RENTVINE_API_SECRET");
  const subject =
    readArg(argv, "--subject") ?? get("SHEETS_DWD_SUBJECT") ?? "josiah@pmikcmetro.com";
  const serviceAccount =
    readArg(argv, "--sa") ?? get("GMAIL_DWD_SA") ?? get("SHEETS_IMPERSONATE_SA");
  const draftTo = readArg(argv, "--to") ?? subject;
  const limit = Number(readArg(argv, "--limit") ?? "25");
  const keep = hasArg(argv, "--keep");

  if (!baseUrl || !apiKey || !apiSecret) {
    throw new Error(
      "Missing RentVine config. Need RENTVINE_API_BASE_URL/KEY/SECRET in .env.local.",
    );
  }
  if (!serviceAccount) {
    throw new Error(
      "No service account for Gmail DWD. Set GMAIL_DWD_SA (or SHEETS_IMPERSONATE_SA), or pass --sa=.",
    );
  }
  assertRentVineAccount(baseUrl, EXPECTED_ACCOUNT);
  if (draftTo !== subject) {
    dependencies.logger.warn(
      `WARNING: --to overrides the safe self-addressed default. The draft will be addressed to ${draftTo}. It is still UNSENT; delete it if unintended.`,
    );
  }

  // Repeat immediately before construction so a stop raised during validation still wins.
  await dependencies.assertRuntimeExecutable(RENEWAL_NOTICE_DRAFT_ACTION_KEY);
  const rentvineClient = dependencies.createRentVineClient({
    baseUrl,
    apiKey,
    apiSecret,
  });
  // S57: complete paged read — the bare export call read only the 25-row default page, which would
  // miss any lease outside it (including the whole test cohort).
  const rows = (await rentvineClient.listAllLeasesExport()).rows;
  const leases = leaseViewsFromExport(rows).slice(0, Number.isFinite(limit) ? limit : 25);
  // S102: base rent comes from the documented lease detail for the bounded sample only.
  await enrichLeaseViewsWithDetail(
    leases,
    "getLease" in rentvineClient
      ? (rentvineClient as unknown as LeaseDetailReader)
      : undefined,
  );
  dependencies.logger.log(
    `RentVine account ${rentVineAccountCode(baseUrl)}: scanned ${leases.length} lease view(s) for recipient resolution.`,
  );
  dependencies.logger.log("Recipient-resolution coverage (counts only, no PII):");
  dependencies.logger.log(JSON.stringify(coverage(leases), null, 2));

  await dependencies.assertRuntimeExecutable(RENEWAL_NOTICE_DRAFT_ACTION_KEY);
  const token = await dependencies.mintGmailToken({
    subject,
    scope: GMAIL_COMPOSE_SCOPE,
    serviceAccount,
  });
  const action = buildRenewalNoticeDraftAction({
    workflowId: "smoke-renewal-draft-live",
    actionId: "smoke-1",
    channel: "tenant",
    templateRef: "tenant-renewal:v1.0",
    copy: {
      templateContentHash: "a".repeat(64),
      envelopeFingerprint: "b".repeat(64),
    },
    recipient: {
      channel: "tenant",
      to: draftTo,
      sourceRef: "smoke:self-addressed-diagnostic",
    },
    mailbox: { email: subject, sourceRef: "smoke:operator-mailbox" },
    subject: "[smoke] Renewal draft path verification (safe to delete)",
    body: "This is a self-addressed diagnostic UNSENT draft proving the live renewal draft path. Nothing was sent. Safe to delete.",
    workflowContext: "smoke:renewal-draft-live",
    sourceRefs: ["smoke:renewal-draft-live"],
  });
  // Keep construction lazy: the production executor repeats the fresh runtime gate first, so a stop
  // raised while the token was being minted still yields zero Gmail client/provider construction.
  const receipt = await dependencies.executeRenewalDraft(
    () => dependencies.createGmailClient({ subject, token }),
    action,
    {
      allowNonAuthoritativeRecipient: true,
    },
  );
  const draftId = receipt.providerRef;
  dependencies.logger.log(
    `Created UNSENT diagnostic draft ${draftId} in ${subject}'s mailbox (addressed to ${draftTo}). Nothing was sent.`,
  );

  if (keep) {
    dependencies.logger.log(
      "--keep set: leaving the draft in place (delete it from Gmail Drafts when done).",
    );
  } else {
    // Compensating cleanup of the draft created by this attempt stays available after a stop.
    const response = await dependencies.fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(subject)}/drafts/${encodeURIComponent(draftId)}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
    );
    dependencies.logger.log(
      response.ok
        ? `Cleaned up: deleted the diagnostic draft (HTTP ${response.status}).`
        : `Note: could not delete the diagnostic draft (HTTP ${response.status}); delete it manually from Gmail Drafts.`,
    );
  }
  dependencies.logger.log(
    "PASS (LIVE): a bounded RentVine read and the governed executor created one real UNSENT draft.",
  );
}

export async function runRenewalDraftSmoke(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RenewalDraftSmokeDependencies = PRODUCTION_DEPENDENCIES,
): Promise<void> {
  if (hasArg(argv, "--live")) {
    await runLive(argv, env, dependencies);
  } else {
    await runDry(dependencies);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runRenewalDraftSmoke().catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  });
}
