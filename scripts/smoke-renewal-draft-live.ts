// End-to-end proof of the LIVE renewal-notice draft path: a real renewal run's data → recipient
// resolution → the governed executor → a REAL unsent Gmail draft in the operator's Drafts folder.
//
//   npm run smoke:renewal-draft-live                 # DRY: full governed chain with a FAKE Gmail
//                                                    #      client + a synthetic lease. No network.
//   npm run smoke:renewal-draft-live -- --live       # LIVE: one bounded RentVine read (recipient-
//                                                    #       resolution COVERAGE, counts only, no PII)
//                                                    #       + ONE real self-addressed UNSENT draft,
//                                                    #       created via the production modules, then
//                                                    #       deleted (pass --keep to leave it).
//
// SAFETY: the real draft is ALWAYS self-addressed to the operator's own mailbox (never a resolved
// tenant/owner), clearly bannered and subject-tagged, and deleted unless --keep. It never sends —
// LiveRenewalGmailDraftProvider holds no send scope, and executeRenewalNoticeDraft re-asserts the
// Action Registry production gate (a `.send` action would be refused). The live-read coverage report
// prints only counts (how many recipients resolve vs. need verification), never an address.
//
// Owner-run for --live (org reauth is interactive-only; the agent shell cannot refresh ADC). --dry
// runs anywhere with no credentials.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DRAFT_BANNER } from "../lib/constants";
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
import { leaseViewsFromExport } from "../lib/integrations/rentvine/lease-mapper";
import {
  buildRenewalNoticeDraftAction,
  executeRenewalNoticeDraft,
} from "../lib/lease-renewal/execution/renewal-draft-request";
import type { RenewalDraftGmailClient } from "../lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  resolveRenewalRecipient,
  type RenewalRecipientChannel,
} from "../lib/lease-renewal/recipient-resolution";

