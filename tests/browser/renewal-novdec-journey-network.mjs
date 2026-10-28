// S238 R-S238-2 isolated journey: the server process's only provider boundary. Loaded with
// `node --import` into the local Next dev server and every child it starts. RentVine reads for the
// pmikcmetro account are answered from synthetic rows below; every other non-loopback connection is
// refused and logged, so no live provider, Google API or metadata server can be reached. Nothing
// here writes anywhere except the refusal log.
import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const LOG = process.env.NOVDEC_JOURNEY_NETWORK_LOG;
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

// Synthetic leases only: one ending in November 2026 and one in December 2026 (America/Chicago).
const LEASES = [
  {
    lease: {
      leaseID: 4821,
      startDate: "2025-12-01",
      endDate: "2026-11-30",
      leaseType: "Fixed Term",
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
];

function detail(row) {
  const lease = row.lease;
  const base = Number(String(row.unit.rent).replace(/[$,\s]/g, ""));
  return {
    leaseID: lease.leaseID,
    startDate: lease.startDate,
    endDate: lease.endDate,
    baseRentAmount: base,
    rentAmount: base,
    isMonthToMonth: "0",
    monthToMonthStartDate: null,
    hasPendingMonthToMonthConversion: false,
    leaseStatusID: 1,
    noticeDate: null,
    expectedMoveOutDate: null,
    moveOutDate: null,
  };
}

function rentvine(url) {
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
          isPendingMoveOutStatus: 0,
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
    if (url.pathname.endsWith("/values:batchGet"))
      return {
        valueRanges: url.searchParams.getAll("ranges").map((range) => ({
          range,
          majorDimension: "ROWS",
          values: [HEADER],
        })),
      };
    if (/^\/v4\/spreadsheets\/[^/]+$/.test(url.pathname))
      return {
        sheets: [
          { properties: { sheetId: 0, title: "Lease Renewal" }, data: [{ rowData: [] }] },
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
    record({ served: "google", host, path: url.pathname, found: body !== undefined });
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
    const body = google(url.hostname, (init?.method ?? "GET").toUpperCase(), url);
    record({
      served: "google",
      host: url.hostname,
      path: url.pathname,
      found: body !== undefined,
    });
    return respond(body);
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
  const options =
    typeof args[0] === "object" && args[0] !== null
      ? args[0]
      : { port: args[0], host: args[1] };
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
