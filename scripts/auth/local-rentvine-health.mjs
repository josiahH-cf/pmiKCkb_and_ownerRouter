import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";

/** Verify the ignored configuration actually used by this host, without copying or echoing it. */
export async function checkLocalRentVine({ configRoot, createClient } = {}) {
  if (!configRoot) throw new Error("registered_configuration_unavailable");
  const env = parseEnv(await readFile(join(configRoot, ".env.local"), "utf8"));
  const { RentVineClient, createFetchTransport, assertRentVineAccount } =
    await import("../../lib/integrations/rentvine/client.ts");
  assertRentVineAccount(env.RENTVINE_API_BASE_URL, "pmikcmetro");
  if (!env.RENTVINE_API_KEY?.trim() || !env.RENTVINE_API_SECRET?.trim())
    throw new Error("local_rentvine_credentials_missing");
  const credentials = {
    baseUrl: env.RENTVINE_API_BASE_URL,
    apiKey: env.RENTVINE_API_KEY,
    apiSecret: env.RENTVINE_API_SECRET,
  };
  const client = createClient
    ? createClient(credentials)
    : new RentVineClient(credentials, createFetchTransport({ timeoutMs: 15_000 }));
  const rows = await client.listLeaseStatuses();
  return {
    state: "ok",
    detail: `The registered ignored local configuration authenticated to the approved account (${rows.length} lease statuses). No credential values, leases or writes were used as output.`,
  };
}
