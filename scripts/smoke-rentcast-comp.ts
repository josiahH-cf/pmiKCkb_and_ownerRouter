// S59 controlled RentCast smoke (AC-S59-1): exactly ONE live AVM call for ONE operator-supplied
// address, printing the resolved range, comp count, and source. Writes nothing durable. This is an
// operator-run CLI, not a product request path — the Action Registry governs what the APPLICATION
// may do on a user's behalf; this reviewed script is how the `evidence_status:"Documented"`
// justification for the gate flip is produced in the first place (spec §controlled-smoke).
//
// KEY HANDLING: the RentCast key is read from Secret Manager AT RUNTIME over ADC and held in memory
// only. It is never read from a file, never passed on a command line, never printed, and never
// written anywhere. A --dry run prints the plan and makes no call.
//
//   npm run smoke:rentcast-comp -- --address "<street, city, state zip>"          # dry by default
//   npm run smoke:rentcast-comp -- --address "..." --live                         # ONE billable call
//   optional: --bedrooms 3 --bathrooms 2 --trend   (--trend adds ONE /markets call for the zip)

import { GoogleAuth } from "google-auth-library";

import { RentCastMarketCompProvider } from "../lib/lease-renewal/providers/rentcast-market-comp-provider";

const PROJECT_ID = "pmi-kc-kb-prod";
const SECRET_NAME = "RENTCAST_API_KEY";

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

/** Access the key via Secret Manager REST over ADC. In memory only; never logged or persisted. */
async function accessRentcastKey(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const url = `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest:access`;
  const response = await client.request<{ payload?: { data?: string } }>({ url });
  const data = response.data.payload?.data;
  if (!data) {
    throw new Error(
      `Secret Manager returned no payload for ${SECRET_NAME}. Confirm the secret exists and ADC may read it.`,
    );
  }
  return Buffer.from(data, "base64").toString("utf8").trim();
}

async function main(): Promise<void> {
  const address = readArg("--address");
  const live = hasArg("--live");
  const trend = hasArg("--trend");
  const bedrooms = readArg("--bedrooms");
  const bathrooms = readArg("--bathrooms");

  if (!address) {
    console.error(
      'Pass --address "<street, city, state zip>". The address is used for the one lookup and never stored.',
    );
    process.exitCode = 1;
    return;
  }

  if (!live) {
    console.log(
      `RentCast comp smoke (DRY). Would read ${SECRET_NAME} from Secret Manager over ADC, make ONE billable /avm/rent/long-term call for the supplied address${trend ? " plus ONE /markets trend call for its zip" : ""}, print counts and the range, and write nothing. Pass --live to run it.`,
    );
    return;
  }

  const apiKey = await accessRentcastKey();
  const provider = new RentCastMarketCompProvider({ apiKey });
  const result = await provider.lookup({
    addressLabel: address,
    ...(bedrooms ? { bedrooms: Number(bedrooms) } : {}),
    ...(bathrooms ? { bathrooms: Number(bathrooms) } : {}),
  });

  console.log("RentCast comp smoke (LIVE) — one AVM call, no durable writes:");
  console.log(
    JSON.stringify(
      {
        source: result.source,
        confidence: result.confidence,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
        ...(result.rangeLow !== undefined ? { rangeLow: result.rangeLow } : {}),
        ...(result.rangeHigh !== undefined ? { rangeHigh: result.rangeHigh } : {}),
        ...(result.pointEstimate !== undefined
          ? { pointEstimate: result.pointEstimate }
          : {}),
        ...(result.compCount !== undefined ? { compCount: result.compCount } : {}),
        billed: result.billed === true,
        retrievedAt: result.retrievedAt,
        topCompCorrelations: (result.comparables ?? [])
          .slice(0, 5)
          .map((comp) => comp.correlation),
      },
      null,
      2,
    ),
  );

  if (trend) {
    const zipMatch = address.match(/(\d{5})(?:-\d{4})?\s*$/);
    if (!zipMatch) {
      console.error(
        "No 5-digit zip found at the end of the address; skipping the trend call.",
      );
      return;
    }
    const trendResult = await provider.lookupTrend(zipMatch[1]);
    const months = Object.keys(trendResult.history ?? {}).sort();
    console.log("RentCast trend smoke (LIVE) — one /markets call:");
    console.log(
      JSON.stringify(
        {
          source: trendResult.source,
          confidence: trendResult.confidence,
          ...(trendResult.reason ? { reason: trendResult.reason } : {}),
          zipCode: trendResult.zipCode,
          historyMonths: months.length,
          firstMonth: months[0],
          lastMonth: months[months.length - 1],
          billed: trendResult.billed === true,
        },
        null,
        2,
      ),
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
