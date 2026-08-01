import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  MONITORING_MARKERS,
  loadMonitoringBundle,
  renderMonitoringBundle,
  validateMonitoringBundle,
} from "../../infra/monitoring/manifest.mjs";
import {
  buildMonitoringPlan,
  main,
  renderMonitoringPlan,
  resolveMonitoringConfig,
} from "../../scripts/setup-monitoring.mjs";

const OPERATOR_EMAIL = ["monitoring-fixture", "pmikcmetro.com"].join("@");
const PLAN_SCRIPT = fileURLToPath(
  new URL("../../scripts/setup-monitoring.mjs", import.meta.url),
);

function config(extra = []) {
  return resolveMonitoringConfig([`--operator-email=${OPERATOR_EMAIL}`, ...extra], {});
}

function allCommands(plan) {
  return plan.flatMap((step) => step.commands);
}

function isCommand(command, args) {
  return (
    command.command === args[0] &&
    args.slice(1).every((value, index) => command.args[index] === value)
  );
}

function policyDefinition(command) {
  const raw = command.args.find((arg) => arg.startsWith("--policy="));
  if (!raw) throw new Error("Expected a policy JSON argument.");
  return JSON.parse(raw.slice("--policy=".length));
}

function policyFilter(definition) {
  const condition = definition.conditions[0];
  return (
    condition.conditionThreshold?.filter ?? condition.conditionMatchedLog?.filter ?? ""
  );
}

function matchesMarker(filter, marker) {
  return filter.includes(`jsonPayload.marker="${marker}"`);
}

function successfulPreflight(overrides = {}) {
  return {
    LOG_BUCKET_RETENTION_DAYS_BEFORE: { ok: true, value: "30" },
    LOG_VIEWER_BINDING_BEFORE: { ok: true, value: "" },
    MONITORING_CHANNELS_BEFORE: { ok: true, value: "" },
    MONITORING_METRIC_BEFORE: { ok: true, value: "" },
    MONITORING_POLICIES_BEFORE: { ok: true, value: "" },
    ...overrides,
  };
}

function simulatePreflight(plan, outcomes) {
  let failed = false;
  for (const command of allCommands(plan).filter(
    (entry) => entry.kind === "checked-capture",
  )) {
    const outcome = outcomes[command.capture];
    if (!outcome?.ok) {
      failed = true;
      continue;
    }
    if (command.captureRule === "must-be-empty" && outcome.value !== "") {
      failed = true;
    }
    if (
      command.captureRule === "positive-integer" &&
      !/^[1-9][0-9]*$/.test(outcome.value)
    ) {
      failed = true;
    }
    if (
      command.captureRule === "empty-or-exact-log-viewer" &&
      !["", "roles/logging.viewer"].includes(outcome.value)
    ) {
      failed = true;
    }
  }
  const ready = !failed;
  return {
    mutationsReached: ready
      ? allCommands(plan).filter((command) => command.mutationMarker).length
      : 0,
    ready,
  };
}

