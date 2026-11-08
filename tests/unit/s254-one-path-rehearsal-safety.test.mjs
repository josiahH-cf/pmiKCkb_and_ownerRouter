import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
import { openRehearsalDatabase } from "@/scripts/lib/one-path-rehearsal/emulator-database.mjs";
import {
  SEED_STEPS,
  formsSeedLeases,
  runSeeds,
  seedForms,
  sequenceStanding,
} from "@/scripts/lib/one-path-rehearsal/seeds.mjs";
import { LOCAL_ONLY_DEPLOY_VARIABLES } from "@/scripts/release-candidate.mjs";

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
const proof = read("tests/browser/one-path-stand-in-proof-driver.mjs");
const everyScript = {
  launcher,
  rehearsal,
  controlCli,
  controlLibrary,
  standIns,
  seeds,
  smoke,
  proof,
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
        harnessNetworkLog: join(dir, "harness-network.jsonl"),
        driverNetworkLog: join(dir, "driver-network.jsonl"),
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
  it("refuses Node's normalized socket overload before its offline base-connect sentinel", () => {
    const output = runDir();
    const probe = join(output, "socket-probe.mjs");
    const guardUrl = pathToFileURL(
      join(process.cwd(), "tests/browser/renewal-novdec-journey-network.mjs"),
    ).href;
    writeFileSync(
      probe,
      `
      import net from "node:net";
      let baseCalls = 0;
      net.Socket.prototype.connect = function offlineSentinel() {
        baseCalls += 1;
        process.nextTick(() => this.destroy(new Error("offline base connect reached")));
        return this;
      };
      await import(${JSON.stringify(guardUrl)});
      const attempt = (make) => new Promise(resolve => make().once("error", error => resolve(error.message)));
      const refused = [];
      refused.push(await attempt(() => net.createConnection({host:"provider.example.invalid",port:443})));
      refused.push(await attempt(() => net.createConnection(443,"provider.example.invalid")));
      refused.push(await attempt(() => new net.Socket().connect({host:"provider.example.invalid",port:443})));
      refused.push(await attempt(() => new net.Socket().connect(443,"provider.example.invalid")));
      const refusedBaseCalls = baseCalls;
      const local = await attempt(() => net.createConnection({host:"127.0.0.1",port:443}));
      console.log(JSON.stringify({refused,refusedBaseCalls,local,baseCalls}));
    `,
    );
    const result = spawnSync(process.execPath, [probe], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 15_000,
    });
    expect(result.status, result.stderr).toBe(0);
    const proof = JSON.parse(result.stdout);
    expect(proof.refusedBaseCalls).toBe(0);
    expect(proof.refused).toHaveLength(4);
    for (const message of proof.refused)
      expect(message).toContain("refuses network access");
    expect(proof.local).toBe("offline base connect reached");
    expect(proof.baseCalls).toBe(1);
  });

  it("guards the outer CLI and its inherited Node children before they can dispatch", () => {
    const output = runDir();
    const result = spawnSync(
      "bash",
      [
        "-c",
        `
      set -e
      source "$1/scripts/lib/one-path-rehearsal/network-guard.sh"
      enable_rehearsal_network_guard "$1" "$2"
      node --input-type=module -e '
        import { execFileSync } from "node:child_process";
        const proof = execFileSync(process.execPath, ["--input-type=module", "-e", "try { await fetch(\\"https://provider.example.invalid/test\\"); process.exit(7); } catch (error) { if (!error.message.includes(\\"refuses network access\\")) throw error; console.log(globalThis.fetch.name); }"], { encoding: "utf8" });
        process.stdout.write(proof);
      '
    `,
        "guard-proof",
        process.cwd(),
        output,
      ],
      { encoding: "utf8", timeout: 15_000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("guardedFetch");
    const log = readFileSync(join(output, "harness-network.jsonl"), "utf8");
    expect(log).toContain('"refused":"fetch"');
    expect(
      new Set(
        log
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line).pid),
      ).size,
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps automatic comparisons off after seeds and resets when the audit holds them", async () => {
    const requests = [];
    const page = {
      evaluate: async (_fn, request) => {
        requests.push(request);
        return { status: 200, body: { enabled: true, version: 1 } };
      },
    };
    const step = SEED_STEPS.find((entry) => entry.name === "automatic-start-restored");
    const results = await runSeeds(
      { page, rehearsal: { automaticComparisonHeld: true } },
      [step],
    );
    expect(results[0].state).toBe("seeded");
    expect(requests.filter((entry) => entry.body?.enabled !== undefined)).toEqual([
      expect.objectContaining({
        path: "/api/lease-renewal/kickoff-settings",
        body: expect.objectContaining({ enabled: false, expectedVersion: 1 }),
      }),
    ]);
  });

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
    // Drivers travel; a seed module that writes a commit's own document shapes does not.
    expect(launcher).toMatch(/-name 'one-path-\*-driver\.mjs'/);
    expect(list).not.toMatch(/one-path-\*\.mjs|-seed\.mjs/);
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

  it("a release refuses both variables that name a stand-in to the server", () => {
    // The app reads REHEARSAL_STAND_IN_ORIGIN (the mail adapter's fence) and LOCAL_MODEL_BASE_URL.
    for (const name of ["REHEARSAL_STAND_IN_ORIGIN", "LOCAL_MODEL_BASE_URL"])
      expect(LOCAL_ONLY_DEPLOY_VARIABLES.presentIsFatal, name).toContain(name);
    // ONE_PATH_REHEARSAL_* variables are read by the provider boundary preload only, which is a
    // test file and is never part of a build.
    expect(read("lib/environment/rehearsal-stand-in.ts")).not.toContain(
      "ONE_PATH_REHEARSAL",
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
      { from: "server", refused: "fetch", host: "example.invalid", path: "/" },
    ]);
    // The rehearsal process and a driver keep their own logs; all three are read.
    writeFileSync(
      described.files.harnessNetworkLog,
      `${JSON.stringify({ refused: "socket", host: "example.invalid", port: 443 })}\n`,
    );
    writeFileSync(
      described.files.driverNetworkLog,
      `${JSON.stringify({ refused: "fetch", host: "example.invalid", path: "/driver" })}\n`,
    );
    expect(refusedConnections(described).map((entry) => entry.from)).toEqual([
      "server",
      "rehearsal",
      "driver",
    ]);
    // A description from before a log was named still reads the logs it names.
    expect(
      refusedConnections({ files: { networkLog: described.files.networkLog } }),
    ).toHaveLength(1);
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
      // S249: the automatic start is held for the seeds and restored after them.
      ["automatic-start-held", "S249"],
      ["recorded-cycles", "S246"],
      ["notice-admission", "S254"],
      ["standing-agreement", "S250"],
      ["housing-assistance", "S251"],
      // S249 built this step; it was waiting on "S248".
      ["prepared-kickoff", "S249"],
      ["replied-owner-message", "S249"],
      ["forms", "S253"],
      ["automatic-start-restored", "S249"],
    ]);
  });

  it("S249: the prepared kickoff seed goes through the app's routes and sends nothing", async () => {
    const mix = loadNovember5Mix(readNovember5Mix(), "2026-11-05");
    const calls = [];
    const page = {
      evaluate: async (_fn, arg) => {
        if (!arg?.path) return "00000000-0000-4000-8000-000000000001";
        calls.push({ path: arg.path, body: arg.body });
        if (arg.path.startsWith("/api/lease-renewal/message-preparation?"))
          return {
            status: 200,
            body: {
              cycleId: null,
              saved: null,
              inputs: { edits: { responseRequest: "" } },
            },
          };
        if (arg.path === "/api/lease-renewal/kickoff-preparation")
          return { status: 200, body: { status: "prepared", billed: true } };
        return { status: 200, body: { status: "approved" } };
      },
    };
    const step = SEED_STEPS.find((entry) => entry.name === "prepared-kickoff");
    const result = await step.run({ page, mix });
    expect(result.state).toBe("seeded");
    expect(
      calls.map((call) =>
        `${call.path} ${call.body?.kind ?? call.body?.role ?? ""}`.trim(),
      ),
    ).toEqual([
      "/api/auth/demo Approver",
      "/api/lease-renewal/message-preparation publish",
      "/api/lease-renewal/message-preparation publish",
      "/api/auth/demo Editor",
      "/api/lease-renewal/kickoff-preparation",
      "/api/lease-renewal/message-preparation?leaseId=9101&channel=owner",
      "/api/lease-renewal/message-preparation save",
    ]);
    expect(calls[4].body).toMatchObject({ leaseId: "9101", trigger: "staff" });
    expect(calls[6].body.inputs.signature.name).toBe("Example Staff");
    // Nothing here drafts, sends, schedules or writes a provider.
    expect(
      calls.some((call) => /sequences|draft|writeback|rentvine/.test(call.path)),
    ).toBe(false);
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

  it("S250 and S251 built their steps, inside the held automatic start", async () => {
    const order = SEED_STEPS.map((step) => step.name);
    const at = (name) => order.indexOf(name);
    // The hold comes first, so opening the desk (notice admission) starts no preparation, and
    // both variant seeds run before the setting returns to its shipped default.
    expect(at("automatic-start-held")).toBe(0);
    expect(at("automatic-start-held")).toBeLessThan(at("notice-admission"));
    expect(at("standing-agreement")).toBeLessThan(at("automatic-start-restored"));
    expect(at("housing-assistance")).toBeLessThan(at("automatic-start-restored"));
    expect(at("automatic-start-restored")).toBe(order.length - 1);
    // Without a served page they report the refusal and the run carries on; neither is a
    // "not built" placeholder any more (S249 built "prepared-kickoff" the same way).
    const results = await runSeeds(
      {},
      SEED_STEPS.filter((step) =>
        ["standing-agreement", "housing-assistance"].includes(step.name),
      ),
    );
    expect(results.map((result) => result.state)).toEqual(["skipped", "skipped"]);
  });

  it("the forms seed gets the five role leases with their tenants and animals", () => {
    const mix = loadNovember5Mix(readNovember5Mix(), "2026-11-05");
    expect(formsSeedLeases(mix)).toEqual([
      { leaseId: "9101", tenants: 2, animals: "one_pet" },
      { leaseId: "9102", tenants: 1, animals: "two_pets" },
      { leaseId: "9103", tenants: 1, animals: "assistance_animal" },
      { leaseId: "9104", tenants: 5, animals: "none" },
      { leaseId: "9105", tenants: 2, animals: "none" },
    ]);
  });

  it("the forms seed is the served commit's own module: absent, it is named and not run", async () => {
    const mix = loadNovember5Mix(readNovember5Mix(), "2026-11-05");
    const dir = mkdtempSync(join(tmpdir(), "s254-forms-"));
    temporary.push(dir);
    const opened = [];
    const openDatabase = (described) => {
      opened.push(described);
      return { name: "rehearsal emulator" };
    };
    expect(
      await seedForms(
        { mix, rehearsal: {} },
        { file: join(dir, "absent.mjs"), openDatabase },
      ),
    ).toEqual({
      state: "not_built",
      detail: "tests/browser/one-path-forms-seed.mjs does not exist on this tree.",
    });

    const other = join(dir, "other.mjs");
    writeFileSync(other, "export const somethingElse = 1;\n");
    expect(
      (await seedForms({ mix, rehearsal: {} }, { file: other, openDatabase })).state,
    ).toBe("skipped");
    expect(opened).toEqual([]);

    // Present, it is called with the rehearsal's database and the role leases.
    const present = join(dir, "present.mjs");
    writeFileSync(
      present,
      "export async function seedOnePathForms(database, options) {\n" +
        "  globalThis.s254FormsSeedCall = { database, options };\n" +
        "  return { forms: { animal_agreement: {}, owner_acknowledgment: {} } };\n" +
        "}\n",
    );
    const described = { projectId: "pmi-kc-kb-one-path-rehearsal-test" };
    const result = await seedForms(
      { mix, rehearsal: described },
      { file: present, openDatabase },
    );
    expect(result.state).toBe("seeded");
    expect(result.detail).toContain("animal_agreement, owner_acknowledgment");
    expect(result.detail).toContain("lease 9104: 5 tenant(s), none");
    expect(opened).toEqual([described]);
    expect(globalThis.s254FormsSeedCall).toEqual({
      database: { name: "rehearsal emulator" },
      options: { leases: formsSeedLeases(mix) },
    });
    delete globalThis.s254FormsSeedCall;
  });

  it("the rehearsal database opens the rehearsal's own emulator on 127.0.0.1 and nothing else", () => {
    const described = {
      firestoreEmulatorHost: "127.0.0.1:8123",
      projectId: "pmi-kc-kb-one-path-rehearsal-test",
    };
    const bound = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      expect(() => openRehearsalDatabase(described)).toThrow(/127\.0\.0\.1 only/);
      process.env.FIRESTORE_EMULATOR_HOST = "firestore.googleapis.com:443";
      expect(() => openRehearsalDatabase(described)).toThrow(/127\.0\.0\.1 only/);
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:9999";
      expect(() => openRehearsalDatabase(described)).toThrow(
        /another Firestore emulator/,
      );
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8123";
      expect(() =>
        openRehearsalDatabase({ ...described, projectId: "pmi-kc-kb" }),
      ).toThrow(/test project only/);
    } finally {
      if (bound === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = bound;
    }
  });

  it("a message record's standing is reported in the app's own terms", () => {
    expect(sequenceStanding(null)).toBe("no message record");
    expect(
      sequenceStanding({
        state: "paused",
        pause: { cause: "authorization_unavailable" },
        observation: { state: "unavailable", reason: "read_failed" },
        threads: [],
      }),
    ).toBe(
      "sequence state paused, pause cause authorization_unavailable, incoming mail check unavailable (read_failed), 0 sent message(s)",
    );
    expect(
      sequenceStanding({ state: "completed", observation: null, threads: [{}] }),
    ).toBe("sequence state completed, 1 sent message(s)");
  });

  it("the smoke driver drives only a loopback origin and counts with one stated rule", () => {
    expect(smoke).toContain(
      "const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);",
    );
    expect(smoke).toContain("new URL(route.request().url()).origin === origin");
    expect(smoke).toContain(
      "a row is a lease named by a row marker on an element the page is showing",
    );
    expect(smoke).toContain('const ROW_MARKERS = ["data-lease-id", "data-batch-lease"];');
  });

  it("the stand-in proof driver drives only the rehearsal's origin and its own controls", () => {
    expect(proof).toContain(
      "const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);",
    );
    expect(proof).toContain("new URL(route.request().url()).origin === origin");
    expect(proof).toContain("const rehearsal = readRehearsal(runDir);");
    // It names no address of its own: every request is a path on the rehearsal's origin, and
    // every control goes through the control library, which calls 127.0.0.1 only.
    expect(proof).not.toMatch(/https?:\/\//);
    expect(seeds).not.toMatch(/https?:\/\//);
  });

  it("a send made by a seed or a driver goes through the app's own reviewed send", () => {
    const send = seeds.slice(
      seeds.indexOf("export async function sendOwnerMessage"),
      seeds.indexOf("/**", seeds.indexOf("export async function sendOwnerMessage")),
    );
    expect(send).toContain("/api/gmail-hub/composition?purpose=renewal_owner&lease=");
    expect(send).toContain('action: "save"');
    expect(send).toContain('action: "send"');
    expect(send).toContain("reviewedDraftHash: saved.body.reviewedDraftHash");
    expect(send).toContain("reviewedTargetHash,");
    // No seed reaches the mail stand-in's send by itself; only its controls are called.
    expect(seeds).not.toMatch(/messages\/send|gmail\/v1/);
    expect(proof).not.toMatch(/messages\/send|gmail\/v1/);
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
