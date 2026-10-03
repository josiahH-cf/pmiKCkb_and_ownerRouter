import { afterEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  recoveryFixture,
  setSheetWriteback,
  SHEET_FLAG,
} from "../helpers/release-recovery-fixture.mjs";
import * as deployModule from "../../scripts/deploy-demo-cloud-run.mjs";
import {
  buildDemoDeployCommand,
  createDeployRevisionSuffix,
  formatGcloudMapFlag,
  readSeedProductionAllowed,
  validateSheetWritebackGateCoupling,
} from "../../scripts/deploy-demo-cloud-run.mjs";
import { buildProductionEnv } from "../../scripts/prepare-production-env.mjs";
import {
  buildPausedRollbackRedeployPlan,
  buildReleasePlan,
} from "../../scripts/release-candidate.mjs";
import {
  evaluateBatchPreflight,
  parseAwaitingReleaseQueue,
} from "../../scripts/release-batch-preflight.mjs";
import { prepareReleasePermit } from "../../scripts/release-control.mjs";
import {
  executeSafeRecovery,
  prepareRecoveryBaseline,
  readRecoveryBaseline,
  verifyRecoveryAvailability,
} from "../../scripts/release-recovery.mjs";
import {
  main as releaseMain,
  verifyPreparedPromotionRecovery,
} from "../../scripts/release.mjs";

// S159 (R-S159-11, BEH-S159-11, ARCH-S159-3, AC-S159-3): the release tooling no longer requires a
// blanket Sheet=false. The candidate and the promoted revision carry the ONE reviewed value; the
// recovery target keeps the captured predecessor's ACTUAL value and is never rewritten. Every
// missing, unreadable or differing value still refuses.

const EXPECTATION_MODULE =
  "../../lib/production-assurance/sheet-writeback-expectation.mjs";
const expectation = () => import(EXPECTATION_MODULE);
const recoveryModule = () => import("../../scripts/release-recovery.mjs");

