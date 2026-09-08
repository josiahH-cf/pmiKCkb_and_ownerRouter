// Local ADC freshness preflight. The shared auth path verifies the specifically approved identity
// and WSL enrollment before any ordinary token probe. Missing evidence stops only dependent reads;
// no provider body or token is printed. This is a live prerequisite, not part of verify.sh / CI.
//
//   npm run preflight:adc

import { pathToFileURL } from "node:url";
import { ensureAuthenticated } from "./auth/ensure.mjs";

const REAUTH_COMMAND = "gcloud auth application-default login";

/** Classify an ADC failure so the operator gets the right fix. Pure + exported for tests. */
export function classifyAdcError(message) {
  const text = String(message ?? "").toLowerCase();
  if (
    text.includes("invalid_rapt") ||
    text.includes("reauth") ||
    text.includes("invalid_grant")
  ) {
    return "reauth";
  }
  if (
    text.includes("could not load the default credentials") ||
    text.includes("default credentials")
  ) {
    return "missing";
  }
  return "other";
}

/**
 * The operator-facing fix lines for a given failure kind. Pure + exported for tests. S112: the
 * unattended, browser-free repair comes first; the interactive enrollment (which runs the scope-free
 * ADC login as a managed pmikcmetro.com identity) is the human fallback.
 */
export function reauthGuidance(kind) {
  const fixes = [
    "Fix (unattended, no browser): npm run auth:ensure -- --need=adc",
    `Fallback (interactive, a managed pmikcmetro.com identity, NO --scopes): npm run auth:enroll, which runs ${REAUTH_COMMAND}`,
  ];
  if (kind === "reauth") {
    return [
      "ADC preflight FAILED: Application Default Credentials need reauth (the token is stale).",
      ...fixes,
    ];
  }
  if (kind === "missing") {
    return [
      "ADC preflight FAILED: no Application Default Credentials found (or not configured for this org).",
      ...fixes,
    ];
  }
  return ["ADC preflight FAILED with an unexpected error (see the message above)."];
}

export async function main({ output = console.log } = {}) {
  try {
    const result = await ensureAuthenticated({ need: ["adc"], unattended: true });
    for (const line of result.lines) output(line);
    return result.exitCode;
  } catch {
    output("ADC preflight could not verify the approved local credentials.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