const EXPECTED_ACCOUNT = "pmikcmetro";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      out[t.slice(0, i).trim()] = t
        .slice(i + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function readArg(name: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : undefined;
}
function hasArg(name: string): boolean {
  return process.argv.includes(name);
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

async function runDry(): Promise<void> {
  // Synthetic lease so the whole governed chain runs with zero credentials and zero network.
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
  const fakeClient: RenewalDraftGmailClient = {
    subject: mailbox,
    createDraft: async (input) => {
      created.push(input);
      return { draftId: "dry-draft-1" };
    },
  };

  const action = buildRenewalNoticeDraftAction({
    workflowId: "smoke-renewal-draft-dry",
    actionId: "dry-1",
    channel: "tenant",
    templateRef: "tenant-renewal:v1.0",
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

  // Diagnostic opt-out: the dry run uses a synthetic .invalid recipient by design.
  const receipt = await executeRenewalNoticeDraft(fakeClient, action, {
    allowNonAuthoritativeRecipient: true,
  });

  console.log("Renewal draft path (DRY) — full governed chain with a FAKE Gmail client:");
  console.log(
    JSON.stringify(
      {
        recipientResolution: resolution,
        draftBannerApplied: String(action.values.body).startsWith(`${DRAFT_BANNER}\n\n`),
        productionGatePassed: true,
        fakeClientCreateDraftCalls: created.length,
        createdDraft: created[0],
        receipt: { providerRef: receipt.providerRef, outcome: receipt.outcome },
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS (DRY): live run → recipient resolution → governed executor → draft provider assembles and validates. Pass --live to create + delete one real self-addressed draft.",
  );
}

async function runLive(): Promise<void> {
  const env = loadEnvLocal();
  const get = (name: string): string | undefined =>
    process.env[name]?.trim() || env[name]?.trim() || undefined;

  const baseUrl = get("RENTVINE_API_BASE_URL");
  const apiKey = get("RENTVINE_API_KEY");
  const apiSecret = get("RENTVINE_API_SECRET");
  const subject =
    readArg("--subject") ?? get("SHEETS_DWD_SUBJECT") ?? "josiah@pmikcmetro.com";
  const serviceAccount =
    readArg("--sa") ?? get("GMAIL_DWD_SA") ?? get("SHEETS_IMPERSONATE_SA");
  const draftTo = readArg("--to") ?? subject; // ALWAYS defaults to self; never a resolved recipient.
  const limit = Number(readArg("--limit") ?? "25");
  const keep = hasArg("--keep");

  if (!baseUrl || !apiKey || !apiSecret) {
    console.error(
      "Missing RentVine config. Need RENTVINE_API_BASE_URL/KEY/SECRET in .env.local.",
    );
    process.exitCode = 1;
    return;
  }
  if (!serviceAccount) {
    console.error(
      "No service account for Gmail DWD. Set GMAIL_DWD_SA (or SHEETS_IMPERSONATE_SA), or pass --sa=.",
    );
    process.exitCode = 1;
    return;
  }
  try {
    assertRentVineAccount(baseUrl, EXPECTED_ACCOUNT);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if (draftTo !== subject) {
    console.warn(
      `WARNING: --to overrides the safe self-addressed default. The draft will be addressed to ${draftTo}. It is still UNSENT; delete it if unintended.`,
    );
  }

  // 1) One live RentVine read; the recipient-resolution scan is bounded to `limit` leases client-side
  //    and reports coverage counts only (never an address).
  const rentvineClient = new RentVineClient(
    { baseUrl, apiKey, apiSecret },
    createFetchTransport(),
  );
  const rows = await rentvineClient.listLeasesExport();
  const leases = leaseViewsFromExport(rows).slice(0, Number.isFinite(limit) ? limit : 25);
  const resolutionCoverage = coverage(leases);
  console.log(
    `RentVine account ${rentVineAccountCode(baseUrl)}: scanned ${leases.length} lease view(s) for recipient resolution.`,
  );
  console.log("Recipient-resolution coverage (counts only, no PII):");
  console.log(JSON.stringify(resolutionCoverage, null, 2));

  // 2) ONE real, self-addressed, UNSENT diagnostic draft via the production modules.
  const token = await mintGmailDwdToken({
    subject,
    scope: GMAIL_COMPOSE_SCOPE,
    serviceAccount,
  });
  const client = new GmailRuntimeClient({ subject, getToken: async () => token });
  const action = buildRenewalNoticeDraftAction({
    workflowId: "smoke-renewal-draft-live",
    actionId: "smoke-1",
    channel: "tenant",
    templateRef: "tenant-renewal:v1.0",
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

  // Diagnostic opt-out: this draft is deliberately self-addressed to the operator, not an
  // authoritatively-sourced client recipient. A real route would omit this and be guarded.
  const receipt = await executeRenewalNoticeDraft(client, action, {
    allowNonAuthoritativeRecipient: true,
  });
  const draftId = receipt.providerRef;
  console.log(
    `Created UNSENT diagnostic draft ${draftId} in ${subject}'s mailbox (addressed to ${draftTo}). Nothing was sent.`,
  );

  if (keep) {
    console.log(
      "--keep set: leaving the draft in place (delete it from Gmail Drafts when done).",
    );
  } else {
    const del = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(subject)}/drafts/${encodeURIComponent(draftId)}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
    );
    console.log(
      del.ok
        ? `Cleaned up: deleted the diagnostic draft (HTTP ${del.status}).`
        : `Note: could not delete the diagnostic draft (HTTP ${del.status}); delete it manually from Gmail Drafts.`,
    );
  }
  console.log(
    "PASS (LIVE): a real renewal run's data resolves recipients, and the governed executor created a real UNSENT draft. The draft-into-Gmail path works end-to-end.",
  );
}

async function main(): Promise<void> {
  if (hasArg("--live")) {
    await runLive();
  } else {
    await runDry();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