const roots = [];
function fixture(options) {
  const root = mkdtempSync(join(tmpdir(), "s159-release-sheet-"));
  roots.push(root);
  return recoveryFixture(root, options);
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const flagOf = (revision) =>
  revision.containers.map(
    (container) => container.env.find((entry) => entry.name === SHEET_FLAG)?.value,
  );
const recover = (h) =>
  executeSafeRecovery(h.reference, {
    client: h.client,
    stateRoot: h.root,
    candidateRevision: h.candidate,
    verifyRecovered: h.verifyRecovered,
    assertLock: () => {},
    wait: async () => {},
  });

describe("S159 BEH-S159-11: one reviewed place states the candidate value", () => {
  it("names true for the candidate and promoted revision and the captured actual value for the predecessor and recovery target", async () => {
    const {
      REVIEWED_CANDIDATE_SHEET_WRITEBACK,
      SHEET_WRITEBACK_FLAG,
      expectedSheetWriteback,
    } = await expectation();
    expect(SHEET_WRITEBACK_FLAG).toBe(SHEET_FLAG);
    expect(REVIEWED_CANDIDATE_SHEET_WRITEBACK).toBe("true");
    expect(expectedSheetWriteback("candidate")).toBe("true");
    expect(expectedSheetWriteback("promoted")).toBe("true");
    for (const role of ["predecessor", "recovery_target"]) {
      expect(expectedSheetWriteback(role, { predecessorActual: "false" })).toBe("false");
      expect(expectedSheetWriteback(role, { predecessorActual: "true" })).toBe("true");
    }
  });

  it("refuses a predecessor or recovery expectation without captured evidence, and an unknown role", async () => {
    const { expectedSheetWriteback } = await expectation();
    for (const role of ["predecessor", "recovery_target"])
      for (const missing of [undefined, null, "", "TRUE", " false ", "0"])
        expect(() =>
          expectedSheetWriteback(role, { predecessorActual: missing }),
        ).toThrow("predecessor_sheet_writeback_evidence_required");
    expect(() => expectedSheetWriteback("rollback")).toThrow(
      "sheet_writeback_role_invalid",
    );
  });

  it("reads only an exact plaintext value that every container agrees on", async () => {
    const { readRevisionSheetWriteback, revisionCarriesSheetWriteback } =
      await expectation();
    const revision = (...values) => ({
      containers: values.map((value) => ({
        env: value === undefined ? [] : [{ name: SHEET_FLAG, value }],
      })),
    });
    expect(readRevisionSheetWriteback(revision("true"))).toBe("true");
    expect(readRevisionSheetWriteback(revision("false", "false"))).toBe("false");
    for (const unreadable of [
      null,
      {},
      { containers: [] },
      revision(undefined),
      revision("TRUE"),
      revision(" true "),
      revision("true", "false"),
      revision("true", undefined),
      {
        containers: [{ env: [{ name: SHEET_FLAG, valueSource: { secretKeyRef: {} } }] }],
      },
      {
        containers: [
          {
            env: [
              { name: SHEET_FLAG, value: "true" },
              { name: SHEET_FLAG, value: "true" },
            ],
          },
        ],
      },
    ])
      expect(readRevisionSheetWriteback(unreadable)).toBeNull();
    expect(revisionCarriesSheetWriteback(revision("true"), "true")).toBe(true);
    expect(revisionCarriesSheetWriteback(revision("true"), "false")).toBe(false);
    expect(revisionCarriesSheetWriteback(revision(undefined), "false")).toBe(false);
    expect(revisionCarriesSheetWriteback(revision("true"), undefined)).toBe(false);
  });

  it("is the only place the release tooling takes the candidate value from", () => {
    for (const file of [
      "scripts/deploy-demo-cloud-run.mjs",
      "scripts/release-batch-preflight.mjs",
      "scripts/release-candidate.mjs",
      "scripts/release-recovery.mjs",
      "scripts/release.mjs",
      "scripts/prepare-production-env.mjs",
      "scripts/meeting-walkthrough-preflight.ts",
      "lib/production-assurance/revision-configuration.ts",
    ]) {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(text, file).toContain("sheet-writeback-expectation.mjs");
    }
  });
});

describe("S159 BEH-S159-11: the candidate carries the reviewed value or the release refuses", () => {
  const HEAD = "f45ecd58137a51f59937d0afaa57e8ed19853964";
  const NOW = "2026-10-02T16:00:00.000Z";
  function preflightInput(envFlags, mirroredEnvFlags = envFlags) {
    const permit = prepareReleasePermit(HEAD, Date.parse(NOW));
    return {
      headSha: HEAD,
      treeClean: true,
      ci: {
        headSha: HEAD,
        headBranch: "main",
        event: "push",
        status: "completed",
        conclusion: "success",
        databaseId: 99,
      },
      checkpoint: null,
      changedPaths: ["lib/lease-renewal/meeting-walkthrough.ts"],
      foundationPresent: true,
      queue: parseAwaitingReleaseQueue(
        "## Awaiting release\n\n1. S159 restore supported Sheet updates: commit `31bc9072`.\n",
      ),
      envFlags,
      mirroredEnvFlags,
      nowIso: NOW,
      billingReEnabled: true,
      permit,
      prerequisite: {
        schemaVersion: "pmi-kc-release-prerequisites.v1",
        runId: permit.runId,
        sha: HEAD,
        checkedAt: NOW,
        checks: {
          auth_cli_adc: "ready",
          admin_browser: "ready",
          billing: "ready",
          cost_controls: "ready",
        },
      },
      remoteHeadSha: HEAD,
      nativeHeadSha: HEAD,
      sourceHeadSha: HEAD,
      queueAncestry: true,
      nativeTools: true,
      noWatcher: true,
      lockAvailable: true,
    };
  }
  const flags = (local, production) => ({
    [`.env.local:${SHEET_FLAG}`]: local,
    [`.env.production.local:${SHEET_FLAG}`]: production,
    ".env.local:ASK_DEMO_MODE": "false",
    ".env.production.local:ASK_DEMO_MODE": "false",
  });
  const sheetCheck = (result) => result.checks.find((row) => row.id === "sheet_switch");

  it("admits a batch whose env files stage the reviewed value true in both checkouts", () => {
    const result = evaluateBatchPreflight(preflightInput(flags("true", "true")));
    expect(sheetCheck(result).state).toBe("ready");
    expect(sheetCheck(result).summary).toMatch(/staged true/);
    expect(result.verdict).toBe("go");
  });

  it.each([
    ["the production env file still stages false", flags("true", "false"), undefined],
    ["the local env file still stages false", flags("false", "true"), undefined],
    ["a value is not the exact string", flags("true", "TRUE"), undefined],
    ["a value is missing", flags("true", undefined), undefined],
    [
      "the release checkout mirror differs",
      flags("true", "true"),
      flags("true", "false"),
    ],
  ])("refuses the batch when %s", (_label, envFlags, mirrored) => {
    const result = evaluateBatchPreflight(preflightInput(envFlags, mirrored ?? envFlags));
    expect(sheetCheck(result).state).toBe("blocked");
    expect(result.verdict).toBe("not_ready");
    expect(result.ownerActions.join(" ")).toMatch(
      /LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=true/,
    );
  });

  it("stays unknown, never ready, when no env file was readable", () => {
    const result = evaluateBatchPreflight(preflightInput({}));
    expect(sheetCheck(result).state).toBe("unknown");
    expect(result.verdict).toBe("not_ready");
  });

  function deployEnv(extra = {}) {
    return {
      APP_COMMIT_SHA: "a".repeat(40),
      CLOUD_RUN_SERVICE_ACCOUNT: "runtime@pmi-kc-kb-prod.iam.gserviceaccount.com",
      ...extra,
    };
  }
  const deployedEnv = (command) =>
    deployModule.parseGcloudMapFlag(
      command.args.find((argument) => argument.startsWith("--set-env-vars=")),
    );

  it("deploys the reviewed value by default and still honors an explicit value", () => {
    const build = (env) =>
      buildDemoDeployCommand({
        argv: ["--budget-confirmed", "--dry-run"],
        env: deployEnv(env),
        localEnv: {},
        revisionSuffix: createDeployRevisionSuffix(),
      });
    expect(deployedEnv(build({}))[SHEET_FLAG]).toBe("true");
    expect(deployedEnv(build({ [SHEET_FLAG]: "false" }))[SHEET_FLAG]).toBe("false");
    expect(deployedEnv(build({ [SHEET_FLAG]: "true" }))[SHEET_FLAG]).toBe("true");
  });

  it("reads the deploy map back exactly as gcloud will apply it", () => {
    const values = {
      ENVIRONMENT_KIND: "production",
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({ alpha: "one", beta: "two=2" }),
      EMPTY: "",
      [SHEET_FLAG]: "true",
    };
    for (const escapeJsonQuotes of [false, true])
      expect(
        deployModule.parseGcloudMapFlag(
          formatGcloudMapFlag("--set-env-vars", values, { escapeJsonQuotes }),
          { unescapeJsonQuotes: escapeJsonQuotes },
        ),
      ).toEqual(values);
    // Every supported delimiter, including the caret itself, and gcloud's default comma.
    expect(
      deployModule.parseGcloudMapFlag(
        formatGcloudMapFlag("--set-env-vars", { A: "x~y|z%", B: "2" }),
      ),
    ).toEqual({ A: "x~y|z%", B: "2" });
    expect(deployModule.parseGcloudMapFlag("--set-env-vars=A=1,B=2")).toEqual({
      A: "1",
      B: "2",
    });
  });

  it("stages the reviewed value in the generated production env, never the source value", () => {
    for (const sourceValue of ["false", "true", undefined]) {
      const { output } = buildProductionEnv({
        appBaseUrl: "https://pmi-kc-app.example.test",
        sourceEnv: sourceValue === undefined ? {} : { [SHEET_FLAG]: sourceValue },
      });
      expect(output[SHEET_FLAG]).toBe("true");
    }
  });

  describe("through the release command's own plan", () => {
    function envFile(lines) {
      const directory = mkdtempSync(join(tmpdir(), "s159-release-env-"));
      roots.push(directory);
      const path = join(directory, "reviewed-production.env");
      writeFileSync(path, `${lines.join("\n")}\n`);
      return path;
    }
    const runPlan = async (lines) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        return await releaseMain(
          ["--environment=production", "--plan-only", `--env-file=${envFile(lines)}`],
          { APP_COMMIT_SHA: "a".repeat(40) },
        );
      } finally {
        log.mockRestore();
        warn.mockRestore();
      }
    };

    it("plans a candidate whose reviewed env file stages true or leaves the default", async () => {
      await expect(runPlan([`${SHEET_FLAG}=true`])).resolves.toMatchObject({
        planned: true,
      });
      await expect(runPlan(["ALLOWED_HD=pmikcmetro.com"])).resolves.toMatchObject({
        planned: true,
      });
    });

    it("refuses a candidate whose reviewed env file stages false, before anything runs", async () => {
      await expect(runPlan([`${SHEET_FLAG}=false`])).rejects.toThrow(
        /LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED resolves to "false", not the reviewed candidate value "true"/,
      );
    });
  });

  it("keeps the two exact action keys' coupling in front of the default value", async () => {
    const { REVIEWED_CANDIDATE_SHEET_WRITEBACK } = await expectation();
    const closedRoot = mkdtempSync(join(tmpdir(), "s159-gate-"));
    roots.push(closedRoot);
    mkdirSync(join(closedRoot, "lib", "integrations"), { recursive: true });
    writeFileSync(
      join(closedRoot, "lib", "integrations", "action-registry-seed.ts"),
      [
        "  {",
        '    key: "google_sheets.renewal_checklist.row_append",',
        "    production_allowed: false,",
        "  },",
        "  {",
        '    key: "google_sheets.renewal_checklist.field_update",',
        "    production_allowed: true,",
        "  },",
        "",
      ].join("\n"),
    );
    const runtime = { [SHEET_FLAG]: REVIEWED_CANDIDATE_SHEET_WRITEBACK };
    expect(validateSheetWritebackGateCoupling(runtime)).toEqual([]);
    const problems = validateSheetWritebackGateCoupling(runtime, closedRoot);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      "google_sheets.renewal_checklist.row_append is production_allowed:false",
    );
    expect(validateSheetWritebackGateCoupling(runtime, tmpdir())[0]).toContain(
      "could not be resolved",
    );
  });

  const planArgs = (environment) => ({
    environment,
    errors: [],
    project: "pmi-kc-kb-prod",
    region: "us-central1",
    service: "pmi-kc-app",
  });
  const plan = (environment, resolvedEnv) =>
    buildReleasePlan({
      args: planArgs(environment),
      deployArgs: ["run", "deploy", "pmi-kc-app"],
      resolvedEnv,
      revisionName: "pmi-kc-app-rev-9",
      revisionSuffix: "abc123",
    });

  it("plans a production candidate only when its resolved value is the reviewed one", () => {
    expect(plan("production", { [SHEET_FLAG]: "true" }).errors).toEqual([]);
    for (const resolved of [{ [SHEET_FLAG]: "false" }, { [SHEET_FLAG]: "TRUE" }, {}]) {
      const refused = plan("production", resolved);
      expect(refused.steps).toEqual([]);
      expect(refused.errors.join(" ")).toMatch(
        /LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED.*reviewed candidate value "true"/,
      );
    }
    expect(plan("demo", {}).errors).toEqual([]);
  });

  function promotionCandidate(h, sheetValue) {
    const name = h.candidate;
    const revision = setSheetWriteback(structuredClone(h.source), sheetValue);
    revision.name = `${h.source.service}/revisions/${name}`;
    revision.containers[0].env.find((entry) => entry.name === "APP_COMMIT_SHA").value =
      h.input.sha;
    h.state.revisions.set(name, revision);
    return {
      project: h.input.project,
      region: h.input.region,
      service: h.input.service,
      expectedCommit: h.input.sha,
      expectedRevision: name,
      expectedConfigurationFingerprint: h.fingerprint(revision),
      recoveryBaseline: h.reference,
    };
  }

  it("accepts a true candidate over a false predecessor at the last boundary before promotion", async () => {
    const h = fixture({ prepared: true });
    const receipt = await verifyPreparedPromotionRecovery(promotionCandidate(h, "true"), {
      client: h.client,
    });
    expect(receipt.targetRevision).toBe(h.target);
    expect(receipt.predecessorSheetWriteback).toBe("false");
    expect(h.state.patches).toHaveLength(0);
  });

  it.each(["false", "TRUE", null])(
    "refuses a candidate whose switch reads %s before promotion",
    async (value) => {
      const h = fixture({ prepared: true });
      await expect(
        verifyPreparedPromotionRecovery(promotionCandidate(h, value), {
          client: h.client,
        }),
      ).rejects.toThrow("candidate_sheet_writeback_unverified");
      expect(h.state.patches).toHaveLength(0);
    },
  );
});

