// S238 R-S238-2 isolated journey: the server process's only provider boundary. Loaded with
// `node --import` into the local Next dev server and every child it starts. RentVine reads for the
// pmikcmetro account are answered from synthetic rows below; every other non-loopback connection is
// refused and logged, so no live provider, Google API or metadata server can be reached. Nothing
// here writes anywhere except the refusal log (and, once a driver arms the S284 W12-05 write
// fault, that fault's own marker file in the run directory).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";

import { installFirestoreFault } from "../../scripts/lib/one-path-rehearsal/firestore-fault.mjs";
import {
  centralBusinessDate,
  loadNovember5Mix,
  mixSheetFixture,
  readNovember5Mix,
  rentvineStandInResponse,
} from "../../scripts/lib/one-path-rehearsal/november-5-mix.mjs";

const LOG = process.env.NOVDEC_JOURNEY_NETWORK_LOG;
const FIRESTORE_FAULT = process.env.ONE_PATH_REHEARSAL_FIRESTORE_FAULT;
// S232 R-S232-5: while this file exists, the RentVine read of the path it names (for example
// `leases/statuses`) fails as an outage would. The browser script writes and removes it; this
// module only reads it.
const OUTAGE = process.env.NOVDEC_JOURNEY_OUTAGE_FLAG;
const outagePath = () =>
  OUTAGE && existsSync(OUTAGE) ? readFileSync(OUTAGE, "utf8").trim() : null;
const RENTVINE_HOST = "pmikcmetro.rentvine.com";
const record = (entry) => {
  if (LOG)
    appendFileSync(
      LOG,
      `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...entry })}\n`,
    );
};
const loopback = (host) =>
  !host ||
  host === "localhost" ||
  host === "::1" ||
  host.startsWith("127.") ||
  host === "0.0.0.0";

// Synthetic leases only: one ending in November 2026 and one in December 2026 (America/Chicago),
// and a November lease with a move-out notice for the S232 issue resolvers.
const LEASES = [
  {
    lease: {
      leaseID: 4821,
      startDate: "2025-12-01",
      endDate: "2026-11-30",
      leaseType: "Fixed Term",
      leaseStatusID: 1,
      tenants: [{ name: "Sam Example" }, { name: "Riley Example" }],
    },
    property: {
      name: "Example Court",
      streetNumber: "4821",
      streetName: "Example Ct",
      address2: "Unit 2",
    },
    portfolio: { portfolioID: 91, owners: [{ name: "Avery Owner" }] },
    unit: { rent: "1250.00", beds: 2, fullBaths: 1, postalCode: "64118" },
  },
  {
    lease: {
      leaseID: 5001,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      leaseType: "Fixed Term",
      leaseStatusID: 1,
      // S233 R-S233-9: a verified tenancy (unit and tenant contact ids), so notice safety can read
      // ready and the owner composer's Schedule reaches the server.
      tenants: [{ name: "Casey Example", contactID: 7001 }],
    },
    property: { name: "Sample Place", streetNumber: "5001", streetName: "Sample Pl" },
    // S233 R-S233-9: a reserved, undeliverable owner address, so the owner composer can address it.
    portfolio: {
      portfolioID: 92,
      owners: [{ name: "Jordan Owner", email: "jordan.owner@example.invalid" }],
    },
    unit: { unitID: 5002, rent: "1400.00", beds: 3, fullBaths: 2, postalCode: "64116" },
  },
  {
    lease: {
      leaseID: 6001,
      startDate: "2025-11-21",
      endDate: "2026-11-20",
      leaseType: "Fixed Term",
      // S232 R-S232-5: notice given 26 days before the lease end, so the notice timing names the
      // Admin basis while none is recorded and the non-renewal handoff once one is.
      leaseStatusID: 2,
      noticeDate: "2026-10-25",
      expectedMoveOutDate: "2026-11-20",
      tenants: [{ name: "Morgan Example", contactID: 7101 }],
    },
    property: { name: "Notice Row", streetNumber: "6001", streetName: "Notice Row" },
    portfolio: { portfolioID: 93, owners: [{ name: "Quinn Owner" }] },
    unit: { unitID: 6002, rent: "1300.00", beds: 2, fullBaths: 1, postalCode: "64119" },
  },
];

