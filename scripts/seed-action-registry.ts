import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";
import {
  buildActionRegistryRecord,
  upsertActionRegistryEntry,
} from "../lib/firestore/action-registry";
import { ACTION_REGISTRY_SEED } from "../lib/integrations/action-registry-seed";

export interface SeedActionRegistryOptions {
  help: boolean;
  dryRun: boolean;
  json: boolean;
}

const HELP = `Seed the Action Registry catalog (metadata only).

Usage: tsx scripts/seed-action-registry.ts [--dry-run] [--json]

  --dry-run   Validate and print the catalog without writing to Firestore.
  --json      Print built records as JSON (implied detail for --dry-run).
  --help      Show this help.

Executable entries are limited to an explicit allow-list (each backed by a committed grant
artifact); this script refuses to seed any OTHER production_allowed entry.`;

// Action Registry keys permitted to be production_allowed, each backed by a committed grant artifact
// (Section 3). Kept in sync with the executable set in lib/admin/migration-readiness.ts (gmail.message.send
// is additionally retained here as a permitted-but-currently-gated send). Any production_allowed entry NOT
// listed here is a surprise flip and the seed refuses it.
const EXECUTABLE_ALLOWLIST = new Set<string>([
  "gmail.mailbox.read",
  "gmail.message.send",
  "gmail.thread.reply",
  "gmail.label.apply",
  "gmail.renewal_notice.draft_create",
  // Slice 6 (2026-07-22): maintenance owner-notice DRAFT flipped live (draft-only); its send stays gated.
  "gmail.maintenance_owner_notice.draft_create",
]);

export function parseSeedActionRegistryArgs(
  argv = process.argv.slice(2),
): SeedActionRegistryOptions {
  const options: SeedActionRegistryOptions = { help: false, dryRun: false, json: false };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseSeedActionRegistryArgs(argv);

  if (options.help) {
    console.log(HELP);
    return;
  }

  // Validate every entry up front. buildActionRegistryRecord parses the schema, which also
  // enforces the production_allowed governance gate.
  const records = ACTION_REGISTRY_SEED.map((entry) => buildActionRegistryRecord(entry));

  const unexpectedExecutable = records.filter(
    (record) => record.production_allowed && !EXECUTABLE_ALLOWLIST.has(record.key),
  );
  if (unexpectedExecutable.length > 0) {
    throw new Error(
      `Refusing to seed: ${unexpectedExecutable.length} entr(y/ies) are production_allowed and NOT on the ` +
        `executable allow-list (${unexpectedExecutable.map((r) => r.key).join(", ")}). ` +
        "Every executable action requires a committed grant artifact + an allow-list entry.",
    );
  }

  const executable = records.filter((record) => record.production_allowed);
  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify(records, null, 2));
    }
    console.log(
      `[dry-run] validated ${records.length} Action Registry entries; ${executable.length} allow-listed executable (${executable.map((r) => r.key).join(", ") || "none"}), the rest production_allowed=false. No writes performed.`,
    );
    return;
  }

  const db = getLiveFirestore();

  for (const entry of ACTION_REGISTRY_SEED) {
    const key = await upsertActionRegistryEntry(entry, db);
    console.log(`seeded action_registry: ${key}`);
  }

  console.log(`Seeded ${ACTION_REGISTRY_SEED.length} Action Registry entries.`);
}

function getLiveFirestore() {
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

  return getFirestore();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
