// S271 R-S271-2, R-S271-4, R-S271-5 and R-S271-6. The November 10 journey driver: N10-01 to
// N10-05 and N10-07 to N10-10 (never N10-06, the human read-through) on one guarded rehearsal.
// Each row is bound to the served source and the compiled build id; the verdict module scores the
// cumulative matrix and, separately, the Thursday core. Evidence stays in the private run dir.
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --compiled --compiled-synthetic-mail \
//     --driver tests/browser/one-path-november-10-qualification-driver.mjs -- \
//     --baseline ~/.local/state/pmi-kc-one-path-rehearsal/<baseline run>/november-10-baseline.json
//
// `--only N10-01,N10-03` runs a subset for diagnosis; such a run is never a complete matrix.
import assert from "node:assert/strict";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  REHEARSAL_STATE_DIR,
  readRehearsal,
  refusedConnections,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  NOVEMBER_5_MIX_PATH,
  loadNovember5Mix,
  readNovember5Mix,
  shiftMixDate,
  summarizeNovember5Mix,
} from "../../scripts/lib/one-path-rehearsal/november-5-mix.mjs";
import {
  journeyN1001,
  journeyN1002,
  journeyN1003,
} from "./one-path-november-10-core-journeys.mjs";
import {
  journeyN1009,
  journeyN1010,
} from "./one-path-november-10-follow-on-journeys.mjs";
import { journeyN1007, journeyN1008 } from "./one-path-november-10-guided-journeys.mjs";
import { WIDE, addDays, createKit } from "./one-path-november-10-kit.mjs";
import { journeyN1004, journeyN1005 } from "./one-path-november-10-offer-journeys.mjs";
import {
  THURSDAY_CASES,
  novemberTenMatrixVerdict,
} from "./one-path-november-10-qualification-verdict.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
const rehearsal = readRehearsal(runDir);
const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
assert.equal(rehearsal.servedVersion, rehearsal.servedCommit);
assert.equal(
  rehearsal.mailAdapter,
  true,
  "The journeys need the rehearsal mail adapter.",
);

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
/** The recorded R-S271-1 baseline, from a private rehearsal run directory only. */
function readBaseline(path) {
  if (!path) return null;
  const file = realpathSync(path);
  assert.ok(
    file.startsWith(realpathSync(REHEARSAL_STATE_DIR) + "/") &&
      file.endsWith("/november-10-baseline.json"),
    "Use the recorded november-10-baseline.json from a private rehearsal run.",
  );
  const baseline = JSON.parse(readFileSync(file, "utf8"));
  assert.match(String(baseline.source), /^[a-f0-9]{40}$/);
  assert.ok(Array.isArray(baseline.results) && baseline.results.length > 0);
  return { ...baseline, file };
}
const baseline = readBaseline(argument("--baseline"));
const only = argument("--only")?.split(",").filter(Boolean) ?? null;

