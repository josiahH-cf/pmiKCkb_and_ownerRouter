// Slice 1 (overnight run 2026-07-22): READ-ONLY RentVine field discovery.
//
// Confirms the exact live field paths that feed later slices — WITHOUT emitting any PII:
//   * renewal recipient(s) + rent   [F-LEASE-3]           -> resolvedKeys + tenant coverage
//   * the property-OWNER email path  [D10, feeds Slice 6]  -> owner-channel coverage + emailLike paths
//   * writable renewal fields / write endpoint [D18, Slice 9] -> documented as capability, never probed
//
// Redaction contract (matches scripts/smoke-rentvine-read.ts): output is SHAPE + PRESENCE + PATHS only.
// Every leaf value is reduced to {type, emailLike?, isoDateLike?, numericLike?, empty?} — never the raw
// email/name/rent. Source refs are stripped to the schema PATH (no lease id). The written proof carries
// the same redacted shape (temp/ is gitignored, but we keep zero PII even there).
//
//   npm run discover:rentvine-fields            # dry: prints the calls it would make
//   npm run discover:rentvine-fields -- --live  # read-only live discovery (free; no GCP budget)
//   npm run discover:rentvine-fields -- --live --limit 25   # scan all leases for owner-email coverage

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
import { resolveRenewalRecipient } from "../lib/lease-renewal/recipient-resolution";

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
  const withEq = process.argv.find((entry) => entry.startsWith(prefix));
  if (withEq) return withEq.slice(prefix.length);
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith("--")) return next;
  }
  return undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}/;

interface LeafShape {
  type: string;
  emailLike?: boolean;
  isoDateLike?: boolean;
  numericLike?: boolean;
  empty?: boolean;
}

/** Reduce a leaf to shape-only facts. NEVER returns the raw value. */
function describeLeaf(value: unknown): LeafShape {
  if (value === null) return { type: "null", empty: true };
  if (value === undefined) return { type: "undefined", empty: true };
  if (typeof value === "string") {
    const trimmed = value.trim();
    return {
      type: "string",
      empty: trimmed === "",
      ...(EMAIL_RE.test(trimmed) ? { emailLike: true } : {}),
      ...(ISO_RE.test(trimmed) ? { isoDateLike: true } : {}),
      ...(trimmed !== "" && Number.isFinite(Number(trimmed.replace(/[$,\s]/g, "")))
        ? { numericLike: true }
        : {}),
    };
  }
  if (typeof value === "number") return { type: "number", numericLike: true };
  return { type: typeof value };
}

/** Recursively record path -> leaf shape (depth-limited; arrays sampled to first 2 elements). */
function walk(
  node: unknown,
  prefix: string,
  depth: number,
  maxDepth: number,
  out: Map<string, LeafShape>,
): void {
  if (Array.isArray(node)) {
    out.set(`${prefix}[]`, { type: `array(${node.length})` });
    if (depth >= maxDepth) return;
    node.slice(0, 2).forEach((el, i) => walk(el, `${prefix}[${i}]`, depth + 1, maxDepth, out));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && depth < maxDepth) {
        walk(value, path, depth + 1, maxDepth, out);
      } else {
        out.set(path, describeLeaf(value));
      }
    }
    return;
  }
  out.set(prefix || "(root)", describeLeaf(node));
}

/** Strip `rentvine:lease:<id>:` down to the schema path, so no lease id / PII leaks. */
function pathOnly(sourceRef: string | undefined): string | undefined {
  if (!sourceRef) return undefined;
  const marker = sourceRef.match(/^rentvine:lease:[^:]+:(.+)$/);
  return marker ? marker[1] : sourceRef;
}

