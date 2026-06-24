// Phase-2 proof: ONE read-only live `GET /leases` against the Rentvine tenant.
//
// Free (Rentvine reads do not touch the GCP budget) and read-only. Default is DRY (prints what it
// would call, exits 0); pass `--live` to make the single call. Output is SHAPE-ONLY and REDACTED: it
// prints lease field NAMES and which key resolved each pipeline target, but never a secret value and
// never raw tenant PII or rent figures (tenant -> initials+length, rent/date -> type/format only).
//
//   npm run smoke:rentvine-read            # dry: prints the call it would make
//   npm run smoke:rentvine-read -- --live  # one real GET /leases; redacted proof

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NonSheetFieldValue } from "../lib/lease-renewal/pipeline";
import type { RawLease } from "../lib/integrations/rentvine/client";
import {
  RentVineClient,
  assertRentVineAccount,
  createFetchTransport,
  rentVineAccountCode,
} from "../lib/integrations/rentvine/client";
import {
  DEFAULT_RENTVINE_LEASE_FIELD_MAP,
  leaseViewsFromExport,
  mapLeasesToNonSheetCandidates,
} from "../lib/integrations/rentvine/lease-mapper";
import { createRentVineHealthCheckTransport } from "../lib/integrations/rentvine/health-probe";
import {
  getHealthCheckContract,
  runHealthCheck,
} from "../lib/integrations/health-checks";

const EXPECTED_ACCOUNT = "pmikcmetro";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

function redactName(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word[0] ?? "").toUpperCase())
    .join("");
  return `${initials || "?"}-len${name.length}`;
}

function describeField(field: NonSheetFieldValue | undefined): {
  present: boolean;
  valueType?: string;
  isoDate?: boolean;
} {
  if (!field) return { present: false };
  return {
    present: true,
    valueType: typeof field.value,
    isoDate: typeof field.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(field.value),
  };
}

async function main(): Promise<void> {
  const localEnv = loadEnvLocal();
  const readEnv = (name: string): string | undefined =>
    process.env[name] ?? localEnv[name];

  const baseUrl = readArg("--base-url") ?? readEnv("RENTVINE_API_BASE_URL");
  const apiKey = readEnv("RENTVINE_API_KEY");
  const apiSecret = readEnv("RENTVINE_API_SECRET");
  const live = hasArg("--live");
  const limit = Number(readArg("--limit") ?? 1);
  const timeoutMs = Number(readArg("--timeout-ms") ?? 30_000);
  const artifactDir = resolve(readArg("--artifacts") ?? "temp/rentvine-read-smoke");

  if (!baseUrl || !apiKey || !apiSecret) {
    console.error(
      "Missing RentVine config. Set RENTVINE_API_BASE_URL, RENTVINE_API_KEY, RENTVINE_API_SECRET in .env.local (see: npm run preflight:rentvine).",
    );
    process.exitCode = 1;
    return;
  }

  try {
    assertRentVineAccount(baseUrl, EXPECTED_ACCOUNT);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const account = rentVineAccountCode(baseUrl);
  const host = new URL(baseUrl).host;
  const normalizedBase = baseUrl.replace(/\/$/, "");

  if (!live) {
    console.log(
      `Rentvine read smoke (DRY). Would GET ${normalizedBase}/leases?limit=${limit} via HTTP Basic as account "${account}".`,
    );
    console.log(
      "Pass --live to make the single read-only call (free; no GCP budget spend).",
    );
    return;
  }

  const client = new RentVineClient(
    { baseUrl, apiKey, apiSecret },
    createFetchTransport({ timeoutMs }),
  );

  const contract = getHealthCheckContract("health.rentvine.api_key");
  if (!contract) {
    console.error("Missing the health.rentvine.api_key contract.");
    process.exitCode = 1;
    return;
  }
  const health = await runHealthCheck(
    contract,
    createRentVineHealthCheckTransport(client),
  );

  // The live read uses /leases/export: tenant names live on lease.tenants[].name and rent on
  // unit.rent — both absent from the plain /leases list (confirmed live).
  let leases: RawLease[] = [];
  let readError: string | null = null;
  try {
    leases = leaseViewsFromExport(await client.listLeasesExport({ limit }));
  } catch (error) {
    readError =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  const mapping = mapLeasesToNonSheetCandidates(leases, {
    readTimestamp: new Date().toISOString(),
    fieldMap: DEFAULT_RENTVINE_LEASE_FIELD_MAP,
  });
  const sample = leases[0];
  const sampleLeaseFieldNames = sample ? Object.keys(sample).sort() : [];
  const firstCandidate = mapping.candidates[0];

  const proof = {
    host,
    account,
    mode: "live" as const,
    healthOk: health.ok,
    healthSteps: health.steps.map((step) => ({
      step_id: step.step_id,
      ok: step.ok,
      detail: step.detail,
    })),
    readError,
    leaseCount: leases.length,
    sampleLeaseFieldNames,
    resolvedKeys: mapping.resolvedKeys,
    mappedCandidates: mapping.candidates.length,
    skippedLeases: mapping.skipped,
    sampleMapping: firstCandidate
      ? {
          joinKind: firstCandidate.joinKind,
          tenant: redactName(firstCandidate.joinValue),
          renewal_date: describeField(firstCandidate.fields.renewal_date),
          current_rent: describeField(firstCandidate.fields.current_rent),
        }
      : null,
  };

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "proof.json"), JSON.stringify(proof, null, 2), "utf8");

  console.log(`Rentvine read smoke (LIVE) — host ${host}, account ${account}`);
  console.log(`Health check: ${health.ok ? "OK" : "FAILED"}`);
  for (const step of proof.healthSteps) {
    console.log(`  - ${step.step_id}: ${step.ok ? "ok" : "FAIL"} — ${step.detail ?? ""}`);
  }
  if (readError) console.log(`Lease read error: ${readError}`);
  console.log(`Leases returned: ${leases.length}`);
  if (sampleLeaseFieldNames.length) {
    console.log(`Sample lease field names: ${sampleLeaseFieldNames.join(", ")}`);
  }
  console.log(`Resolved keys: ${JSON.stringify(mapping.resolvedKeys)}`);
  console.log(
    `Mapped candidates: ${mapping.candidates.length} (skipped ${mapping.skipped})`,
  );
  if (proof.sampleMapping) {
    console.log(`Sample mapping (redacted): ${JSON.stringify(proof.sampleMapping)}`);
  }
  console.log(
    `Shape-only proof written to ${join(artifactDir, "proof.json")} (gitignored).`,
  );

  if (!health.ok || readError) process.exitCode = 1;
}

// Not a top-level await: tsx compiles this .ts as CommonJS, where TLA is unsupported. The pending
// promise keeps the event loop alive until main() settles, so process.exitCode is honored.
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
