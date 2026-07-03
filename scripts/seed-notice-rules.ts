// Seed the renewal-notice rule config (S13 Wave 3 F1) as a single app-plane Firestore document at a
// fixed id. Mirrors scripts/seed-process-definitions.ts (TS + tsx, idempotent). By default it seeds
// the built-in DEFAULT rule set, whose values are all UNVERIFIED until Dan confirms them; supply a
// Dan-confirmed override set via the config record when the notice-rule values firm up. Live writes
// hit Firestore (ADC), so this is an OWNER-RUN step; --dry-run validates without writing.
//
//   npm run seed:notice-rules -- --dry-run [--json]   # build + validate, no write
//   npm run seed:notice-rules -- --force               # overwrite the existing config (keeps created_at)

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";

import {
  NOTICE_RULE_CONFIG_COLLECTION,
  buildNoticeRuleConfigRecord,
  seedNoticeRuleConfig,
} from "../lib/firestore/lease-renewal-notice-rules";
import type { SeedFirestore } from "../lib/lease-renewal/process-definition-seed";

export interface SeedNoticeRulesOptions {
  help: boolean;
  dryRun: boolean;
  force: boolean;
  json: boolean;
}

const HELP = `Seed the renewal-notice rule config as a single app-plane Firestore document.

Usage: tsx scripts/seed-notice-rules.ts [--dry-run] [--force] [--json]

  --dry-run   Build + validate the config and print a summary; no Firestore write.
  --force     Overwrite the existing config at the fixed id (preserves created_at).
  --json      Print the built record as JSON.
  --help      Show this help.

Seeds the DEFAULT rule set; every value is UNVERIFIED until Dan confirms it. No send, no
system-of-record write. Client-read-only; written through the Admin SDK boundary only.`;

export function parseSeedNoticeRulesArgs(
  argv = process.argv.slice(2),
): SeedNoticeRulesOptions {
  const options: SeedNoticeRulesOptions = {
    help: false,
    dryRun: false,
    force: false,
    json: false,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseSeedNoticeRulesArgs(argv);
  if (options.help) {
    console.log(HELP);
    return;
  }

  const seededByUid = process.env.PROCESS_OWNER_UID || "process-owner-PLACEHOLDER";
  const record = buildNoticeRuleConfigRecord({ seededByUid });

  if (options.dryRun) {
    if (options.json) console.log(JSON.stringify(record, null, 2));
    const unverified = record.rules.filter((rule) => !rule.verified).length;
    console.log(
      `[dry-run] built notice-rule config at ${NOTICE_RULE_CONFIG_COLLECTION}/${record.id}: ${record.rules.length} scoped rule(s), ${unverified} unverified (Needs Verification until Dan confirms). No writes.`,
    );
    return;
  }

  const db = getLiveFirestore();
  const now = new Date().toISOString();
  const result = await seedNoticeRuleConfig({ db, record, force: options.force, now });
  console.log(`${NOTICE_RULE_CONFIG_COLLECTION}/${result.id}: ${result.action}`);
}

function getLiveFirestore(): SeedFirestore {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  return getFirestore() as unknown as SeedFirestore;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
