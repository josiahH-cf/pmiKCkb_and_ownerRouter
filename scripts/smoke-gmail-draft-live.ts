// Keyless Gmail DWD diagnostic. Live mode creates one self-addressed UNSENT draft and deletes it.
// The exact owning Registry key is `gmail.draft.create`; because that key is currently seed-closed,
// `--live` now refuses before ADC/token/client/network work. This diagnostic may not borrow a different
// workflow's open key. Dry mode remains a pure print-only check.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DRAFT_BANNER } from "../lib/constants";
import {
  GmailRuntimeClient,
  type GmailRuntimeClient as GmailRuntimeClientType,
} from "../lib/gmail-runtime/client";
import { mintGmailDwdToken } from "../lib/gmail-runtime/dwd-token";
import { GMAIL_COMPOSE_SCOPE } from "../lib/gmail-runtime/scopes";
import { assertProductionRuntimeActionExecutable } from "../lib/operations/runtime-suspension-gate";

export const GMAIL_DIAGNOSTIC_DRAFT_ACTION_KEY = "gmail.draft.create" as const;

const root = dirname(dirname(fileURLToPath(import.meta.url)));

interface SmokeLogger {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

export interface GmailDraftSmokeDependencies {
  assertRuntimeExecutable(actionKey: string): Promise<void>;
  loadEnvLocal(): Record<string, string>;
  mintGmailToken(input: {
    subject: string;
    scope: string;
    serviceAccount: string;
  }): Promise<string>;
  createGmailClient(input: {
    subject: string;
    token: string;
  }): Pick<GmailRuntimeClientType, "createDraft">;
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

const PRODUCTION_DEPENDENCIES: GmailDraftSmokeDependencies = {
  assertRuntimeExecutable: assertProductionRuntimeActionExecutable,
  loadEnvLocal,
  mintGmailToken: mintGmailDwdToken,
  createGmailClient: ({ subject, token }) =>
    new GmailRuntimeClient({ subject, getToken: async () => token }),
  fetch,
  logger: console,
};

function readArg(argv: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const argument = argv.find((entry) => entry.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : undefined;
}

function hasArg(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

function adcRemediation(): string {
  return [
    "The Gmail draft smoke mints a keyless DWD token, so it needs:",
    "  1) fresh ADC as the managed operator (run `npm run auth:session`),",
    "  2) the SA client id authorized for gmail.compose in Domain-wide delegation,",
    "  3) Token Creator on that SA for the managed ADC identity.",
    "Then re-run: npm run smoke:gmail-draft-live -- --live",
  ].join("\n");
}

function base64UrlMime(subject: string): string {
  const mime = [
    `To: ${subject}`,
    "Subject: [smoke-diagnostic] safe to ignore",
    "",
    "diagnostic",
  ].join("\r\n");
  return Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function projectFromServiceAccount(
  serviceAccount: string | undefined,
): string | undefined {
  return serviceAccount?.match(/@([^.]+)\.iam\.gserviceaccount\.com$/)?.[1];
}

async function diagnoseGmail(
  subject: string,
  token: string,
  dependencies: GmailDraftSmokeDependencies,
  serviceAccount?: string,
): Promise<void> {
  try {
    const response = await dependencies.fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(subject)}/drafts`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: { raw: base64UrlMime(subject) } }),
      },
    );
    const body = await response.text();
    dependencies.logger.error(`\nGmail API said (raw): HTTP ${response.status}`);
    dependencies.logger.error(body.slice(0, 1500));
    if (response.ok) {
      try {
        const { id } = JSON.parse(body) as { id?: string };
        if (id) {
          await dependencies.fetch(
            `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(subject)}/drafts/${encodeURIComponent(id)}`,
            { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
          );
        }
      } catch {
        // Best-effort compensation for a draft created by this same diagnostic attempt.
      }
    } else if (
      /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(body)
    ) {
      const project = projectFromServiceAccount(serviceAccount) ?? "<the SA's project>";
      dependencies.logger.error(
        `\nLikely fix: enable the Gmail API on the service account's project:\n` +
          `  gcloud services enable gmail.googleapis.com --project=${project}\n` +
          "then wait about one minute and re-run this smoke.",
      );
    }
  } catch (error) {
    dependencies.logger.error(
      `Gmail diagnostic call also failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function runGmailDraftSmoke(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  dependencies: GmailDraftSmokeDependencies = PRODUCTION_DEPENDENCIES,
): Promise<void> {
  const live = hasArg(argv, "--live");
  if (!live) {
    dependencies.logger.log(
      "Gmail draft smoke (DRY). No configuration, ADC, token mint, provider, or network call is made.",
    );
    dependencies.logger.log(
      `Owning action: ${GMAIL_DIAGNOSTIC_DRAFT_ACTION_KEY}. Pass --live only after that exact key is enabled and runtime-clear.`,
    );
    return;
  }

  // This is intentionally before .env.local: every suspended/unreadable attempt is zero-credential
  // and zero-provider, and a seed-closed action cannot be opened by a diagnostic.
  await dependencies.assertRuntimeExecutable(GMAIL_DIAGNOSTIC_DRAFT_ACTION_KEY);

  const localEnv = dependencies.loadEnvLocal();
  const read = (name: string): string | undefined =>
    env[name]?.trim() || localEnv[name]?.trim() || undefined;
  const subject =
    readArg(argv, "--subject") ?? read("SHEETS_DWD_SUBJECT") ?? "josiah@pmikcmetro.com";
  const serviceAccount =
    readArg(argv, "--sa") ?? read("GMAIL_DWD_SA") ?? read("SHEETS_IMPERSONATE_SA");
  const keep = hasArg(argv, "--keep");

  if (!serviceAccount) {
    throw new Error(
      "No service account. Set GMAIL_DWD_SA (or SHEETS_IMPERSONATE_SA), or pass --sa=<sa-email>.",
    );
  }

  let mintedToken: string | undefined;
  try {
    // Repeat immediately before the credential/provider boundary.
    await dependencies.assertRuntimeExecutable(GMAIL_DIAGNOSTIC_DRAFT_ACTION_KEY);
    mintedToken = await dependencies.mintGmailToken({
      subject,
      scope: GMAIL_COMPOSE_SCOPE,
      serviceAccount,
    });
    const token = mintedToken;
    const client = dependencies.createGmailClient({ subject, token });
    const { draftId } = await client.createDraft({
      to: subject,
      subject: "[smoke] Gmail DWD verification (safe to delete)",
      body: `${DRAFT_BANNER}\n\nThis is a Gmail DWD verification draft. It was created UNSENT and is safe to delete.`,
    });
    dependencies.logger.log(
      `Gmail draft smoke (LIVE): created UNSENT draft ${draftId} in ${subject}'s mailbox. Nothing was sent.`,
    );

    if (keep) {
      dependencies.logger.log(
        "--keep set: leaving the draft in place (delete it from Gmail Drafts when done).",
      );
    } else {
      // Compensating cleanup stays available if an operator closes the gate after creation.
      const response = await dependencies.fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(subject)}/drafts/${encodeURIComponent(draftId)}`,
        { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
      );
      dependencies.logger.log(
        response.ok
          ? `Cleaned up: deleted the test draft (HTTP ${response.status}).`
          : `Note: could not delete the test draft (HTTP ${response.status}); delete it manually from Gmail Drafts.`,
      );
    }
    dependencies.logger.log(
      "PASS: the Gmail DWD grant works for gmail.compose. Nothing was sent.",
    );
  } catch (error) {
    dependencies.logger.error(
      `Gmail draft smoke FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (mintedToken) {
      // This raw drafts.create is a second effect attempt, so re-read suspension immediately first.
      await dependencies.assertRuntimeExecutable(GMAIL_DIAGNOSTIC_DRAFT_ACTION_KEY);
      await diagnoseGmail(subject, mintedToken, dependencies, serviceAccount);
    } else {
      dependencies.logger.error("");
      dependencies.logger.error(adcRemediation());
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runGmailDraftSmoke().catch(() => {
    process.exitCode = 1;
  });
}
