// Live verification that the per-user Gmail domain-wide-delegation grant works: mint a keyless DWD token
// AS the subject (default josiah@pmikcmetro.com) with the gmail.compose scope, create an UNSENT test
// draft in that mailbox, then delete it. Proves the Admin-console DWD authorization end-to-end WITHOUT
// flipping the production gate (this is a standalone smoke, not the gated app path). Never sends.
//
// Owner-run (org reauth is interactive-only; the agent shell cannot refresh ADC):
//   npm run smoke:gmail-draft-live                 # dry: prints what it would do
//   npm run smoke:gmail-draft-live -- --live       # mint + create + delete one UNSENT test draft
//   npm run smoke:gmail-draft-live -- --live --subject=josiah@pmikcmetro.com --keep

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DRAFT_BANNER } from "../lib/constants";
import { GmailRuntimeClient } from "../lib/gmail-runtime/client";
import { mintGmailDwdToken } from "../lib/gmail-runtime/dwd-token";
import { GMAIL_COMPOSE_SCOPE } from "../lib/gmail-runtime/scopes";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      out[trimmed.slice(0, sep).trim()] = trimmed
        .slice(sep + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function readArg(name: string): string | undefined {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function adcRemediation(): string {
  return [
    "The Gmail draft smoke mints a keyless DWD token (the SA signs a JWT AS the subject), so it needs:",
    "  1) fresh ADC — re-auth once as josiah@pmikcmetro.com (free, no spend): gcloud auth application-default login",
    "  2) the SA client id authorized for gmail.compose in Admin console -> Domain-wide delegation,",
    "  3) Token Creator on that SA for your ADC identity.",
    "Then re-run: npm run smoke:gmail-draft-live -- --live",
  ].join("\n");
}

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const read = (name: string): string | undefined =>
    process.env[name]?.trim() || env[name]?.trim() || undefined;

  const subject =
    readArg("--subject") ?? read("SHEETS_DWD_SUBJECT") ?? "josiah@pmikcmetro.com";
  const serviceAccount =
    readArg("--sa") ?? read("GMAIL_DWD_SA") ?? read("SHEETS_IMPERSONATE_SA");
  const live = hasArg("--live");
  const keep = hasArg("--keep");

  if (!live) {
    console.log(
      "Gmail draft smoke (DRY). Would mint a keyless DWD token AS the subject and create + delete one UNSENT test draft.",
    );
    console.log(`  subject (impersonated mailbox): ${subject}`);
    console.log(
      `  service account: ${serviceAccount ?? "(unset -- set GMAIL_DWD_SA or SHEETS_IMPERSONATE_SA, or pass --sa=)"}`,
    );
    console.log(`  scope: ${GMAIL_COMPOSE_SCOPE} (no send scope, no send call)`);
    console.log(
      "Pass --live to create the draft (free; never sends; deletes the draft unless --keep).",
    );
    return;
  }

  if (!serviceAccount) {
    console.error(
      "No service account. Set GMAIL_DWD_SA (or SHEETS_IMPERSONATE_SA), or pass --sa=<sa-email>.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    // One mint, reused for create + delete.
    const token = await mintGmailDwdToken({
      subject,
      scope: GMAIL_COMPOSE_SCOPE,
      serviceAccount,
    });
    const client = new GmailRuntimeClient({ subject, getToken: async () => token });
    const { draftId } = await client.createDraft({
      to: subject,
      subject: "[smoke] Gmail DWD verification (safe to delete)",
      body: `${DRAFT_BANNER}\n\nThis is a Gmail DWD verification draft. It was created UNSENT and is safe to delete.`,
    });
    console.log(
      `Gmail draft smoke (LIVE): created UNSENT draft ${draftId} in ${subject}'s mailbox. Nothing was sent.`,
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
          ? `Cleaned up: deleted the test draft (HTTP ${del.status}).`
          : `Note: could not delete the test draft (HTTP ${del.status}); delete it manually from Gmail Drafts.`,
      );
    }
    console.log(
      "PASS: the Gmail DWD grant works for gmail.compose. The production flip will succeed once recorded.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gmail draft smoke FAILED: ${message}`);
    console.error("");
    console.error(adcRemediation());
    process.exitCode = 1;
  }
}

void main();
