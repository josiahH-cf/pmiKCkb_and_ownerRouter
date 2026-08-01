import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  RollbackRehearsalRefusal,
  buildRollbackRehearsalPlan,
  main,
  renderRollbackRehearsalPlan,
  resolveRollbackRehearsalConfig,
} from "../../scripts/rehearse-rollback.mjs";

const CANDIDATE_REVISION = "pmi-kc-app-rmrm9mp6v-04c897acee28";
const PRIOR_REVISION = "pmi-kc-app-rmrm8t6y7-d250f83ddfee";
const GENERATED_AT = "2026-07-30T12:34:56.000Z";
const SCRIPT_PATH = fileURLToPath(
  new URL("../../scripts/rehearse-rollback.mjs", import.meta.url),
);

function validArgs(extra = []) {
  return [
    `--candidate-revision=${CANDIDATE_REVISION}`,
    `--prior-revision=${PRIOR_REVISION}`,
    `--generated-at=${GENERATED_AT}`,
    ...extra,
  ];
}

function config(extra = []) {
  return resolveRollbackRehearsalConfig(validArgs(extra));
}

function commands(plan) {
  return plan.steps.flatMap((step) => step.commands);
}

describe("S51 print-only rollback rehearsal", () => {
  it("prints candidate, captured prior, exact promote, rollback, and forward commands", () => {
    const resolved = config();
    const plan = buildRollbackRehearsalPlan(resolved);
    const output = renderRollbackRehearsalPlan(resolved, plan);
    const trafficCommands = commands(plan).filter((entry) =>
      entry.args.some((argument) => argument.startsWith("--to-revisions=")),
    );

    expect(trafficCommands).toHaveLength(3);
    expect(trafficCommands.map((entry) => entry.args)).toEqual([
      expect.arrayContaining([`--to-revisions=${CANDIDATE_REVISION}=100`]),
      expect.arrayContaining([`--to-revisions=${PRIOR_REVISION}=100`]),
      expect.arrayContaining([`--to-revisions=${CANDIDATE_REVISION}=100`]),
    ]);
    expect(output).toContain("resolve_candidate");
    expect(output).toContain("capture_prior");
    expect(output).toContain("promote_candidate");
    expect(output).toContain("rollback_prior");
    expect(output).toContain("restore_forward");
    expect(output).toContain(`"candidate_revision":"${CANDIDATE_REVISION}"`);
    expect(output).toContain(`"prior_revision":"${PRIOR_REVISION}"`);
    expect(output).not.toContain("--to-latest");
  });

  it("emits a sanitized, truthful dry-run evidence envelope only", () => {
    const resolved = config();
    const plan = buildRollbackRehearsalPlan(resolved);

    expect(Object.keys(plan.evidence).sort()).toEqual([
      "candidate_revision",
      "counts",
      "generated_at",
      "http_codes",
      "prior_revision",
      "status",
    ]);
    expect(plan.evidence).toEqual({
      candidate_revision: CANDIDATE_REVISION,
      prior_revision: PRIOR_REVISION,
      generated_at: GENERATED_AT,
      status: "dry_run",
      http_codes: [],
      counts: {
        commands_executed: 0,
        commands_printed: 8,
        http_codes_recorded: 0,
        traffic_mutations_executed: 0,
      },
    });

    const output = renderRollbackRehearsalPlan(resolved, plan);
    expect(output).toContain("PRINT-ONLY - nothing was executed");
    expect(output).toContain("never response bodies");
    expect(output).not.toMatch(
      /recipient|resident|tenant|message[_ ]body|access[_ -]?token/i,
    );
    expect(() =>
      renderRollbackRehearsalPlan(resolved, {
        evidence: { note: "unvalidated value" },
        steps: [],
      }),
    ).toThrow(expect.objectContaining({ code: "plan_unvalidated" }));
  });

  it("renders through main without invoking an execution dependency", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const setExitCode = vi.fn();

    const result = main(validArgs(["--dry-run"]), {
      now: new Date(GENERATED_AT),
      setExitCode,
      stderr,
      stdout,
    });

    expect(result.status).toBe("rendered");
    expect(stdout).toHaveBeenCalledOnce();
    expect(stderr).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
    expect(result.plan.evidence.counts.commands_executed).toBe(0);
    expect(result.plan.evidence.counts.traffic_mutations_executed).toBe(0);
  });

  it.each([
    {
      label: "missing prior",
      args: [
        `--candidate-revision=${CANDIDATE_REVISION}`,
        `--generated-at=${GENERATED_AT}`,
      ],
      code: "prior_revision_required",
    },
    {
      label: "wrong-service prior",
      args: [
        `--candidate-revision=${CANDIDATE_REVISION}`,
        "--prior-revision=another-service-rmrm8t6y7-d250f83ddfee",
        `--generated-at=${GENERATED_AT}`,
      ],
      code: "prior_revision_service_mismatch",
    },
    {
      label: "overlong prior",
      args: [
        `--candidate-revision=${CANDIDATE_REVISION}`,
        `--prior-revision=pmi-kc-app-${"a".repeat(64)}`,
        `--generated-at=${GENERATED_AT}`,
      ],
      code: "prior_revision_too_long",
    },
  ])("refuses $label with a named error", ({ args, code }) => {
    expect(() => resolveRollbackRehearsalConfig(args)).toThrow(RollbackRehearsalRefusal);
    try {
      resolveRollbackRehearsalConfig(args);
    } catch (error) {
      expect(error).toMatchObject({ code });
    }
  });

  it("uses the same exact-target guard for the candidate and refuses identical targets", () => {
    expect(() =>
      resolveRollbackRehearsalConfig([
        "--candidate-revision=wrong-service-candidate",
        `--prior-revision=${PRIOR_REVISION}`,
      ]),
    ).toThrow(expect.objectContaining({ code: "candidate_revision_service_mismatch" }));

    expect(() =>
      resolveRollbackRehearsalConfig([
        `--candidate-revision=${CANDIDATE_REVISION}`,
        `--prior-revision=${CANDIDATE_REVISION}`,
      ]),
    ).toThrow(expect.objectContaining({ code: "revision_targets_not_distinct" }));
  });

  it("cannot drift a command or target after configuration validation", () => {
    const resolved = config();
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolved).not.toHaveProperty("candidateTrafficCommand");
    expect(resolved).not.toHaveProperty("priorTrafficCommand");

    expect(() => {
      resolved.candidateRevision = "unrelated-service-revision";
    }).toThrow(TypeError);

    const plan = buildRollbackRehearsalPlan(resolved);
    const trafficCommands = commands(plan).filter((entry) =>
      entry.args.some((argument) => argument.startsWith("--to-revisions=")),
    );
    expect(trafficCommands).toHaveLength(3);
    for (const trafficCommand of trafficCommands) {
      expect(Object.isFrozen(trafficCommand)).toBe(true);
      expect(Object.isFrozen(trafficCommand.args)).toBe(true);
      expect(() => {
        trafficCommand.args[0] = "not-gcloud";
      }).toThrow(TypeError);
      expect(trafficCommand.command).toBe("gcloud");
      expect(trafficCommand.args).toContain("pmi-kc-app");
    }
    expect(trafficCommands[0].args).toContain(`--to-revisions=${CANDIDATE_REVISION}=100`);
    expect(trafficCommands[1].args).toContain(`--to-revisions=${PRIOR_REVISION}=100`);
    expect(trafficCommands[2].args).toContain(`--to-revisions=${CANDIDATE_REVISION}=100`);
  });

  it("has no execute flag, process runner, cloud client, or network primitive", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");
    for (const forbidden of [
      /node:child_process/,
      /\bspawn(?:Sync)?\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfetch\s*\(/,
      /google-auth-library/,
      /@google-cloud/,
      /node:https?/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }

    expect(() => resolveRollbackRehearsalConfig(validArgs(["--execute"]))).toThrow(
      expect.objectContaining({ code: "argument_shape_invalid" }),
    );
  });

  it("fails before stdout and never reflects rejected values", () => {
    const rejectedValue = ["resident.fixture", "example.invalid"].join("@");
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        `--candidate-revision=${CANDIDATE_REVISION}`,
        `--prior-revision=${PRIOR_REVISION}`,
        `--note=${rejectedValue}`,
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("argument_unsupported");
    expect(result.stderr).not.toContain(rejectedValue);
  });
});