describe("S159 AC-S159-3: the recovery target keeps the captured predecessor's actual value", () => {
  it("clones a false predecessor unchanged and records false as rollback evidence", async () => {
    const h = fixture();
    const result = await prepareRecoveryBaseline(h.input, h.deps);
    const dispatched = h.state.patches[0].data.template;
    expect(dispatched.containers[0].env).toEqual(h.source.containers[0].env);
    expect(flagOf(h.state.revisions.get(h.target))).toEqual(["false"]);
    expect(result.receipt.allowedDifference).toBe("revision_identity_only");
    expect(result.receipt.predecessorSheetWriteback).toBe("false");
    // The predecessor image is already a digest, so the clone differs by revision identity only.
    expect(result.receipt.targetFingerprint).toBe(result.receipt.originalFingerprint);
    await expect(
      verifyRecoveryAvailability(result.receipt, { client: h.client }),
    ).resolves.toBe(true);
  });

  it("rolls a true candidate back to the false target and refuses a target that drifted to true", async () => {
    const h = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
    expect((await recover(h)).state).toBe("ROLLED_BACK_VERIFIED");
    expect(flagOf(h.state.revisions.get(h.target))).toEqual(["false"]);
    expect(h.state.patches).toHaveLength(1);

    const drifted = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
    setSheetWriteback(drifted.state.revisions.get(drifted.target), "true");
    await expect(recover(drifted)).rejects.toThrow("recovery_target_unverified");
    expect(drifted.state.patches).toHaveLength(0);
  });

  it("keeps a true predecessor true for the next release, never rewriting it to false", async () => {
    const h = fixture({ predecessorSheetWriteback: "true" });
    const result = await prepareRecoveryBaseline(h.input, h.deps);
    expect(h.state.patches[0].data.template.containers[0].env).toEqual(
      h.source.containers[0].env,
    );
    expect(flagOf(h.state.revisions.get(h.target))).toEqual(["true"]);
    expect(result.receipt.predecessorSheetWriteback).toBe("true");
    expect(result.receipt.allowedDifference).toBe("revision_identity_only");
    await expect(
      verifyRecoveryAvailability(result.receipt, { client: h.client }),
    ).resolves.toBe(true);
  });

  it("rolls back to a true target for the next release and refuses a target that drifted to false", async () => {
    const h = fixture({
      prepared: true,
      predecessorSheetWriteback: "true",
      serving: "pmi-kc-app-candidate-isolated",
    });
    expect((await recover(h)).state).toBe("ROLLED_BACK_VERIFIED");
    expect(flagOf(h.state.revisions.get(h.target))).toEqual(["true"]);

    const drifted = fixture({
      prepared: true,
      predecessorSheetWriteback: "true",
      serving: "pmi-kc-app-candidate-isolated",
    });
    setSheetWriteback(drifted.state.revisions.get(drifted.target), "false");
    await expect(recover(drifted)).rejects.toThrow("recovery_target_unverified");
    expect(drifted.state.patches).toHaveLength(0);
  });

  it("refuses availability when the live predecessor no longer carries its recorded value", async () => {
    const h = fixture({ prepared: true });
    setSheetWriteback(h.state.revisions.get(h.original), "true");
    await expect(
      verifyRecoveryAvailability(h.receipt, { client: h.client }),
    ).rejects.toThrow("recovery_availability_unverified");
  });
});