function detail(row) {
  const lease = row.lease;
  const base = Number(String(row.unit.rent).replace(/[$,\s]/g, ""));
  const propertyID = SHEET_FIXTURE?.rentvinePropertyIds?.[String(lease.leaseID)];
  return {
    leaseID: lease.leaseID,
    ...(propertyID === undefined ? {} : { propertyID }),
    startDate: lease.startDate,
    endDate: lease.endDate,
    baseRentAmount: base,
    rentAmount: base,
    isMonthToMonth: "0",
    monthToMonthStartDate: null,
    hasPendingMonthToMonthConversion: false,
    leaseStatusID: lease.leaseStatusID ?? 1,
    noticeDate: lease.noticeDate ?? null,
    expectedMoveOutDate: lease.expectedMoveOutDate ?? null,
    moveOutDate: null,
  };
}

// S254 R-S254-2: the one-path rehearsal's opt-in desk. Only while ONE_PATH_REHEARSAL_MIX names the
// "November 5 mix" data file (tests/fixtures/lease-renewal/november-5-mix.json) are RentVine reads
// answered from its 38 synthetic leases, with every date shifted by whole months to today's
// Central business date, and does the Sheet stand-in below serve its rows. While the file
// ONE_PATH_REHEARSAL_RENTVINE_CONTROL names exists, its flags apply to each read: the recorded
// cycle dates in place of the current ones, or one lease's status made unreadable. Unset, every
// response is exactly the three-lease one above. Reads only, as ever.
const MIX_FIXTURE = process.env.ONE_PATH_REHEARSAL_MIX
  ? readNovember5Mix(process.env.ONE_PATH_REHEARSAL_MIX)
  : null;
const MIX_CONTROL = process.env.ONE_PATH_REHEARSAL_RENTVINE_CONTROL;
let loadedMix = null;
function mix() {
  const date = process.env.ONE_PATH_REHEARSAL_BUSINESS_DATE || centralBusinessDate();
  if (loadedMix?.businessDate !== date) loadedMix = loadNovember5Mix(MIX_FIXTURE, date);
  return loadedMix;
}
function mixFlags() {
  if (!MIX_CONTROL || !existsSync(MIX_CONTROL)) return {};
  try {
    return JSON.parse(readFileSync(MIX_CONTROL, "utf8"));
  } catch {
    return {};
  }
}
// S284 W12-03 (test-only): RentVine answering one read path slowly, as a large account's export
// does. The control file's `rentvineLatency` flag ({ path, ms }) delays that path by at most 5 s.
function rentvineLatencyMs(path) {
  if (!MIX_FIXTURE) return 0;
  const latency = mixFlags().rentvineLatency;
  return latency && latency.path === path
    ? Math.min(5000, Math.max(0, Number(latency.ms) || 0))
    : 0;
}