/** Read a dotted/indexed path (e.g. "portfolio.owners[0].email") off a raw row. Value never printed. */
function getByPath(root: unknown, path: string): unknown {
  const tokens = path.split(".").flatMap((seg) => {
    const out: (string | number)[] = [];
    const m = seg.matchAll(/([^[\]]+)|\[(\d+)\]/g);
    for (const part of m) {
      if (part[1] !== undefined) out.push(part[1]);
      else if (part[2] !== undefined) out.push(Number(part[2]));
    }
    return out;
  });
  let node: unknown = root;
  for (const token of tokens) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[token];
  }
  return node;
}

/** Count how many rows carry a present (non-empty) value at `path`, and how many look email-shaped. */
function coverageAt(
  rows: Record<string, unknown>[],
  path: string,
): { present: number; emailLike: number; of: number } {
  let present = 0;
  let emailLike = 0;
  for (const row of rows) {
    const value = getByPath(row, path);
    if (value === undefined || value === null || value === "") continue;
    present += 1;
    if (typeof value === "string" && EMAIL_RE.test(value.trim())) emailLike += 1;
  }
  return { present, emailLike, of: rows.length };
}

async function main(): Promise<void> {
  const localEnv = loadEnvLocal();
  const readEnv = (name: string): string | undefined => process.env[name] ?? localEnv[name];

  const baseUrl = readArg("--base-url") ?? readEnv("RENTVINE_API_BASE_URL");
  const apiKey = readEnv("RENTVINE_API_KEY");
  const apiSecret = readEnv("RENTVINE_API_SECRET");
  const live = hasArg("--live");
  const limit = Number(readArg("--limit") ?? 25);
  const timeoutMs = Number(readArg("--timeout-ms") ?? 30_000);
  const maxDepth = Number(readArg("--depth") ?? 4);
  const artifactDir = resolve(readArg("--artifacts") ?? "temp/rentvine-field-discovery");

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
      `RentVine field discovery (DRY). Would GET ${normalizedBase}/leases/export?limit=${limit} via HTTP Basic as account "${account}", then enumerate PATHS + PRESENCE only (no PII).`,
    );
    console.log("Pass --live to make the single read-only call (free; no GCP budget spend).");
    return;
  }

  const client = new RentVineClient(
    { baseUrl, apiKey, apiSecret },
    createFetchTransport({ timeoutMs }),
  );

  let rawRows: Record<string, unknown>[] = [];
  let readError: string | null = null;
  try {
    rawRows = await client.listLeasesExport({ limit });
  } catch (error) {
    readError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  if (readError) {
    console.error(`RentVine export read failed: ${readError}`);
    process.exitCode = 1;
    return;
  }

  // --- Structure enumeration (first row only; paths + presence) ---
  const structure = new Map<string, LeafShape>();
  if (rawRows[0]) walk(rawRows[0], "", 0, maxDepth, structure);
  const allPaths = [...structure.keys()].sort();
  const emailLikePaths = allPaths.filter((p) => structure.get(p)?.emailLike);
  const isoDatePaths = allPaths.filter((p) => structure.get(p)?.isoDateLike);

  // Coverage across ALL scanned rows (not just row 0) for the email + address paths later slices need.
  const coveragePaths = [
    ...new Set([
      ...emailLikePaths,
      "portfolio.owners[0].email", // D10 owner-email candidate (Slice 6)
      "lease.tenants[0].email", // F-LEASE-3 tenant recipient
      "property.streetName", // Slice 3 Zillow deep-link address
      "property.address",
      "property.city",
    ]),
  ];
  const pathCoverage = Object.fromEntries(
    coveragePaths.map((p) => [p, coverageAt(rawRows, p)]),
  );

  // --- Recipient + rent coverage across ALL scanned leases (paths only; counts only) ---
  const views = leaseViewsFromExport(rawRows);
  let ownerVerified = 0;
  let tenantVerified = 0;
  const ownerPaths = new Set<string>();
  const tenantPaths = new Set<string>();
  const ownerMissing = new Set<string>();
  const tenantMissing = new Set<string>();
  for (const view of views) {
    const owner = resolveRenewalRecipient({ lease: view, channel: "owner" });
    if (owner.verified) {
      ownerVerified += 1;
      const p = pathOnly(owner.recipientSourceRef);
      if (p) ownerPaths.add(p);
    } else {
      owner.missing.forEach((m) => ownerMissing.add(m));
    }
    const tenant = resolveRenewalRecipient({ lease: view, channel: "tenant" });
    if (tenant.verified) {
      tenantVerified += 1;
      const p = pathOnly(tenant.recipientSourceRef);
      if (p) tenantPaths.add(p);
      (tenant.ccSourceRefs ?? []).forEach((r) => {
        const cp = pathOnly(r);
        if (cp) tenantPaths.add(cp);
      });
    } else {
      tenant.missing.forEach((m) => tenantMissing.add(m));
    }
  }

  const mapping = mapLeasesToNonSheetCandidates(views, {
    readTimestamp: new Date().toISOString(),
    fieldMap: DEFAULT_RENTVINE_LEASE_FIELD_MAP,
  });

  const proof = {
    host,
    account,
    mode: "live" as const,
    scannedRows: rawRows.length,
    leaseViews: views.length,
    // F-LEASE-3: which source keys resolved rent + lease-end (names only).
    resolvedKeys: mapping.resolvedKeys,
    mappedCandidates: mapping.candidates.length,
    skippedLeases: mapping.skipped,
    // D10 / Slice 6: owner-email coverage. If ownerVerified == 0, the owner email is NOT in the
    // export read at any known path -> Slice 6 draft_create stays gated (data dependency).
    ownerChannel: {
      verified: ownerVerified,
      of: views.length,
      resolvingPaths: [...ownerPaths].sort(),
      missingReasons: [...ownerMissing].sort(),
    },
    tenantChannel: {
      verified: tenantVerified,
      of: views.length,
      resolvingPaths: [...tenantPaths].sort(),
      missingReasons: [...tenantMissing].sort(),
    },
    // Where any email-shaped value sits in the export row (paths only) — the discovery signal for D10.
    emailLikePaths,
    isoDatePaths,
    pathCoverage,
    exportRowPathCount: allPaths.length,
    exportRowPaths: allPaths,
  };

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "field-discovery.json"), JSON.stringify(proof, null, 2), "utf8");

  console.log(`RentVine field discovery (LIVE) — host ${host}, account ${account}`);
  console.log(`Scanned export rows: ${rawRows.length} (lease views: ${views.length})`);
  console.log(`Resolved rent/date keys (F-LEASE-3): ${JSON.stringify(mapping.resolvedKeys)}`);
  console.log(
    `Mapped candidates: ${mapping.candidates.length} (skipped ${mapping.skipped})`,
  );
  console.log(
    `OWNER channel (D10 -> Slice 6): ${ownerVerified}/${views.length} verified; paths=${JSON.stringify(
      [...ownerPaths].sort(),
    )}; missing=${JSON.stringify([...ownerMissing].sort())}`,
  );
  console.log(
    `TENANT channel (F-LEASE-3): ${tenantVerified}/${views.length} verified; paths=${JSON.stringify(
      [...tenantPaths].sort(),
    )}`,
  );
  console.log(`Email-shaped paths on export row: ${JSON.stringify(emailLikePaths)}`);
  console.log("Path coverage across all rows (present/emailLike/of):");
  for (const [path, cov] of Object.entries(pathCoverage)) {
    console.log(`  - ${path}: present=${cov.present} emailLike=${cov.emailLike} of=${cov.of}`);
  }
  console.log(`Export row path count: ${allPaths.length}`);
  console.log(`Shape-only proof written to ${join(artifactDir, "field-discovery.json")} (gitignored).`);
  console.log(
    "WRITE endpoint (D18 -> Slice 9): not probed. The read client is GET-only by contract; a documented RentVine write endpoint + semantics are required before any write flip. Flagged for AM owner confirmation.",
  );
}

// tsx compiles this as CommonJS (no TLA); the pending promise keeps the loop alive for process.exitCode.
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
