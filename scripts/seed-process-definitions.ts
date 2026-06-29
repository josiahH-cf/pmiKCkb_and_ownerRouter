// Seed the Lease Renewal process definition (R3 wiring) as a non-executable Draft at a fixed id, so
// it appears in the existing /processes catalog and the spine recognizes lease-renewal as a real
// Process. Mirrors seed-action-registry.ts (TS + tsx, refuses production-eligible content). Activation
// is OUT of scope: the Draft graduates through the existing test -> submit -> approve -> activate
// lifecycle later. Live writes hit Firestore (ADC); --dry-run validates without writing.
//
//   npm run seed:process-definitions -- --dry-run [--json]   # build + validate, no write
//   npm run seed:process-definitions -- --force               # overwrite the existing Draft (keeps created_at)

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";

import {
  assertNoExecutableReferences,
  buildLeaseRenewalDefinitionRecord,
  seedLeaseRenewalDefinition,
  type SeedFirestore,
} from "../lib/lease-renewal/process-definition-seed";

export interface SeedProcessDefinitionsOptions {
  help: boolean;
  dryRun: boolean;
  force: boolean;
  json: boolean;
}

const HELP = `Seed the Lease Renewal process definition (a non-executable Draft).

Usage: tsx scripts/seed-process-definitions.ts [--dry-run] [--force] [--json]

  --dry-run   Build + validate the definition and print a summary; no Firestore write.
  --force     Overwrite an existing definition at the fixed id (preserves created_at).
  --json      Print the built record as JSON.
  --help      Show this help.

Seeds a Draft only; every action reference stays non-executable. Activation runs through the existing
Draft -> Testing -> Pending Approval -> Active lifecycle, never this seed.`;

export function parseSeedProcessDefinitionsArgs(
  argv = process.argv.slice(2),
): SeedProcessDefinitionsOptions {
  const options: SeedProcessDefinitionsOptions = {
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
  const options = parseSeedProcessDefinitionsArgs(argv);
  if (options.help) {
    console.log(HELP);
    return;
  }

  // Free-text uids (no validation in the spine); placeholders are safe for a Draft. Provide real
  // owner/approver uids via env before the activation lifecycle is run.
  const ownerUid = process.env.PROCESS_OWNER_UID || "lease-renewal-owner-PLACEHOLDER";
  const approverUid = process.env.PROCESS_APPROVER_UID || "lease-renewal-approver-PLACEHOLDER";

  // No source_links on the seeded Draft: activation (out of scope) requires the team to attach the
  // real approved source(s), so a Draft with none is valid and honest about not being activation-ready.
  const record = buildLeaseRenewalDefinitionRecord({ ownerUid, approverUid });
  assertNoExecutableReferences(record);

  if (options.dryRun) {
    if (options.json) console.log(JSON.stringify(record, null, 2));
    console.log(
      `[dry-run] built Lease Renewal Draft at process_definitions/${record.id}: ${record.steps.length} steps, ${record.action_references.length} action references, status ${record.status}; none 'Approved for Execution'. No writes.`,
    );
    return;
  }

  const db = getLiveFirestore();
  const now = new Date().toISOString();
  const result = await seedLeaseRenewalDefinition({
    db,
    ownerUid,
    approverUid,
    force: options.force,
    now,
  });
  console.log(`process_definitions/${result.id}: ${result.action}`);
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
