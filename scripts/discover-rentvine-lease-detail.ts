#!/usr/bin/env tsx
// BODYLESS read-only RentVine lease-detail discovery (S102/S103 grounding, 2026-09-03).
//
// Reports key paths and value TYPES for a bounded sample of leases across the documented reads
// `GET /leases/export`, `GET /leases/{leaseID}`, and `GET /leases/{leaseID}/recurring-charges`
// (with the `account` include). It never prints a value, id, name, address, email, or amount;
// strings are reduced to shape classes (isoDate / numeric / empty / string) and account identity
// to the boolean `isRent` presence. It makes no write. Requires the live `.env.local` RentVine
// bindings; run with `npx tsx scripts/discover-rentvine-lease-detail.ts`.
import { readFileSync } from "node:fs";
import { buildLiveRenewalConfig } from "../lib/lease-renewal/live-config";
import { leaseExportRowId } from "../lib/integrations/rentvine/client";

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
function shape(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (Array.isArray(value))
    return [
      `array(${value.length})`,
      value.length ? shape(value[0], depth + 1) : "empty",
    ];
  if (typeof value === "object") {
    if (depth > 3) return "object";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = shape(v, depth + 1);
    return out;
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "string:isoDate";
    if (/^-?\d+(\.\d+)?$/.test(value)) return "string:numeric";
    if (value.trim() === "") return "string:empty";
    return "string";
  }
  return typeof value;
}
async function main() {
  const config = buildLiveRenewalConfig(readEnv(".env.local"));
  if (!config.ok) throw new Error(`Live sources unavailable (${config.reason}).`);
  const client = config.rentvineClient as unknown as {
    listLeasesExport(
      p?: Record<string, string | number>,
    ): Promise<Record<string, unknown>[]>;
    getLease(id: string): Promise<Record<string, unknown>>;
    rawGet(
      path: string,
      params?: Record<string, string | number>,
    ): Promise<{ status: number; json(): Promise<unknown> }>;
  };
  const rows = await client.listLeasesExport({ page: 1, pageSize: 3 });
  console.log("export rows:", rows.length);
  console.log("export row shape:", JSON.stringify(shape(rows[0]), null, 1));
  const ids = rows
    .map((r) => leaseExportRowId(r))
    .filter((x): x is string => !!x)
    .slice(0, 2);
  for (let i = 0; i < ids.length; i++) {
    const lease = await client.getLease(ids[i]);
    console.log(`lease[${i}] detail keys:`, JSON.stringify(shape(lease), null, 1));
    const res = await client.rawGet(`leases/${ids[i]}/recurring-charges`, {
      includes: "account",
    });
    const body = (await res.json()) as unknown;
    console.log(
      `lease[${i}] recurring-charges status`,
      res.status,
      "shape:",
      JSON.stringify(shape(body), null, 1),
    );
    if (Array.isArray(body)) {
      for (const el of body as Record<string, unknown>[]) {
        const acct = (el.account ??
          (el.recurringCharge as Record<string, unknown> | undefined)?.["account"]) as
          | Record<string, unknown>
          | undefined;
        const rc = (el.recurringCharge ?? el) as Record<string, unknown>;
        const name =
          typeof acct?.name === "string"
            ? acct.name
            : typeof acct?.accountName === "string"
              ? acct.accountName
              : "";
        console.log(
          `  charge: recurringStatusID=${String(rc.recurringStatusID)} accountNameLooksLikeRent=${/rent/i.test(name)} accountKeys=${acct ? Object.keys(acct).join(",") : "none"}`,
        );
      }
    }
  }
}
main().catch((e) => {
  console.error("probe failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