describe("S159 BEH-S159-11: missing predecessor evidence fails closed", () => {
  it.each([
    ["no switch entry", (source) => setSheetWriteback(source, null)],
    ["a non-exact value", (source) => setSheetWriteback(source, "TRUE")],
    [
      "a secret-backed value",
      (source) => {
        const entry = source.containers[0].env.find((row) => row.name === SHEET_FLAG);
        delete entry.value;
        entry.valueSource = { secretKeyRef: { secret: "binding", version: "1" } };
      },
    ],
    [
      "duplicate entries",
      (source) => source.containers[0].env.push({ name: SHEET_FLAG, value: "false" }),
    ],
  ])("refuses to prepare recovery from a predecessor with %s", async (_label, mutate) => {
    const h = fixture();
    mutate(h.source);
    h.deps.captureOriginalBaseline = async () => ({
      ...h.receipt.originalBaseline,
      expectedConfigurationFingerprint: h.fingerprint(h.source),
    });
    await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow(
      /recovery_predecessor_sheet_writeback_unreadable|recovery_sheet_flag_ambiguous/,
    );
    expect(h.state.patches).toHaveLength(0);
    expect(existsSync(h.path)).toBe(false);
  });

  it("refuses a recovery template that would change the predecessor's actual value", async () => {
    const { predecessorActualTemplate, assertRecoveryTemplatePreservesPredecessor } =
      await recoveryModule();
    const h = fixture();
    const built = predecessorActualTemplate(h.source, h.target, h.receipt.imageDigests);
    expect(built.predecessorSheetWriteback).toBe("false");
    const changed = setSheetWriteback(structuredClone(built.template), "true");
    expect(() => assertRecoveryTemplatePreservesPredecessor(changed, "false")).toThrow(
      "recovery_template_changes_predecessor_sheet_writeback",
    );
    await expect(
      prepareRecoveryBaseline(h.input, {
        ...h.deps,
        buildTemplate: (...args) => {
          const real = predecessorActualTemplate(...args);
          return {
            ...real,
            template: setSheetWriteback(structuredClone(real.template), "true"),
            expected: setSheetWriteback(structuredClone(real.expected), "true"),
          };
        },
      }),
    ).rejects.toThrow("recovery_template_changes_predecessor_sheet_writeback");
    expect(h.state.patches).toHaveLength(0);
    expect(existsSync(h.path)).toBe(false);
  });

  it.each([
    [
      "no recorded predecessor value",
      (receipt) => delete receipt.predecessorSheetWriteback,
    ],
    [
      "a non-exact recorded value",
      (receipt) => (receipt.predecessorSheetWriteback = "on"),
    ],
    ["an unknown allowed difference", (receipt) => (receipt.allowedDifference = "none")],
  ])("refuses a recovery receipt with %s", (_label, mutate) => {
    const h = fixture({ prepared: true });
    const receipt = structuredClone(h.receipt);
    mutate(receipt);
    writeFileSync(h.path, JSON.stringify(receipt));
    expect(() => readRecoveryBaseline(h.reference)).toThrow("recovery_receipt_invalid");
  });
});

