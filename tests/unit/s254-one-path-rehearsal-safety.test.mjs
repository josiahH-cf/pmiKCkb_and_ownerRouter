import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  REHEARSAL_FILE,
  readRehearsal,
  refusedConnections,
  setComparisonAllowance,
  setRecordingCycles,
  setRentvineOutage,
  setStatusUnreadable,
  standInState,
} from "@/scripts/lib/one-path-rehearsal/control.mjs";
import {
  loadNovember5Mix,
  readNovember5Mix,
  rentvineStandInResponse,
} from "@/scripts/lib/one-path-rehearsal/november-5-mix.mjs";
import { SEED_STEPS, runSeeds } from "@/scripts/lib/one-path-rehearsal/seeds.mjs";

// S254 R-S254-4 / AC-S254-5 and S252 R-S252-2: the one-path rehearsal can reach nothing but
// itself. The static half is here; each run's refused-connection log is the runtime half.

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const launcher = read("scripts/run-renewal-one-path-rehearsal.sh");
const rehearsal = read("scripts/one-path-rehearsal.mjs");
const controlCli = read("scripts/one-path-rehearsal-control.mjs");
const controlLibrary = read("scripts/lib/one-path-rehearsal/control.mjs");
const standIns = read("scripts/lib/one-path-rehearsal/stand-ins.mjs");
const seeds = read("scripts/lib/one-path-rehearsal/seeds.mjs");
const preload = read("tests/browser/renewal-novdec-journey-network.mjs");
const smoke = read("tests/browser/one-path-smoke-driver.mjs");
const everyScript = {
  launcher,
  rehearsal,
  controlCli,
  controlLibrary,
  standIns,
  seeds,
  smoke,
};

