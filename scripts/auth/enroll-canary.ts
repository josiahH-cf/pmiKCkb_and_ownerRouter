// S112 — owner enrollment of one canary browser profile on one origin. Headed: a browser window
// opens on the app's sign-in page and the owner completes Google as the canary account. Nothing is
// typed for the owner; the script waits, verifies the app session and its role, and closes.
// Re-run per origin (the app cookie is host-only); the Google session in the profile persists.
//
//   npx tsx scripts/auth/enroll-canary.ts --profile=$HOME/pmi-assurance/canary-admin --origin=https://... --email=canary-admin@pmikcmetro.com [--wait-ms=600000]

import { isManagedAccount } from "./identities.mjs";
import {
  establishAppSession,
  resolveHarnessBrowser,
  validateProfilePath,
} from "./browser";
import { readArg, requireArg } from "./cli";
import { recordBrowserEnrollment } from "./browser-enrollment.mjs";

async function main(argv = process.argv.slice(2)): Promise<number> {
  const origin = new URL(requireArg(argv, "--origin")).origin;
  if (!origin.startsWith("https://")) throw new Error("origin_must_be_https");
  const email = requireArg(argv, "--email");
  if (!isManagedAccount(email)) throw new Error("email_must_be_managed");
  const profile = validateProfilePath(requireArg(argv, "--profile"), { create: true });
  const executablePath = resolveHarnessBrowser();
  const waitMs = Number(readArg(argv, "--wait-ms") ?? 600_000);

  console.error(
    [
      `[enroll-canary] browser: ${executablePath}`,
      `[enroll-canary] profile: ${profile}`,
      `[enroll-canary] A window opens on ${origin}/sign-in. Complete the Google sign-in yourself as ${email}.`,
      "[enroll-canary] Nothing is typed for you; the script only selects the account tile if Google lists it.",
    ].join("\n"),
  );

  const result = await establishAppSession({
    profile,
    origin,
    email,
    executablePath,
    headless: false,
    humanWaitMs: waitMs,
    onEvent: (event) =>
      console.error(
        `[enroll-canary] ${event.stage}${event.detail ? `: ${event.detail}` : ""}`,
      ),
  });
  console.log(JSON.stringify({ ...result, executablePath, profile }));
  if (result.result === "signed_in") {
    recordBrowserEnrollment(profile);
    console.error(
      `[enroll-canary] enrolled: ${email} is signed in on ${origin} as ${result.role ?? "an unknown role"}. Unattended re-sign-in: npm run auth:ensure -- --need=canary --origins=${origin} --admin-profile=<profile> (or --editor-profile).`,
    );
    return 0;
  }
  return result.result === "human_required" ? 2 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.log(
      JSON.stringify({
        result: "error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
