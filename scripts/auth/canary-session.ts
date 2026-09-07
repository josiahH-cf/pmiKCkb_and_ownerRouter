// S112 — unattended: re-establish one canary's app session on one origin from its enrolled profile.
// Prints exactly one JSON line. Exit 0 = signed_in, 2 = a person is needed (the Google URL and
// reason are named), 1 = error. Nothing is typed on a Google page; see scripts/auth/browser.ts.
//
//   npx tsx scripts/auth/canary-session.ts --profile=/abs/outside/repo --origin=https://... --email=canary-admin@pmikcmetro.com [--headed]

import { isManagedAccount } from "./identities.mjs";
import {
  establishAppSession,
  resolveHarnessBrowser,
  validateProfilePath,
} from "./browser";
import { hasArg, readArg, requireArg } from "./cli";

async function main(argv = process.argv.slice(2)): Promise<number> {
  const origin = new URL(requireArg(argv, "--origin")).origin;
  if (!origin.startsWith("https://")) throw new Error("origin_must_be_https");
  const email = requireArg(argv, "--email");
  if (!isManagedAccount(email)) throw new Error("email_must_be_managed");
  const profile = validateProfilePath(requireArg(argv, "--profile"), { create: false });
  const executablePath = resolveHarnessBrowser();
  const timeoutMs = Number(readArg(argv, "--timeout-ms") ?? 90_000);

  const result = await establishAppSession({
    profile,
    origin,
    email,
    executablePath,
    headless: !hasArg(argv, "--headed"),
    humanWaitMs: 0,
    stepTimeoutMs: timeoutMs,
    onEvent: (event) =>
      console.error(
        `[canary-session] ${event.stage}${event.detail ? `: ${event.detail}` : ""}`,
      ),
  });
  console.log(JSON.stringify({ ...result, executablePath, profile }));
  return result.result === "signed_in" ? 0 : result.result === "human_required" ? 2 : 1;
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