const temporary = [];
const runDir = (description = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "s254-rehearsal-"));
  temporary.push(dir);
  writeFileSync(
    join(dir, REHEARSAL_FILE),
    JSON.stringify({
      origin: "http://localhost:3999",
      standInOrigin: "http://127.0.0.1:41234",
      firestoreEmulatorHost: "127.0.0.1:8123",
      projectId: "pmi-kc-kb-one-path-rehearsal-test",
      files: {
        rentvineControl: join(dir, "rentvine-control.json"),
        rentvineOutage: join(dir, "synthetic-rentvine-outage"),
        networkLog: join(dir, "network.jsonl"),
      },
      ...description,
    }),
  );
  return dir;
};
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("S254: the rehearsal runs only in a disposable worktree against loopback emulators", () => {
  it("the launcher checks a commit out under /tmp and keeps evidence in private local state", () => {
    expect(launcher).toMatch(
      /root=\$\(mktemp -d \/tmp\/pmi-kc-one-path-rehearsal-XXXXXX\)/,
    );
    expect(launcher).toMatch(
      /git -C "\$repo" worktree add --detach "\$root\/worktree" "\$served"/,
    );
    expect(launcher).toMatch(/state="\$HOME\/\.local\/state\/pmi-kc-one-path-rehearsal"/);
    expect(launcher).toMatch(/chmod 700 "\$state" "\$output"/);
    expect(launcher).toMatch(/trap cleanup EXIT/);
    expect(launcher).toMatch(
      /emulators:exec --only firestore,auth --project pmi-kc-kb-one-path-rehearsal-test/,
    );
  });

  it("the rehearsal process itself runs under the refusal preload", () => {
    expect(launcher).toContain(
      '"node --import ./tests/browser/renewal-novdec-journey-network.mjs scripts/one-path-rehearsal.mjs --managed$quoted"',
    );
    expect(launcher).toMatch(
      /NOVDEC_JOURNEY_NETWORK_LOG="\$output\/harness-network\.jsonl"/,
    );
    expect(rehearsal).toContain('["--import", `./${PRELOAD}`, driver, ...driverArgs]');
  });

  it("refuses a dirty tree unless the overlay is recorded, and records what it serves", () => {
    expect(launcher).toMatch(/Commit first, or pass --overlay/);
    for (const field of [
      '"served_sha":"%s"',
      '"harness_sha":"%s"',
      '"overlay":%s',
      '"named_commit":%s',
      '"harness_uncommitted":%s',
    ])
      expect(launcher, field).toContain(field);
  });

  it("a named commit is served with harness files only: no application file travels", () => {
    const list = launcher.slice(
      launcher.indexOf("harness_files() {"),
      launcher.indexOf("run_id="),
    );
    const paths = [
      ...list.matchAll(/(?:scripts|tests|app|components|lib|public)\/[\w./*-]+/g),
    ]
      .map((match) => match[0])
      .sort();
    expect(paths).toEqual([
      "scripts/lib/browser-executable.mjs",
      "scripts/lib/help-rehearsal-origin.mjs",
      "scripts/lib/one-path-rehearsal",
      "scripts/one-path-rehearsal-control.mjs",
      "scripts/one-path-rehearsal.mjs",
      "scripts/run-renewal-one-path-rehearsal.sh",
      "tests/browser",
      "tests/browser/renewal-novdec-journey-network.mjs",
      "tests/fixtures/lease-renewal/november-5-mix.json",
    ]);
    expect(launcher).toMatch(/-name 'one-path-\*\.mjs'/);
    expect(list).not.toMatch(/(?:^|[\s"'])(?:app|components|lib|public)\//m);
  });

  it("the rehearsal refuses to start anywhere else", () => {
    expect(rehearsal).toMatch(
      /assert\.match\(process\.cwd\(\), \/\^\\\/tmp\\\/pmi-kc-one-path-rehearsal-\[\^\/\]\+\\\/worktree\$\/\)/,
    );
    expect(rehearsal).toMatch(
      /FIRESTORE_EMULATOR_HOST \?\? "", \/\^127\\\.0\\\.0\\\.1:\\d\+\$\//,
    );
    expect(rehearsal).toMatch(
      /FIREBASE_AUTH_EMULATOR_HOST \?\? "", \/\^127\\\.0\\\.0\\\.1:\\d\+\$\//,
    );
    expect(rehearsal).toContain(".local/state/pmi-kc-one-path-rehearsal/");
    expect(rehearsal).toContain(
      "requireLoopbackRehearsalOrigin(`http://localhost:${port}`)",
    );
    expect(rehearsal).toContain("checkNovember5MixShape(fixture, businessDate)");
  });

  it("the server runs in the Demo descriptor with synthetic settings and no inherited variable", () => {
    for (const setting of [
      'ENVIRONMENT_KIND: "demo"',
      'DATA_CONTEXT: "demo"',
      'LOCAL_DEMO_AUTH: "true"',
      "NODE_OPTIONS: `--import ${join(process.cwd(), PRELOAD)}`",
      "FIREBASE_PROJECT_ID: PROJECT_ID",
      "GOOGLE_CLOUD_PROJECT: PROJECT_ID",
      'RENTVINE_API_KEY: "synthetic-rehearsal-key"',
      'RENTCAST_API_KEY: "synthetic-rehearsal-key"',
      'RENEWAL_SHEET_ID: "synthetic-rehearsal-sheet"',
      'MODEL_PROVIDER: "local"',
      "LOCAL_MODEL_BASE_URL: standIns.origin",
      "REHEARSAL_STAND_IN_ORIGIN: standIns.origin",
      "ONE_PATH_REHEARSAL_STAND_IN_ORIGIN: standIns.origin",
    ])
      expect(rehearsal, setting).toContain(setting);
    expect(rehearsal).toContain(
      'const PROJECT_ID = "pmi-kc-kb-one-path-rehearsal-test";',
    );
    // Both child environments are built from named variables, so no credential is inherited.
    expect(rehearsal).not.toMatch(/\.\.\.process\.env\b/);
  });

  it("no script of the rehearsal names a deploy, a release, a live smoke or a cloud command", () => {
    for (const [name, source] of Object.entries(everyScript)) {
      expect(source, name).not.toMatch(/\bgcloud\s/);
      expect(source, name).not.toMatch(/npm run (?:release|deploy|assure|smoke)/);
      expect(source, name).not.toMatch(/firebase deploy/);
    }
  });
});

describe("S254: the provider boundary changes only when the rehearsal asks", () => {
  it("each new answer is behind its own variable, and the stand-in origin is 127.0.0.1", () => {
    expect(preload).toContain("const MIX_FIXTURE = process.env.ONE_PATH_REHEARSAL_MIX");
    expect(preload).toContain("if (MIX_FIXTURE) return rentvineStandInResponse(");
    expect(preload).toContain("if (!MIX_FIXTURE) return SHEET_FIXTURE;");
    expect(preload).toContain(
      "const STAND_IN = process.env.ONE_PATH_REHEARSAL_STAND_IN_ORIGIN;",
    );
    expect(preload).toContain(
      "if (STAND_IN && !/^http:\\/\\/127\\.0\\.0\\.1:\\d{1,5}$/.test(STAND_IN))",
    );
    expect(preload).toContain("if (STAND_IN && url.hostname === RENTCAST_HOST) {");
    // The refusal of everything else is untouched.
    expect(preload).toContain(
      'record({ refused: "fetch", host: url.hostname, path: url.pathname });',
    );
    expect(preload).toContain(
      'record({ refused: "rentvine_write", path: url.pathname });',
    );
    expect(preload).toContain(
      'record({ refused: "socket", host: String(host), port: options.port ?? null });',
    );
  });

  it("only the path and query of a comparison read reach the stand-in", () => {
    const forward = preload.slice(
      preload.indexOf("if (STAND_IN && url.hostname === RENTCAST_HOST) {"),
      preload.indexOf("if (!loopback(url.hostname)) {"),
    );
    expect(forward).toContain("`${STAND_IN}/rentcast${url.pathname}${url.search}`");
    expect(forward).toContain('headers: { accept: "application/json" }');
    expect(forward).toContain('redirect: "error"');
    expect(forward).not.toMatch(/init\??\.headers|X-Api-Key|authorization/i);
  });

  it("the stand-ins listen on 127.0.0.1, open no outbound connection and read no credential", () => {
    expect(standIns).toContain('server.listen(port, "127.0.0.1", resolve);');
    expect(standIns).not.toMatch(/\bfetch\(|https?\.request\(|net\.connect|process\.env/);
    expect(standIns).toContain(
      "The rehearsal mail stand-in accepts example.invalid recipients only.",
    );
  });
});

describe("S254: control hooks act on the rehearsal and nothing else", () => {
  it("a rehearsal description that names another host is refused", () => {
    expect(() =>
      readRehearsal(runDir({ standInOrigin: "https://gmail.googleapis.com" })),
    ).toThrow(/127\.0\.0\.1 only/);
    expect(() =>
      readRehearsal(runDir({ standInOrigin: "http://192.168.1.20:41234" })),
    ).toThrow(/127\.0\.0\.1 only/);
    expect(() =>
      readRehearsal(runDir({ firestoreEmulatorHost: "firestore.googleapis.com:443" })),
    ).toThrow(/not on 127\.0\.0\.1/);
    const empty = mkdtempSync(join(tmpdir(), "s254-empty-"));
    temporary.push(empty);
    expect(() => readRehearsal(empty)).toThrow(/No rehearsal is described/);
  });

  it("a hook never calls a host a description was changed to after it was read", async () => {
    const described = readRehearsal(runDir());
    await expect(
      standInState({ ...described, standInOrigin: "https://example.invalid" }),
    ).rejects.toThrow(/127\.0\.0\.1 only/);
    await expect(
      setComparisonAllowance(
        { ...described, firestoreEmulatorHost: "firestore.googleapis.com:443" },
        true,
      ),
    ).rejects.toThrow(/127\.0\.0\.1 only/);
  });

  it("the RentVine controls write the flags the provider boundary reads (L09)", () => {
    const described = readRehearsal(runDir());
    const mix = loadNovember5Mix(readNovember5Mix(), "2026-11-05");
    const prepared = mix.roles.prepared.leaseId;
    const detail = () =>
      rentvineStandInResponse(
        mix,
        new URL(`https://pmikcmetro.rentvine.com/api/manager/leases/${prepared}`),
        JSON.parse(readFileSync(described.files.rentvineControl, "utf8")),
      ).body.lease;

    setStatusUnreadable(described, prepared, "missing");
    expect(detail()).not.toHaveProperty("leaseStatusID");
    setStatusUnreadable(described, prepared, "unresolved");
    expect(detail().leaseStatusID).toBe(999);
    setStatusUnreadable(described, prepared, "clear");
    expect(detail().leaseStatusID).toBe(2);
    expect(() => setStatusUnreadable(described, prepared, "sideways")).toThrow(/Choose/);

    // The recorded cycle dates are a separate flag and leave the status flags alone.
    setStatusUnreadable(described, prepared, "missing");
    setRecordingCycles(described, true);
    expect(JSON.parse(readFileSync(described.files.rentvineControl, "utf8"))).toEqual({
      statusUnreadable: { [String(prepared)]: "missing" },
      recordingCycles: true,
    });
    setRecordingCycles(described, false);
    expect(
      JSON.parse(readFileSync(described.files.rentvineControl, "utf8")).recordingCycles,
    ).toBe(false);
  });

  it("the outage control names one RentVine read and clears it", () => {
    const described = readRehearsal(runDir());
    setRentvineOutage(described, "/leases/statuses");
    expect(readFileSync(described.files.rentvineOutage, "utf8").trim()).toBe(
      "leases/statuses",
    );
    setRentvineOutage(described, null);
    expect(() => readFileSync(described.files.rentvineOutage, "utf8")).toThrow();
  });

  it("reads the refused connections of a run (L58)", () => {
    const described = readRehearsal(runDir());
    expect(refusedConnections(described)).toEqual([]);
    writeFileSync(
      described.files.networkLog,
      [
        JSON.stringify({ served: "rentvine", path: "/api/manager/leases/export" }),
        JSON.stringify({ refused: "fetch", host: "example.invalid", path: "/" }),
        "not json",
        "",
      ].join("\n"),
    );
    expect(refusedConnections(described)).toEqual([
      { refused: "fetch", host: "example.invalid", path: "/" },
    ]);
  });

  it("the command line names every hook the litmus needs", () => {
    for (const command of [
      "status",
      "mail",
      "comparisons",
      "allowance reached|open",
      "reply [--to <address>] [--thread <id>] [--text <words>]",
      "next-send unconfirmed|unconfirmed-lost|bounce|normal",
      "bounce [--to <address>] [--thread <id>]",
      "send-draft [--draft <id>]",
      "rewording accept|echo [--once]",
      "status-unreadable <lease id> missing|unresolved|clear",
      "rentvine-outage <path>|clear",
      "recording-cycles on|off",
      "refused",
    ])
      expect(controlCli, command).toContain(`//   ${command}`);
  });
});

describe("S254: seeds and drivers", () => {
  it("names every seed, built or waiting on its suite", () => {
    expect(SEED_STEPS.map((step) => [step.name, step.suite])).toEqual([
      ["recorded-cycles", "S246"],
      ["replied-owner-message", "S249"],
      ["standing-agreement", "S250"],
      ["housing-assistance", "S251"],
      ["prepared-kickoff", "S248"],
      ["forms", "S253"],
    ]);
  });

  it("a seed a commit cannot take is reported, and the others still run", async () => {
    const results = await runSeeds({}, [
      {
        name: "refuses",
        suite: "S000",
        run: async () => {
          throw new Error("This commit has no such route.");
        },
      },
      {
        name: "works",
        suite: "S000",
        run: async () => ({ state: "seeded", detail: "Done." }),
      },
    ]);
    expect(results).toEqual([
      {
        name: "refuses",
        suite: "S000",
        state: "skipped",
        detail: "This commit has no such route.",
      },
      { name: "works", suite: "S000", state: "seeded", detail: "Done." },
    ]);
  });

  it("the steps later suites own say so until those suites add them", async () => {
    const waiting = await runSeeds(
      {},
      SEED_STEPS.filter((step) =>
        ["standing-agreement", "housing-assistance", "prepared-kickoff"].includes(
          step.name,
        ),
      ),
    );
    expect(waiting.map((result) => result.state)).toEqual([
      "not_built",
      "not_built",
      "not_built",
    ]);
  });

  it("the smoke driver drives only a loopback origin and counts with one stated rule", () => {
    expect(smoke).toContain(
      "const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);",
    );
    expect(smoke).toContain("new URL(route.request().url()).origin === origin");
    expect(smoke).toContain(
      "a row is an element inside the page's main region that carries a lease id",
    );
  });

  it("the launcher's header says where each later piece goes", () => {
    for (const phrase of [
      "EXTENSION POINTS",
      "Journey driver (S252)",
      "tests/browser/one-path-journey-driver.mjs",
      "Candidate-only seeds",
      "tests/browser/one-path-forms-seed.mjs",
      "Litmus session (S254)",
      "--serve --commit <starting commit>",
      "Temporary files (L71)",
      "6491c06f3773e92c0bd811d4360371523e24d643",
    ])
      expect(launcher, phrase).toContain(phrase);
  });
});