const compiled =
  readFileSync(join(runDir, "rehearsal-log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((entry) => entry.event === "compiled") ?? null;
// Every row names the served source and, on a compiled build, its build id (ARCH-S271-2).
const binding = {
  source: rehearsal.servedVersion,
  ...(compiled ? { buildId: compiled.buildId } : {}),
};
const report = join(runDir, "s271-journeys.jsonl");
const record = (entry) => {
  appendFileSync(report, JSON.stringify(entry) + "\n");
  process.stdout.write(JSON.stringify(entry).slice(0, 2000) + "\n");
};

// The served fixture rows the journeys reason about, read from the same file the transport serves.
const mix = loadNovember5Mix(
  readNovember5Mix(join(process.cwd(), NOVEMBER_5_MIX_PATH)),
  rehearsal.businessDate,
);
const leaseOf = (leaseId) => {
  const row = mix.leases.find((entry) => entry.lease.leaseID === Number(leaseId));
  const startDate = row.lease.startDate;
  return {
    leaseId: Number(leaseId),
    startDate,
    endDate: row.lease.endDate,
    rent: Number(row.unit.rent),
    secondPetStart: shiftMixDate(startDate, 2),
    endedPetEnd: addDays(shiftMixDate(startDate, 6), -1),
  };
};
const leases = Object.fromEntries(
  Object.entries(rehearsal.roles).map(([role, leaseId]) => [role, leaseOf(leaseId)]),
);
const ctx = {
  rehearsal,
  origin,
  record,
  leases,
  voucherLeaseId: summarizeNovember5Mix(mix).assistanceWordingLeaseIds[0],
  kit: createKit({ rehearsal, origin }),
};

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
const results = [];

async function journey(id, { role = "Editor", allow = [], failFirst = [] }, check) {
  if (only && !only.includes(id)) return;
  const context = await browser.newContext({
    viewport: WIDE,
    colorScheme: "light",
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  // A development server compiles each route on first use; a compiled build answers at once.
  page.setDefaultTimeout(rehearsal.compiled ? 20_000 : 60_000);
  page.setDefaultNavigationTimeout(120_000);
  const mutations = [];
  const refusals = [];
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue();
    if (url.pathname === "/api/auth/demo") return route.continue();
    mutations.push(url.pathname);
    if (allow.includes(url.pathname)) return route.continue();
    refusals.push(url.pathname);
    return route.abort("blockedbyclient");
  });
  const boundaryBefore = refusedConnections(rehearsal).length;
  const started = Date.now();
  try {
    await ctx.kit.open(page, "/sign-in");
    await ctx.kit.signIn(page, role);
    const answer = await check(ctx, page, mutations);
    assert.deepEqual(refusals, [], "Unexpected mutation attempts");
    const { failFirst: verified = [], ...observed } = answer;
    observed.attemptedLiveEffects = refusedConnections(rehearsal).length - boundaryBefore;
    const claims = [...failFirst, ...verified];
    const row = {
      id,
      verdict: observed.missing ? "UNVERIFIED" : "Yes",
      role,
      ...binding,
      observed,
      ...(claims.length ? { failFirst: claims } : {}),
      mutations: [...new Set(mutations)],
      seconds: Math.round((Date.now() - started) / 1000),
    };
    results.push(row);
    record(row);
  } catch (error) {
    const row = {
      id,
      verdict: "No",
      role,
      ...binding,
      reason: String(error).slice(0, 900),
      checkpoint:
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((line) => /one-path-november-10-/.test(line))
              .slice(0, 3)
              .map((line) => line.trim())
          : undefined,
      refusals,
      seconds: Math.round((Date.now() - started) / 1000),
    };
    results.push(row);
    record(row);
    await page
      .screenshot({ path: join(runDir, id + "-failure.png") })
      .catch(() => undefined);
  } finally {
    await context.close();
  }
}

const LEASE = "/api/lease-renewal/";
try {
  await journey("N10-07", { allow: [LEASE + "working-record"] }, journeyN1007);
  await journey(
    "N10-08",
    { allow: ["/api/gmail-hub/sequences", LEASE + "message-preparation"] },
    async (context, page, mutations) => {
      const observed = await journeyN1008(context, page, mutations);
      return observed.openOnEntry === 0
        ? { ...observed, failFirst: ["Secondary Work groups open on Guided entry"] }
        : observed;
    },
  );
  await journey(
    "N10-09",
    { allow: [LEASE + "working-record", LEASE + "workspace", LEASE + "work-status"] },
    journeyN1009,
  );
  await journey(
    "N10-03",
    {
      allow: [
        LEASE + "working-record",
        LEASE + "refresh",
        LEASE + "workspace",
        LEASE + "message-preparation",
        "/api/gmail-hub/sequences",
      ],
      failFirst: [
        "Use the day after the current lease ends choice",
        "Return to tenant offer route",
      ],
    },
    journeyN1003,
  );
  await journey(
    "N10-04",
    {
      allow: [
        "/api/admin/offer-charge-mappings",
        LEASE + "message-preparation",
        LEASE + "working-record",
        LEASE + "workspace",
        LEASE + "refresh",
        "/api/gmail-hub/sequences",
      ],
      failFirst: [
        "Review offer charges in Offer the tenant",
        "Admin Offer charge mappings section",
      ],
    },
    journeyN1004,
  );
  await journey(
    "N10-05",
    {
      allow: [
        LEASE + "resource-locations",
        LEASE + "message-preparation",
        LEASE + "workspace",
        LEASE + "working-record",
        LEASE + "refresh",
        "/api/gmail-hub/sequences",
      ],
      failFirst: ["Tenant audience evidence on the tenant resource entries"],
    },
    journeyN1005,
  );
  await journey(
    "N10-02",
    {
      allow: [
        LEASE + "workspace",
        LEASE + "working-record",
        LEASE + "message-preparation",
        LEASE + "refresh",
        "/api/gmail-hub/sequences",
      ],
      failFirst: ["Amount approved field in the owner response"],
    },
    journeyN1002,
  );
  await journey(
    "N10-10",
    {
      allow: [
        "/api/admin/lease-artifact-family-use",
        "/api/admin/lease-charge-policy",
        LEASE + "packet-truth",
        LEASE + "filled-artifact",
        LEASE + "returned-state",
        LEASE + "workspace",
        LEASE + "packet-inputs",
      ],
      failFirst: ["Source pending handoff in Documents and signatures"],
    },
    journeyN1010,
  );
  await journey(
    "N10-01",
    {
      allow: [
        LEASE + "working-record",
        LEASE + "workspace",
        LEASE + "message-preparation",
        LEASE + "refresh",
      ],
      failFirst: ["Edit rent to recommend link in Ask the owner"],
    },
    journeyN1001,
  );
} finally {
  await browser.close();
  const networkRefusals = refusedConnections(rehearsal);
  const input = { run, rehearsal, compiled, networkRefusals, baseline };
  const cumulative = novemberTenMatrixVerdict({ ...input, results, scope: "cumulative" });
  const thursday = novemberTenMatrixVerdict({
    ...input,
    results: results.filter(({ id }) => THURSDAY_CASES.includes(id)),
    scope: "thursday",
  });
  const binding_ = {
    baseline: baseline ? { file: baseline.file, source: baseline.source } : null,
    only,
    compiledMail: rehearsal.compiledMail ?? null,
  };
  writeFileSync(
    join(runDir, "s271-verdict.json"),
    JSON.stringify({ ...cumulative, ...binding_ }, null, 2) + "\n",
  );
  writeFileSync(
    join(runDir, "s271-thursday-verdict.json"),
    JSON.stringify({ ...thursday, ...binding_ }, null, 2) + "\n",
  );
  record({
    outcome: cumulative.verdict,
    thursday: thursday.verdict,
    source: cumulative.source,
    buildId: cumulative.buildId,
    exact: cumulative.exact,
    networkRefusals: networkRefusals.length,
    rows: results.map(({ id, verdict }) => id + ":" + verdict).join(" "),
    human: cumulative.human,
  });
  if (!existsSync(join(runDir, "s271-verdict.json"))) process.exitCode = 1;
  process.exitCode = cumulative.verdict === "Yes" ? 0 : 1;
}
