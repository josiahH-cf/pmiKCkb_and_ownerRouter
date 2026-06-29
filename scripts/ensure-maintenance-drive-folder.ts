// Find-or-create the in-boundary Maintenance Work Order Intake photo folder, owned by the DWD subject
// (a pmikcmetro.com user) via KEYLESS domain-wide delegation — never the personal account, no key file.
// Prints the folder id to put in SPACE_DRIVE_FOLDER_IDS["maintenance-work-order-intake"]. Idempotent.
//
//   npm run maintenance:ensure-folder                # dry: prints what it would do
//   npm run maintenance:ensure-folder -- --live      # find-or-create the folder, print its id
//
// Prereq for --live: the Drive scope must be authorized for SHEETS_IMPERSONATE_SA in Admin console →
// Security → API controls → Domain-wide delegation (the Sheets scope is already authorized; Drive is a
// separate scope). Until then --live fails at the token exchange with a clear message.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DriveSetupError, GoogleDriveClient } from "../lib/google-drive/drive-dwd";

const FOLDER_NAME = "Maintenance Work Order Intake — Photos";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] === undefined) {
        process.env[key] = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
      }
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const live = process.argv.includes("--live");

  if (!live) {
    console.log(
      `[dry-run] Would find-or-create the Drive folder "${FOLDER_NAME}" as the DWD subject ` +
        "(SHEETS_DWD_SUBJECT) via keyless domain-wide delegation, then print its id for " +
        "SPACE_DRIVE_FOLDER_IDS['maintenance-work-order-intake']. Pass --live to create it.",
    );
    return;
  }

  const sa = process.env.SHEETS_IMPERSONATE_SA?.trim();
  const subject = process.env.SHEETS_DWD_SUBJECT?.trim();
  if (!sa || !subject) {
    console.error(
      "Set SHEETS_IMPERSONATE_SA (service account) + SHEETS_DWD_SUBJECT (a pmikcmetro.com user) in .env.local first.",
    );
    process.exitCode = 1;
    return;
  }

  const client = new GoogleDriveClient();
  const { folder, created } = await client.ensureFolder(FOLDER_NAME);
  console.log(`${created ? "Created" : "Found existing"} Drive folder: ${folder.id}`);
  console.log(
    `Set SPACE_DRIVE_FOLDER_IDS to include {"maintenance-work-order-intake":"${folder.id}"} (and IMAGE_STORE=drive to upload live).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof DriveSetupError || error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