describe("S51 print-only monitoring plan", () => {
  it("renders exactly one channel, one A2 metric, and four attached policies", () => {
    const resolved = config();
    const plan = buildMonitoringPlan(resolved);
    const commands = allCommands(plan);
    const channelCreates = commands.filter((command) =>
      isCommand(command, ["gcloud", "beta", "monitoring", "channels", "create"]),
    );
    const metricCreates = commands.filter((command) =>
      isCommand(command, ["gcloud", "logging", "metrics", "create"]),
    );
    const policyCreates = commands.filter((command) =>
      isCommand(command, ["gcloud", "monitoring", "policies", "create"]),
    );

    expect(channelCreates).toHaveLength(1);
    expect(metricCreates).toHaveLength(1);
    expect(policyCreates).toHaveLength(4);
    expect(channelCreates[0].args).toContain(
      `--channel-labels=email_address=${OPERATOR_EMAIL}`,
    );
    for (const command of policyCreates) {
      const channelFlag = command.args.indexOf("--notification-channels");
      expect(channelFlag).toBeGreaterThan(-1);
      expect(command.args[channelFlag + 1]).toBe("$MONITORING_CHANNEL_NAME");
    }

    const output = renderMonitoringPlan(resolved, plan);
    expect(output).toContain('--notification-channels "$MONITORING_CHANNEL_NAME"');
    expect(output).toContain("verificationStatus=VERIFIED");
    expect(output).toContain("run.googleapis.com/request_count");
    expect(output).toContain('response_code_class\\" = \\"5xx');
    expect(output).toContain(MONITORING_MARKERS.unresolvedLiveEffect);
    expect(output).toContain(MONITORING_MARKERS.costThresholdCrossed);
    expect(output).toContain(MONITORING_MARKERS.killSwitchFired);
    expect(output).toContain(MONITORING_MARKERS.killSwitchDisableFailed);
    expect(output).not.toContain(MONITORING_MARKERS.killSwitchAlreadyDisabled);
    const addresses = output.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
    expect(addresses?.length).toBeGreaterThan(1);
    expect(new Set(addresses)).toEqual(new Set([OPERATOR_EMAIL]));
  });

  it("prints reversible 30-day log retention and one exact direct viewer grant", () => {
    const resolved = config();
    const plan = buildMonitoringPlan(resolved);
    const commands = allCommands(plan);
    const bucketDescribes = commands.filter((command) =>
      isCommand(command, ["gcloud", "logging", "buckets", "describe", "_Default"]),
    );
    const bucketUpdates = commands.filter((command) =>
      isCommand(command, ["gcloud", "logging", "buckets", "update", "_Default"]),
    );
    const iamReads = commands.filter((command) =>
      isCommand(command, ["gcloud", "projects", "get-iam-policy"]),
    );
    const iamAdds = commands.filter((command) =>
      isCommand(command, ["gcloud", "projects", "add-iam-policy-binding"]),
    );
    const iamRemovals = commands.filter((command) =>
      isCommand(command, ["gcloud", "projects", "remove-iam-policy-binding"]),
    );

    expect(bucketDescribes).toHaveLength(2);
    expect(bucketDescribes[0]).toMatchObject({
      capture: "LOG_BUCKET_RETENTION_DAYS_BEFORE",
    });
    expect(bucketUpdates).toHaveLength(2);
    expect(bucketUpdates[0].args).toContain("--retention-days=30");
    expect(bucketUpdates[1].args).toContain("$LOG_BUCKET_RETENTION_DAYS_BEFORE");
    expect(iamReads).toHaveLength(2);
    expect(iamReads[0]).toMatchObject({ capture: "LOG_VIEWER_BINDING_BEFORE" });
    for (const read of iamReads) {
      expect(read.args).toContain(
        `--filter=bindings.role="roles/logging.viewer" AND bindings.members="user:${OPERATOR_EMAIL}" AND -bindings.condition:*`,
      );
    }
    expect(iamAdds).toHaveLength(1);
    expect(iamAdds[0].args).toEqual(
      expect.arrayContaining([
        `--member=user:${OPERATOR_EMAIL}`,
        "--role=roles/logging.viewer",
        "--condition=None",
      ]),
    );
    expect(iamRemovals).toHaveLength(1);
    expect(iamRemovals[0]).toMatchObject({
      rollbackMarker: "LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN",
    });
    expect(iamRemovals[0].args).toEqual(
      expect.arrayContaining([
        `--member=user:${OPERATOR_EMAIL}`,
        "--role=roles/logging.viewer",
        "--condition=None",
      ]),
    );

    const serializedCommands = JSON.stringify(commands);
    expect(serializedCommands).not.toContain("roles/logging.privateLogViewer");
    for (const primitiveRole of ["roles/owner", "roles/editor", "roles/viewer"]) {
      expect(serializedCommands).not.toContain(`--role=${primitiveRole}`);
    }

    const output = renderMonitoringPlan(resolved, plan);
    expect(output).toContain(
      'if LOG_BUCKET_RETENTION_DAYS_BEFORE="$(gcloud logging buckets describe _Default',
    );
    expect(output).toContain("--retention-days=30");
    expect(output).toContain('--retention-days "$LOG_BUCKET_RETENTION_DAYS_BEFORE"');
    expect(output).toContain(
      'if test "${LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN:-0}" = 1; then',
    );
    expect(output).not.toContain(
      'if test -z "$LOG_VIEWER_BINDING_BEFORE"; then gcloud projects remove-iam-policy-binding',
    );
  });

  it("checks every existence and before-state read before the first mutator", () => {
    const plan = buildMonitoringPlan(config());
    const commands = allCommands(plan);
    const captureIndexes = commands
      .map((command, index) => (command.kind === "checked-capture" ? index : -1))
      .filter((index) => index >= 0);
    const firstMutation = commands.findIndex((command) => command.mutationMarker);

    expect(
      commands
        .filter((command) => command.kind === "checked-capture")
        .map((command) => [command.capture, command.captureRule]),
    ).toEqual([
      ["MONITORING_CHANNELS_BEFORE", "must-be-empty"],
      ["MONITORING_POLICIES_BEFORE", "must-be-empty"],
      ["MONITORING_METRIC_BEFORE", "must-be-empty"],
      ["LOG_BUCKET_RETENTION_DAYS_BEFORE", "positive-integer"],
      ["LOG_VIEWER_BINDING_BEFORE", "empty-or-exact-log-viewer"],
    ]);
    expect(Math.max(...captureIndexes)).toBeLessThan(firstMutation);
    expect(commands[firstMutation - 1]).toMatchObject({
      kind: "preflight-finalize",
    });
  });

  it("distinguishes a failed IAM capture from a successful absent binding", () => {
    const plan = buildMonitoringPlan(config());

    expect(
      simulatePreflight(
        plan,
        successfulPreflight({
          LOG_VIEWER_BINDING_BEFORE: { ok: false, value: "" },
        }),
      ),
    ).toEqual({ mutationsReached: 0, ready: false });
    expect(simulatePreflight(plan, successfulPreflight())).toEqual({
      mutationsReached: 8,
      ready: true,
    });

    const output = renderMonitoringPlan(config(), plan);
    expect(output).toContain(
      'if LOG_VIEWER_BINDING_BEFORE="$(gcloud projects get-iam-policy',
    );
    expect(output).toContain("unset LOG_VIEWER_BINDING_BEFORE");
    expect(output).toContain("log_viewer_before_state_unreadable");
    expect(output).toContain('if test "${S51_MONITORING_PREFLIGHT_FAILED:-1}" = 0; then');
    expect(output).toContain('if test "${S51_MONITORING_PREFLIGHT_READY:-0}" = 1');
  });

  it.each([
    ["managed channel", "MONITORING_CHANNELS_BEFORE"],
    ["managed policy", "MONITORING_POLICIES_BEFORE"],
    ["fixed metric", "MONITORING_METRIC_BEFORE"],
  ])("refuses fresh setup when a pre-existing %s is observed", (_, capture) => {
    const plan = buildMonitoringPlan(config());
    const simulated = simulatePreflight(
      plan,
      successfulPreflight({
        [capture]: { ok: true, value: "projects/fixture/existing" },
      }),
    );

    expect(simulated).toEqual({ mutationsReached: 0, ready: false });
  });

  it("refuses a zero-day retention before any setup mutation", () => {
    const plan = buildMonitoringPlan(config());
    const simulated = simulatePreflight(
      plan,
      successfulPreflight({
        LOG_BUCKET_RETENTION_DAYS_BEFORE: { ok: true, value: "0" },
      }),
    );

    expect(simulated).toEqual({ mutationsReached: 0, ready: false });
    expect(renderMonitoringPlan(config(), plan)).toContain('""|0|*[!0-9]*)');
  });

  it("renders rerun refusal and exact run-owned rollback guards", () => {
    const plan = buildMonitoringPlan(config());
    const commands = allCommands(plan);
    const mutations = commands.filter((command) => command.mutationMarker);
    const rollbacks = commands.filter((command) => command.rollbackMarker);
    const output = renderMonitoringPlan(config(), plan);

    expect(
      simulatePreflight(
        plan,
        successfulPreflight({
          MONITORING_CHANNELS_BEFORE: { ok: true, value: "existing-channel" },
          MONITORING_METRIC_BEFORE: { ok: true, value: "existing-metric" },
          MONITORING_POLICIES_BEFORE: { ok: true, value: "existing-policy" },
        }),
      ),
    ).toEqual({ mutationsReached: 0, ready: false });
    expect(mutations).toHaveLength(8);
    expect(rollbacks).toHaveLength(8);
    const mutationMarkers = mutations.map((command) => command.mutationMarker);
    const rollbackMarkers = rollbacks.map((command) => command.rollbackMarker);
    expect(new Set(mutationMarkers).size).toBe(mutationMarkers.length);
    expect(new Set(rollbackMarkers).size).toBe(rollbackMarkers.length);
    expect(new Set(rollbackMarkers)).toEqual(new Set(mutationMarkers));
    for (const marker of mutations.map((command) => command.mutationMarker)) {
      expect(output).toContain(`test "\${${marker}:-0}" = 0; then`);
    }
    for (const marker of rollbacks.map((command) => command.rollbackMarker)) {
      expect(output).toContain(`if test "\${${marker}:-0}" = 1; then`);
      expect(output).toContain(`${marker}=0`);
    }
    expect(output).toContain("managed_channel_already_exists");
    expect(output).toContain("managed_policy_already_exists");
    expect(output).toContain("managed_metric_already_exists");
    expect(output).not.toContain("whenVariableEmpty");
  });

  it("renders as valid Bash without executing any generated command", () => {
    const output = renderMonitoringPlan(config());
    const syntax = spawnSync("bash", ["-n"], {
      encoding: "utf8",
      input: output,
    });

    expect(syntax.status).toBe(0);
    expect(syntax.stdout).toBe("");
    expect(syntax.stderr).toBe("");
  });

  it("does not treat a pre-existing conditional viewer binding as the unconditional grant", () => {
    const commands = allCommands(buildMonitoringPlan(config()));
    const iamReads = commands.filter((command) =>
      isCommand(command, ["gcloud", "projects", "get-iam-policy"]),
    );
    const exactUnconditionalFilter =
      `--filter=bindings.role="roles/logging.viewer" AND ` +
      `bindings.members="user:${OPERATOR_EMAIL}" AND -bindings.condition:*`;

    expect(iamReads).toHaveLength(2);
    expect(
      iamReads.every((command) => command.args.includes(exactUnconditionalFilter)),
    ).toBe(true);
    expect(iamReads[0]).toMatchObject({
      capture: "LOG_VIEWER_BINDING_BEFORE",
    });

    const output = renderMonitoringPlan(config());
    expect(output).toContain("AND -bindings.condition:*");
    expect(output).toContain("--condition=None");
    expect(output).toContain('if test -z "$LOG_VIEWER_BINDING_BEFORE"; then');
  });

  it("keeps A3 and A4 exact and mutually exclusive for the named markers", () => {
    const commands = allCommands(buildMonitoringPlan(config())).filter((command) =>
      isCommand(command, ["gcloud", "monitoring", "policies", "create"]),
    );
    const definitions = new Map(
      commands.map((command) => {
        const definition = policyDefinition(command);
        return [definition.userLabels.policy_key, definition];
      }),
    );
    const a3 = policyFilter(definitions.get("a3"));
    const a4 = policyFilter(definitions.get("a4"));

    expect(matchesMarker(a3, MONITORING_MARKERS.costThresholdCrossed)).toBe(true);
    expect(matchesMarker(a3, MONITORING_MARKERS.killSwitchFired)).toBe(false);
    expect(matchesMarker(a3, MONITORING_MARKERS.killSwitchDisableFailed)).toBe(false);
    expect(matchesMarker(a4, MONITORING_MARKERS.costThresholdCrossed)).toBe(false);
    expect(matchesMarker(a4, MONITORING_MARKERS.killSwitchFired)).toBe(true);
    expect(matchesMarker(a4, MONITORING_MARKERS.killSwitchDisableFailed)).toBe(true);
    expect(matchesMarker(a3, MONITORING_MARKERS.killSwitchAlreadyDisabled)).toBe(false);
    expect(matchesMarker(a4, MONITORING_MARKERS.killSwitchAlreadyDisabled)).toBe(false);
  });

  it("pins the A2 metric to one label-free live failed-or-ambiguous counter", () => {
    const bundle = renderMonitoringBundle(loadMonitoringBundle(), config());
    expect(bundle.logMetrics).toHaveLength(1);
    expect(bundle.logMetrics[0].definition).toMatchObject({
      disabled: false,
      metricDescriptor: {
        metricKind: "DELTA",
        unit: "1",
        valueType: "INT64",
      },
    });
    expect(bundle.logMetrics[0].definition.metricDescriptor.labels).toBeUndefined();
    const filter = bundle.logMetrics[0].definition.filter;
    for (const expected of [
      'resource.type="cloud_run_revision"',
      'resource.labels.project_id="pmi-kc-kb-prod"',
      'resource.labels.location="us-central1"',
      'resource.labels.service_name="pmi-kc-app"',
      'jsonPayload.marker="LIVE_EFFECT_REQUIRES_ATTENTION"',
      'jsonPayload.data_mode="live"',
      'jsonPayload.state="failed"',
      'jsonPayload.state="ambiguous"',
    ]) {
      expect(filter).toContain(expected);
    }
  });

  it("fails bundle validation when a paging filter is broadened", () => {
    const bundle = structuredClone(loadMonitoringBundle());
    const a4 = bundle.policies.find((policy) => policy.key === "a4");
    a4.definition.conditions[0].conditionMatchedLog.filter += ` OR jsonPayload.marker="${MONITORING_MARKERS.killSwitchAlreadyDisabled}"`;

    expect(() => validateMonitoringBundle(bundle)).toThrow(
      /A4 log-match signal|already-disabled/i,
    );
  });

  it.each([
    {
      label: "a bucket-scoped metric",
      mutate(bundle) {
        bundle.logMetrics[0].definition.bucketName =
          "projects/pmi-kc-kb-prod/locations/global/buckets/value-bearing";
      },
    },
    {
      label: "a ratio denominator",
      mutate(bundle) {
        bundle.policies.find(
          (policy) => policy.key === "a1",
        ).definition.conditions[0].conditionThreshold.denominatorFilter =
          'metric.type = "custom.googleapis.com/other"';
      },
    },
    {
      label: "a value-bearing log-match extractor",
      mutate(bundle) {
        bundle.policies.find(
          (policy) => policy.key === "a3",
        ).definition.conditions[0].conditionMatchedLog.labelExtractors = {
          recipient: "EXTRACT(jsonPayload.recipient)",
        };
      },
    },
    {
      label: "an unexpected active policy field",
      mutate(bundle) {
        bundle.policies.find((policy) => policy.key === "a4").definition.severity =
          "CRITICAL";
      },
    },
    {
      label: "an unexpected notification subject",
      mutate(bundle) {
        bundle.policies.find(
          (policy) => policy.key === "a2",
        ).definition.documentation.subject = "Value-bearing subject";
      },
    },
    {
      label: "an extra policy user label",
      mutate(bundle) {
        bundle.policies.find(
          (policy) => policy.key === "a3",
        ).definition.userLabels.extra_label = "must_not_expand";
      },
    },
    {
      label: "an extra channel user label",
      mutate(bundle) {
        bundle.manifest.channel.userLabels.extra_label = "must_not_hide_duplicate";
      },
    },
    {
      label: "a drifted default target",
      mutate(bundle) {
        bundle.manifest.defaults.project = "pmi-kc-other-prod";
      },
    },
  ])("fails bundle validation on $label", ({ mutate }) => {
    const bundle = structuredClone(loadMonitoringBundle());
    mutate(bundle);

    expect(() => validateMonitoringBundle(bundle)).toThrow(/monitoring/i);
  });

  it("refuses missing, conflicting, external, duplicate, and shell-unsafe inputs", () => {
    expect(() => resolveMonitoringConfig([], {})).toThrow(/operator address/i);
    expect(() =>
      resolveMonitoringConfig([`--operator-email=${OPERATOR_EMAIL}`], {
        MONITORING_OPERATOR_EMAIL: ["different-fixture", "pmikcmetro.com"].join("@"),
      }),
    ).toThrow(/disagree/i);
    expect(() =>
      resolveMonitoringConfig(["--operator-email=fixture@example.invalid"], {}),
    ).toThrow(/pmikcmetro\.com/i);
    expect(() =>
      resolveMonitoringConfig(
        [`--operator-email=${OPERATOR_EMAIL}`, `--operator-email=${OPERATOR_EMAIL}`],
        {},
      ),
    ).toThrow(/more than once/i);
    expect(() =>
      resolveMonitoringConfig(
        [`--operator-email=${OPERATOR_EMAIL}`, "--service=good;gcloud"],
        {},
      ),
    ).toThrow(/shell-unsafe/i);
    expect(() => buildMonitoringPlan({ ...config() })).toThrow(
      /validated configuration/i,
    );
    const resolved = config();
    expect(() =>
      renderMonitoringPlan(resolved, structuredClone(buildMonitoringPlan(resolved))),
    ).toThrow(/generated plan/i);
  });

  it("refuses before stdout when the operator address is absent", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const setExitCode = vi.fn();

    const result = await main([], {}, { setExitCode, stderr, stdout });

    expect(result).toMatchObject({ status: "refused" });
    expect(stdout).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledOnce();
    expect(String(stderr.mock.calls[0][0])).not.toMatch(/gcloud|token|secret/i);
  });

  it("is import-pure and has no process or network execution primitive", () => {
    const source = readFileSync(PLAN_SCRIPT, "utf8");
    expect(source).not.toMatch(
      /node:(?:child_process|http|https|net|tls|dgram)|\bfetch\s*\(/,
    );

    const imported = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import(${JSON.stringify(pathToFileURL(PLAN_SCRIPT).href)})`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, MONITORING_OPERATOR_EMAIL: "" },
      },
    );
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toBe("");

    const refused = spawnSync(process.execPath, [PLAN_SCRIPT], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, MONITORING_OPERATOR_EMAIL: "" },
    });
    expect(refused.status).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).not.toMatch(/gcloud|token|secret/i);
  });
});