describe("S159 preservation: historical paused-recovery receipts keep their meaning", () => {
  it("still parses the S128 receipt shape and requires its target to read false", async () => {
    const { recoveryTargetSheetWriteback } = await recoveryModule();
    const h = fixture({
      prepared: true,
      legacyPausedReceipt: true,
      serving: "pmi-kc-app-candidate-isolated",
    });
    expect(h.receipt.allowedDifference).toBe(
      "sheet_writeback_false_and_revision_identity",
    );
    expect(h.receipt).not.toHaveProperty("predecessorSheetWriteback");
    const parsed = readRecoveryBaseline(h.reference);
    expect(recoveryTargetSheetWriteback(parsed)).toBe("false");
    expect((await recover(h)).state).toBe("ROLLED_BACK_VERIFIED");
    expect(flagOf(h.state.revisions.get(h.target))).toEqual(["false"]);
  });

  it("refuses a historical receipt's target that reads true, and a mixed receipt shape", async () => {
    const h = fixture({
      prepared: true,
      legacyPausedReceipt: true,
      serving: "pmi-kc-app-candidate-isolated",
    });
    setSheetWriteback(h.state.revisions.get(h.target), "true");
    await expect(recover(h)).rejects.toThrow("recovery_target_unverified");
    expect(h.state.patches).toHaveLength(0);
    writeFileSync(
      h.path,
      JSON.stringify({ ...h.receipt, predecessorSheetWriteback: "true" }),
    );
    expect(() => readRecoveryBaseline(h.reference)).toThrow("recovery_receipt_invalid");
  });
});