function rentvine(url) {
  if (MIX_FIXTURE) return rentvineStandInResponse(mix(), url, mixFlags()).body;
  const path = url.pathname.replace(/^\/api\/manager\//, "").replace(/\/$/, "");
  if (path === "leases/export") {
    const page = Number(url.searchParams.get("page") ?? 1);
    return page === 1 ? LEASES : [];
  }
  if (path === "leases/statuses")
    return [
      {
        leaseStatus: {
          leaseStatusID: 1,
          name: "Active",
          primaryLeaseStatusID: 2,
          isPendingMoveOutStatus: 0,
          isCompletedMoveOutStatus: 0,
        },
      },
      {
        leaseStatus: {
          leaseStatusID: 2,
          primaryLeaseStatusID: 2,
          name: "Notice Given",
          isPendingMoveOutStatus: 1,
          isCompletedMoveOutStatus: 0,
        },
      },
    ];
  const charges = path.match(/^leases\/(\d+)\/recurring-charges$/);
  if (charges) return [];
  const one = path.match(/^leases\/(\d+)$/);
  if (one) {
    const row = LEASES.find((entry) => String(entry.lease.leaseID) === one[1]);
    if (row)
      return url.searchParams.get("includes") === "tenants"
        ? { lease: { ...detail(row), tenants: [] } }
        : { lease: detail(row) };
  }
  return undefined;
}

// Synthetic Google sign-in and an operating Sheet with only its header row (the generic question
// strings of tests/fixtures/lease-renewal/synthetic-renewal-sheet.ts), so the desk reads no rows.
const GOOGLE_HOSTS = new Set([
  "oauth2.googleapis.com",
  "iamcredentials.googleapis.com",
  "sheets.googleapis.com",
]);
const HEADER = [
  "Have we confirmed pricing with the owner?",
  "Have we sent the renewal letter?",
  "What is the Lease/Tenant name?",
  "Renewal Date",
  "Current Rent",
  "Market Value",
  "Is this renewal completed?",
  "Have they responded if they are renewing or not?",
  "Have we sent the google form to gather info?",
  "Have they filled out the form?",
  "Have the lease docs been sent out",
  "If they have a rhino policy is it renewed?",
  "Have they registered their pet if needed?",
  "Have all documents been signed electronically?",
  "Have we verified that we are added as additional insured?",
  "Have we added the $11.95 charge to their ledger starting on the renewal date?",
  "Have we added them to the inspection sheet if needed?",
  "Did we set up their Air filter delivery",
  "did we get proof that utilities are set up if need be?",
];
// S243 R-S243-6: the help rehearsal's opt-in synthetic Sheet. Only while this names a JSON file
// (scripts/lib/help-rehearsal-sheet.json) does the Sheet serve that file's rows after the header
// and does each lease detail above carry the file's synthetic property id, which the lease-to-row
// resolution requires. Unset, every response is exactly the header-only one. Reads only, as ever.
const SHEET_FIXTURE = process.env.HELP_REHEARSAL_SHEET_FIXTURE
  ? readSheetFixture(process.env.HELP_REHEARSAL_SHEET_FIXTURE)
  : null;
function readSheetFixture(path) {
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  for (const row of fixture.rows ?? [])
    if (
      !Array.isArray(row.cells) ||
      row.cells.length !== HEADER.length ||
      row.cells.some((cell) => typeof cell !== "string")
    )
      throw new Error(
        `The help rehearsal Sheet row for ${row.leaseId} must fill the header.`,
      );
  return fixture;
}
// The Sheet this process serves: the one-path mix's rows while that desk is loaded, otherwise the
// help rehearsal's opt-in rows, otherwise none.
function sheetFixture() {
  if (!MIX_FIXTURE) return SHEET_FIXTURE;
  // S284 (test-only): the control file's `sheetCells` flag serves named cells of existing rows.
  const sheet = mixSheetFixture(mix(), mixFlags());
  for (const row of sheet.rows)
    if (!Array.isArray(row.cells) || row.cells.length !== HEADER.length)
      throw new Error(`The mix Sheet row for ${row.leaseId} must fill the header.`);
  return sheet;
}
// The grid layer of the opt-in Sheet: each row's RentVine link attached to its cell, no notes.
function sheetRowData(rows) {
  return [HEADER, ...rows.map((row) => row.cells)].map((cells, rowIndex) => ({
    values: cells.map((_, column) => {
      const link = rows[rowIndex - 1]?.link;
      return link?.column === column
        ? {
            hyperlink: link.url,
            textFormatRuns: [{ startIndex: 0, format: { link: { uri: link.url } } }],
          }
        : {};
    }),
  }));
}
function google(host, method, url) {
  if (host === "oauth2.googleapis.com" && url.pathname === "/token")
    return {
      access_token: "synthetic-journey-token",
      expires_in: 3600,
      token_type: "Bearer",
    };
  if (host === "iamcredentials.googleapis.com" && url.pathname.endsWith(":signJwt"))
    return { keyId: "synthetic-journey", signedJwt: "synthetic.journey.jwt" };
  if (host === "sheets.googleapis.com" && method === "GET") {
    const sheet = sheetFixture();
    if (url.pathname.endsWith("/values:batchGet"))
      return {
        valueRanges: url.searchParams.getAll("ranges").map((range) => ({
          range,
          majorDimension: "ROWS",
          // Both value render options read the same text: no opt-in cell holds a formula.
          values: [HEADER, ...(sheet?.rows ?? []).map((row) => row.cells)],
        })),
      };
    if (/^\/v4\/spreadsheets\/[^/]+$/.test(url.pathname))
      return {
        sheets: [
          {
            properties: { sheetId: 0, title: "Lease Renewal" },
            data: [{ rowData: sheet ? sheetRowData(sheet.rows ?? []) : [] }],
          },
        ],
      };
  }
  return undefined;
}
const respond = (body) =>
  body === undefined
    ? new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    : new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

// The Google auth library sends through node-fetch (https.request); those requests go to this
// loopback stand-in instead of the network.
const stand = http.createServer((request, response) => {
  const [, host, ...rest] = request.url.split("/");
  const url = new URL(`https://${host}/${rest.join("/")}`);
  request.resume();
  request.on("end", () => {
    const body = google(host, request.method, url);
    record({
      served: "google",
      host,
      method: request.method,
      path: url.pathname,
      found: body !== undefined,
    });
    response.writeHead(body === undefined ? 404 : 200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(body ?? { error: "not found" }));
  });
});
stand.listen(0, "127.0.0.1");
stand.unref();
const realHttpsRequest = https.request;
https.request = function guardedHttpsRequest(input, options, callback) {
  const url =
    typeof input === "string" || input instanceof URL
      ? new URL(String(input))
      : new URL(`https://${input.hostname ?? input.host}${input.path ?? "/"}`);
  if (!GOOGLE_HOSTS.has(url.hostname)) return realHttpsRequest.apply(this, arguments);
  const settings = typeof input === "string" || input instanceof URL ? options : input;
  const done = typeof options === "function" ? options : callback;
  return http.request(
    {
      host: "127.0.0.1",
      port: stand.address().port,
      path: `/${url.hostname}${url.pathname}${url.search}`,
      method: settings?.method ?? "GET",
      headers: settings?.headers,
    },
    done,
  );
};

// S254: the one-path rehearsal's comparison stand-in. Only while ONE_PATH_REHEARSAL_STAND_IN_ORIGIN
// names the rehearsal's own stand-in process on 127.0.0.1 are RentCast reads answered there; unset,
// that host is refused and logged like every other.
const RENTCAST_HOST = "api.rentcast.io";
const STAND_IN = process.env.ONE_PATH_REHEARSAL_STAND_IN_ORIGIN;
if (STAND_IN && !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(STAND_IN))
  throw new Error("The one-path stand-in origin must be http://127.0.0.1 with a port.");

const realFetch = globalThis.fetch;
globalThis.fetch = async function guardedFetch(input, init) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.hostname === RENTVINE_HOST) {
    if ((init?.method ?? "GET").toUpperCase() !== "GET") {
      record({ refused: "rentvine_write", path: url.pathname });
      throw new TypeError("The isolated journey refuses every RentVine write.");
    }
    const path = url.pathname.replace(/^\/api\/manager\//, "").replace(/\/$/, "");
    if (path === outagePath()) {
      record({ served: "rentvine", path: url.pathname, outage: true });
      return new Response(JSON.stringify({ error: "synthetic outage" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    const latency = rentvineLatencyMs(path);
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
    const body = rentvine(url);
    record({ served: "rentvine", path: url.pathname, found: body !== undefined });
    return body === undefined
      ? new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      : new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
  }
  if (GOOGLE_HOSTS.has(url.hostname)) {
    const method = (init?.method ?? "GET").toUpperCase();
    const body = google(url.hostname, method, url);
    record({
      served: "google",
      host: url.hostname,
      method,
      path: url.pathname,
      found: body !== undefined,
    });
    return respond(body);
  }
  if (STAND_IN && url.hostname === RENTCAST_HOST) {
    // S254: the comparison stand-in answers RentCast reads. Only the path and query are passed
    // on; no header, key or body leaves this process, and nothing but a read is answered.
    if ((init?.method ?? "GET").toUpperCase() !== "GET") {
      record({ refused: "rentcast_write", path: url.pathname });
      throw new TypeError("The comparison stand-in answers reads only.");
    }
    record({ served: "rentcast_stand_in", path: url.pathname });
    return realFetch(`${STAND_IN}/rentcast${url.pathname}${url.search}`, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
    });
  }
  if (!loopback(url.hostname)) {
    record({ refused: "fetch", host: url.hostname, path: url.pathname });
    throw new TypeError(
      `The isolated journey refuses network access to ${url.hostname}.`,
    );
  }
  return realFetch(input, init);
};

// Any other client (gRPC, Google auth, metadata server) reaches the network through a socket.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  // net.createConnection forwards Node's normalized [options, callback] array to Socket.connect.
  // Inspect its actual destination before the original implementation can begin DNS or connect.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options =
    typeof first === "object" && first !== null
      ? first
      : { port: first, host: typeof args[1] === "string" ? args[1] : undefined };
  const host = options.host ?? options.path ?? "localhost";
  if (!options.path && !loopback(String(host))) {
    record({ refused: "socket", host: String(host), port: options.port ?? null });
    const error = new Error(`The isolated journey refuses network access to ${host}.`);
    error.code = "ECONNREFUSED";
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return connect.apply(this, args);
};

if (
  globalThis.fetch?.name !== "guardedFetch" ||
  net.Socket.prototype.connect.name !== "guardedConnect"
)
  throw new Error("The rehearsal network guard could not be installed.");
Object.defineProperty(globalThis, Symbol.for("pmi-kc.rehearsal-network-guard"), {
  value: net.Socket.prototype.connect,
});
record({ event: "network_guard_ready" });

// S284 W12-05 (S276 AC-S276-3), harness only: the rehearsal server alone names a one-shot
// Firestore write fault file (scripts/lib/one-path-rehearsal/firestore-fault.mjs). It writes
// nothing and refuses nothing unless a driver arms it through the control hook.
if (FIRESTORE_FAULT) installFirestoreFault(FIRESTORE_FAULT, record);
