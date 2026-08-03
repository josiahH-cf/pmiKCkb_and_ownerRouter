// Mint a public maintenance-intake token from the command line (staff convenience; the edit-gated
// /api/maintenance/intake/token route is the primary path). Minting is pure HMAC — it costs nothing and
// writes nothing — but it requires the same complete, strong, distinct token-secret/IP-salt pair as the
// public route so the CLI cannot issue a token for an inert intake deployment. It tries to read the
// property's live revocation epoch via the Admin SDK; if that is unavailable (no ADC), it falls back to
// --epoch (default 0) and says so, so an operator on a fresh property still gets a token.
//
//   npm run intake:mint -- --property=<key> [--days=7] [--reusable] [--epoch=N]
//
// The token is single-use (≤7d) unless --reusable is passed (≤30d, for printed signage). POST the
// report to /api/maintenance/intake/public with the token in the X-Intake-Token header.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readIntakeEpoch } from "../lib/firestore/maintenance-unverified-intake";
import { normalizeIntakePropertyKey } from "../lib/maintenance/intake-sanitize";
import {
  INTAKE_TOKEN_MAX_TTL_MS,
  mintIntakeToken,
} from "../lib/maintenance/intake-token";
import { validateMaintenanceIntakeRuntimeValues } from "./runtime-secret-bindings.mjs";

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

export function resolveMaintenanceIntakeMintConfig(
  processEnv: Record<string, string | undefined>,
  localEnv: Record<string, string>,
): {
  errors: string[];
  ok: boolean;
  secret?: string;
} {
  const tokenSecret = (
    processEnv.MAINTENANCE_INTAKE_TOKEN_SECRET ??
    localEnv.MAINTENANCE_INTAKE_TOKEN_SECRET ??
    ""
  ).trim();
  const ipHashSalt = (
    processEnv.MAINTENANCE_INTAKE_IP_HASH_SALT ??
    localEnv.MAINTENANCE_INTAKE_IP_HASH_SALT ??
    ""
  ).trim();
  const readiness = validateMaintenanceIntakeRuntimeValues({
    MAINTENANCE_INTAKE_TOKEN_SECRET: tokenSecret,
    MAINTENANCE_INTAKE_IP_HASH_SALT: ipHashSalt,
  });

  if (!readiness.configured) {
    return {
      errors:
        readiness.errors.length > 0
          ? readiness.errors
          : [
              "Maintenance intake requires both strong, distinct runtime values before a token can be minted.",
            ],
      ok: false,
    };
  }

  return { errors: [], ok: true, secret: tokenSecret };
}

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const intakeConfig = resolveMaintenanceIntakeMintConfig(process.env, env);
  if (!intakeConfig.ok || !intakeConfig.secret) {
    console.error("Maintenance intake is not available. Refusing to mint a token.");
    for (const error of intakeConfig.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  const secret = intakeConfig.secret;

  if (hasArg("--test")) {
    console.error(
      "The Production Test intake lane is retired; rehearse locally instead.",
    );
    process.exitCode = 1;
    return;
  }

  const requestedProperty = normalizeIntakePropertyKey(readArg("--property"));
  const propertyKey = requestedProperty;
  if (!propertyKey) {
    console.error(
      "Pass --property=<key> (letters, digits, . _ : - ; must start alphanumeric).",
    );
    process.exitCode = 1;
    return;
  }
  const reusable = hasArg("--reusable");
  const maxDays = reusable ? INTAKE_TOKEN_MAX_TTL_MS / DAY_MS : 7;
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
      dataMode: "live",
    },
    now,
  );

  console.log(`property:   ${propertyKey}`);
  console.log("data mode:  live");
  console.log(`single-use: ${!reusable}`);
  console.log(`expires:    ${new Date(now + ttlMs).toISOString()} (${days}d)`);
  console.log(`epoch:      ${epoch} [${epochSource}]`);
  console.log(
    `submit:     POST /api/maintenance/intake/public  (header: X-Intake-Token)`,
  );
  console.log(`token:      ${token}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
