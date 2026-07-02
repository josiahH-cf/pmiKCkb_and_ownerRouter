// Find-or-create the in-boundary Maintenance Work Order Intake photo folder, owned by the DWD subject
// (a pmikcmetro.com user) via KEYLESS domain-wide delegation — never the personal account, no key file.
// Prints the folder id to put in MAINTENANCE_PHOTO_DRIVE_FOLDER_ID (preferred; the dedicated photo var).
// Idempotent.
//
//   npm run maintenance:ensure-folder                                  # dry: prints what it would do
//   npm run maintenance:ensure-folder -- --live                        # create in the subject's My Drive
//   npm run maintenance:ensure-folder -- --live --shared-drive <id>    # create in a team Shared Drive
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
        process.env[key] = trimmed
          .slice(eq + 1)
          .trim()
          .replace(/^"|"$/g, "");
      }
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

function readArg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const live = process.argv.includes("--live");
  // Target a team-owned Shared Drive when --shared-drive <id> is given; else the subject's My Drive.
  const sharedDriveId = readArg("--shared-drive");
  const location = sharedDriveId ? { driveId: sharedDriveId } : {};
  const where = sharedDriveId
    ? `Shared Drive ${sharedDriveId}`
    : "the subject's My Drive";

  if (!live) {
    console.log(
      `[dry-run] Would find-or-create the Drive folder "${FOLDER_NAME}" in ${where} as the DWD subject ` +
        "(SHEETS_DWD_SUBJECT) via keyless domain-wide delegation, then print its id for " +
        "MAINTENANCE_PHOTO_DRIVE_FOLDER_ID. Pass --live to create it.",
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
  const { folder, created } = await client.ensureFolder(FOLDER_NAME, location);
  console.log(
    `${created ? "Created" : "Found existing"} Drive folder in ${where}: ${folder.id}`,
  );
  console.log(
    `Set MAINTENANCE_PHOTO_DRIVE_FOLDER_ID="${folder.id}" (and, in dev, IMAGE_STORE=drive to upload live; ` +
      "prod forces it). Production deploy forwards this var; the cutover preflight requires it.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(
      error instanceof DriveSetupError || error instanceof Error
        ? error.message
        : String(error),
    );
    process.exitCode = 1;
  });
}