describe("S159 AC-S159-2: retired keys and refused recovery shortcuts stay closed", () => {
  it("keeps both retired compatibility keys closed and both exact keys as the only coupling", () => {
    expect(readSeedProductionAllowed("google_sheets.renewal_checklist.writeback")).toBe(
      false,
    );
    expect(readSeedProductionAllowed("rentvine.lease.renewal_writeback")).toBe(false);
    expect(readSeedProductionAllowed("google_sheets.renewal_checklist.row_append")).toBe(
      true,
    );
    expect(
      readSeedProductionAllowed("google_sheets.renewal_checklist.field_update"),
    ).toBe(true);
    const deploy = readFileSync(
      resolve(process.cwd(), "scripts/deploy-demo-cloud-run.mjs"),
      "utf8",
    );
    const keys = /const SHEET_WRITEBACK_ACTION_KEYS = \[([^\]]*)\]/.exec(deploy)[1];
    expect([...keys.matchAll(/"([^"]+)"/g)].map((match) => match[1])).toEqual([
      "google_sheets.renewal_checklist.row_append",
      "google_sheets.renewal_checklist.field_update",
    ]);
  });

  it("still refuses the retired image-only rollback redeploy", () => {
    expect(() => buildPausedRollbackRedeployPlan({})).toThrow(
      "receipt_bound_prepared_recovery_required",
    );
  });
});
