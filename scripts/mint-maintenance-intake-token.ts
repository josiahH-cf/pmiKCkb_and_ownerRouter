// Mint a public maintenance-intake token from the command line (staff convenience; the edit-gated
// /api/maintenance/intake/token route is the primary path). Minting is pure HMAC — it costs nothing and
// writes nothing — so this needs only the signing secret (from env or .env.local), no ADC. It tries to
// read the property's live revocation epoch via the Admin SDK; if that is unavailable (no ADC), it
// falls back to --epoch (default 0) and says so, so an operator on a fresh property still gets a token.
//
//   npm run intake:mint -- --property=<key> [--days=7] [--reusable] [--epoch=N]
//   npm run intake:mint -- --test [--days=1] [--epoch=N]
//
// The token is single-use (≤7d) unless --reusable is passed (≤30d, for printed signage). POST the
// report to /api/maintenance/intake/public with the token in the X-Intake-Token header.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readIntakeEpoch } from "../lib/firestore/maintenance-unverified-intake";
import { normalizeIntakePropertyKey } from "../lib/maintenance/intake-sanitize";
import {
  INTAKE_TOKEN_MAX_TTL_MS,
  mintIntakeToken,
} from "../lib/maintenance/intake-token";
import { MAINTENANCE_TEST_PUBLIC_INTAKE } from "../lib/maintenance/test-workflow";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DAY_MS = 24 * 60 * 60 * 1000;

function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      out[trimmed.slice(0, sep).trim()] = trimmed
        .slice(sep + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function readArg(name: string): string | undefined {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const secret = (
    process.env.MAINTENANCE_INTAKE_TOKEN_SECRET ??
    env.MAINTENANCE_INTAKE_TOKEN_SECRET ??
    ""
  ).trim();
  if (!secret) {
    console.error(
      "No MAINTENANCE_INTAKE_TOKEN_SECRET set (env or .env.local). Cannot mint — the route also fails closed without it.",
    );
    process.exitCode = 1;
    return;
  }

  const testMode = hasArg("--test");
  const requestedProperty = normalizeIntakePropertyKey(readArg("--property"));
  const propertyKey = testMode
    ? MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey
    : requestedProperty;
  if (!propertyKey) {
    console.error(
      "Pass --property=<key> (letters, digits, . _ : - ; must start alphanumeric).",
    );
    process.exitCode = 1;
    return;
  }
  if (
    testMode &&
    requestedProperty &&
    requestedProperty !== MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey
  ) {
    console.error("--test cannot target a non-Test property key.");
    process.exitCode = 1;
    return;
  }

  const reusable = hasArg("--reusable");
  if (testMode && reusable) {
    console.error("--test tokens are single-use and cannot use --reusable.");
    process.exitCode = 1;
    return;
  }
  const maxDays = testMode ? 1 : reusable ? INTAKE_TOKEN_MAX_TTL_MS / DAY_MS : 7;
  const requestedDays = Number(readArg("--days") ?? maxDays);
  const days = Math.min(
    Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : maxDays,
    maxDays,
  );

  // Prefer the live epoch; fall back to --epoch (default 0) if the Admin SDK / ADC is unavailable.
  let epoch = Number(readArg("--epoch") ?? 0);
  let epochSource = `--epoch=${epoch}`;
  try {
    epoch = await readIntakeEpoch(propertyKey);
    epochSource = "live (Admin SDK)";
  } catch {
    epoch = Number.isFinite(epoch) && epoch >= 0 ? Math.trunc(epoch) : 0;
    epochSource = `fallback --epoch=${epoch} (no ADC; pass the current epoch if the property was revoked)`;
  }

  const now = Date.now();
  const ttlMs = days * DAY_MS;
  const token = mintIntakeToken(
    {
      secret,
      propertyKey,
      jti: randomUUID(),
      epoch,
      ttlMs,
      singleUse: !reusable,
      dataMode: testMode ? "test" : "live",
    },
    now,
  );

  console.log(`property:   ${propertyKey}`);
  console.log(`data mode:  ${testMode ? "test" : "live"}`);
  console.log(`single-use: ${!reusable}`);
  console.log(`expires:    ${new Date(now + ttlMs).toISOString()} (${days}d)`);
  console.log(`epoch:      ${epoch} [${epochSource}]`);
  console.log(
    `submit:     POST /api/maintenance/intake/public  (header: X-Intake-Token)`,
  );
  if (testMode) {
    console.log(`fixture:    ${JSON.stringify(MAINTENANCE_TEST_PUBLIC_INTAKE)}`);
  }
  console.log(`token:      ${token}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
