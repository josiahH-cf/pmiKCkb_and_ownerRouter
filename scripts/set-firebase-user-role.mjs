import { existsSync, readFileSync } from "node:fs";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const roles = new Set(["Admin", "Approver", "Editor"]);

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  loadEnvLocal();

  const email = readArg("--email");
  const role = readArg("--role") ?? "Admin";
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID;

  if (!email) {
    throw new Error("Missing email. Use --email=<user@example.com>.");
  }

  if (!roles.has(role)) {
    throw new Error("Invalid role. Use Admin, Approver, or Editor.");
  }

  if (!projectId) {
    throw new Error("Missing FIREBASE_PROJECT_ID/GCP_PROJECT_ID in .env.local.");
  }

  process.env.GOOGLE_CLOUD_PROJECT ??= projectId;
  process.env.GCLOUD_PROJECT ??= projectId;

  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(email);
  const claims = {
    ...(user.customClaims ?? {}),
    role,
  };

  await auth.setCustomUserClaims(user.uid, claims);
  console.log(
    `Set ${email} role to ${role}. Sign out and sign back in to refresh claims.`,
  );
}

function loadEnvLocal() {
  if (!existsSync(".env.local")) {
    return;
  }

  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
}

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
