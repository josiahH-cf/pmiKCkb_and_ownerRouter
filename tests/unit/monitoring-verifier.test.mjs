import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  loadMonitoringBundle,
  renderMonitoringBundle,
} from "../../infra/monitoring/manifest.mjs";
import { resolveMonitoringConfig } from "../../scripts/setup-monitoring.mjs";
import {
  evaluateMonitoringState,
  fetchMonitoringState,
  main,
  renderMonitoringVerification,
} from "../../scripts/verify-monitoring.mjs";

const OPERATOR_EMAIL = ["monitoring-fixture", "pmikcmetro.com"].join("@");
const VERIFY_SCRIPT = fileURLToPath(
  new URL("../../scripts/verify-monitoring.mjs", import.meta.url),
);

function config() {
  return resolveMonitoringConfig([`--operator-email=${OPERATOR_EMAIL}`], {});
}

function exactState() {
  const resolved = config();
  const bundle = renderMonitoringBundle(loadMonitoringBundle(), resolved);
  const channelName = `projects/${resolved.project}/notificationChannels/channel-s51`;
  return {
    credentialsAvailable: true,
    errors: [],
    channels: [
      {
        displayName: bundle.manifest.channel.displayName,
        enabled: true,
        labels: { email_address: OPERATOR_EMAIL },
        name: channelName,
        type: bundle.manifest.channel.type,
        userLabels: bundle.manifest.channel.userLabels,
        verificationStatus: "VERIFIED",
      },
    ],
    metrics: bundle.logMetrics.map((metric) => ({
      ...metric.definition,
      name: metric.metricId,
      resourceName: `projects/${resolved.project}/metrics/${metric.metricId}`,
    })),
    policies: bundle.policies.map((policy) => ({
      ...policy.definition,
      conditions: policy.definition.conditions.map((condition, index) => ({
        ...condition,
        name:
          `projects/${resolved.project}/alertPolicies/policy-${policy.key}` +
          `/conditions/condition-${index}`,
      })),
      name: `projects/${resolved.project}/alertPolicies/policy-${policy.key}`,
      notificationChannels: [channelName],
    })),
  };
}

describe("S51 read-only monitoring verifier", () => {
  it("accepts one exact channel, metric, and four attached policies", () => {
    const report = evaluateMonitoringState(config(), exactState());

    expect(report.status).toBe("ready");
    expect(report.checks).toHaveLength(7);
    expect(report.checks.every((check) => check.status === "ready")).toBe(true);
    const rendered = renderMonitoringVerification(report);
    expect(rendered).toContain("READY");
    expect(rendered).not.toContain(OPERATOR_EMAIL);
  });

  it.each([
    {
      label: "missing channel",
      mutate(state) {
        state.channels = [];
      },
    },
    {
      label: "duplicate managed channel",
      mutate(state) {
        state.channels.push({
          ...state.channels[0],
          name: `${state.channels[0].name}-2`,
        });
      },
    },
    {
      label: "wrong operator",
      mutate(state) {
        state.channels[0].labels.email_address = ["other-fixture", "pmikcmetro.com"].join(
          "@",
        );
      },
    },
    {
      label: "unverified operator channel",
      mutate(state) {
        state.channels[0].verificationStatus = "UNVERIFIED";
      },
    },
    {
      label: "near-duplicate managed channel",
      mutate(state) {
        state.channels.push({
          ...state.channels[0],
          name: `${state.channels[0].name}-extra`,
          userLabels: {
            ...state.channels[0].userLabels,
            extra_label: "must_not_hide_duplicate",
          },
        });
      },
    },
    {
      label: "broadened A2 metric",
      mutate(state) {
        state.metrics[0].filter += " OR severity>=DEFAULT";
      },
    },
    {
      label: "wrong A2 metric resource name",
      mutate(state) {
        state.metrics[0].resourceName =
          "projects/other-project/metrics/pmi_kc_unresolved_live_effect_count";
      },
    },
    {
      label: "bucket-scoped A2 metric",
      mutate(state) {
        state.metrics[0].bucketName =
          "projects/pmi-kc-kb-prod/locations/global/buckets/value-bearing";
      },
    },
    {
      label: "value-bearing metric label",
      mutate(state) {
        state.metrics[0].metricDescriptor.labels = [{ key: "recipient" }];
      },
    },
    {
      label: "ratio denominator on A1",
      mutate(state) {
        state.policies.find(
          (policy) => policy.userLabels.policy_key === "a1",
        ).conditions[0].conditionThreshold.denominatorFilter =
          'metric.type = "custom.googleapis.com/other"';
      },
    },
    {
      label: "PII-bearing log-match extractor on A3",
      mutate(state) {
        state.policies.find(
          (policy) => policy.userLabels.policy_key === "a3",
        ).conditions[0].conditionMatchedLog.labelExtractors = {
          recipient: "EXTRACT(jsonPayload.recipient)",
        };
      },
    },
    {
      label: "invalid A2 policy",
      mutate(state) {
        state.policies.find((policy) => policy.userLabels.policy_key === "a2").validity =
          {
            code: 3,
            message: "fixture policy is invalid",
          };
      },
    },
    {
      label: "unexpected active policy field",
      mutate(state) {
        state.policies.find((policy) => policy.userLabels.policy_key === "a4").severity =
          "CRITICAL";
      },
    },
    {
      label: "disabled A4",
      mutate(state) {
        state.policies.find((policy) => policy.userLabels.policy_key === "a4").enabled =
          false;
      },
    },
    {
      label: "unexpected fifth managed policy",
      mutate(state) {
        const extra = structuredClone(state.policies[0]);
        extra.name = "projects/pmi-kc-kb-prod/alertPolicies/policy-a5";
        extra.userLabels.policy_key = "a5";
        state.policies.push(extra);
      },
    },
    {
      label: "wrong notification channel",
      mutate(state) {
        state.policies.find(
          (policy) => policy.userLabels.policy_key === "a2",
        ).notificationChannels = [
          "projects/pmi-kc-kb-prod/notificationChannels/unrelated",
        ];
      },
    },
  ])("fails closed on $label", ({ mutate }) => {
    const state = exactState();
    mutate(state);

    const report = evaluateMonitoringState(config(), state);

    expect(report.status).toBe("drift");
    expect(report.checks.some((check) => check.status === "drift")).toBe(true);
  });

  it("ignores unrelated cloud resources without accepting managed duplicates", () => {
    const state = exactState();
    state.channels.push({
      displayName: "Unrelated",
      enabled: true,
      labels: { email_address: "external@example.invalid" },
      name: "projects/pmi-kc-kb-prod/notificationChannels/unrelated",
      type: "email",
      userLabels: { managed_by: "someone_else" },
    });
    state.metrics.push({
      name: "projects/pmi-kc-kb-prod/metrics/unrelated",
    });
    state.policies.push({
      name: "projects/pmi-kc-kb-prod/alertPolicies/unrelated",
      userLabels: { managed_by: "someone_else" },
    });

    expect(evaluateMonitoringState(config(), state).status).toBe("ready");
  });

  it("uses only bounded paginated GET requests to the two read API hosts", async () => {
    const requests = [];
    const request = vi.fn(async (options) => {
      requests.push(options);
      const url = new URL(options.url);
      const pageToken = url.searchParams.get("pageToken");
      const responseKey = url.pathname.endsWith("/alertPolicies")
        ? "alertPolicies"
        : url.pathname.endsWith("/notificationChannels")
          ? "notificationChannels"
          : "metrics";
      return {
        data: {
          [responseKey]: [{ name: `${responseKey}-${pageToken ?? "first"}` }],
          ...(pageToken ? {} : { nextPageToken: `next-${responseKey}` }),
        },
      };
    });

    const state = await fetchMonitoringState(config(), { maxPages: 10, request });

    expect(state.credentialsAvailable).toBe(true);
    expect(state.errors).toEqual([]);
    expect(state.policies).toHaveLength(2);
    expect(state.channels).toHaveLength(2);
    expect(state.metrics).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(6);
    for (const options of requests) {
      const url = new URL(options.url);
      expect(options).toEqual({ method: "GET", url: options.url });
      expect(["monitoring.googleapis.com", "logging.googleapis.com"]).toContain(
        url.hostname,
      );
      expect(url.protocol).toBe("https:");
      expect(url.searchParams.get("pageSize")).toBe("100");
    }
  });

  it("fails closed on cyclic pagination, malformed reads, or missing credentials", async () => {
    const cyclic = await fetchMonitoringState(config(), {
      maxPages: 3,
      request: vi.fn(async (options) => {
        const url = new URL(options.url);
        const responseKey = url.pathname.endsWith("/alertPolicies")
          ? "alertPolicies"
          : url.pathname.endsWith("/notificationChannels")
            ? "notificationChannels"
            : "metrics";
        return {
          data: {
            [responseKey]: [],
            nextPageToken: "same-token",
          },
        };
      }),
    });
    expect(cyclic.errors).toEqual([
      "policies_read_failed",
      "channels_read_failed",
      "metrics_read_failed",
    ]);
    expect(evaluateMonitoringState(config(), cyclic)).toMatchObject({
      reason: "read_incomplete",
      status: "unverified",
    });

    const malformed = await fetchMonitoringState(config(), {
      request: vi.fn(async (options) => {
        const path = new URL(options.url).pathname;
        const responseKey = path.endsWith("/alertPolicies")
          ? "alertPolicies"
          : path.endsWith("/notificationChannels")
            ? "notificationChannels"
            : "metrics";
        return { data: { [responseKey]: "not-an-array" } };
      }),
    });
    expect(malformed.errors).toHaveLength(3);

    const unavailable = await fetchMonitoringState(config(), {
      authFactory: vi.fn(async () => {
        throw new Error("fixture credential includes secret-that-must-not-escape");
      }),
    });
    expect(unavailable).toMatchObject({
      credentialsAvailable: false,
      errors: ["credentials_unavailable"],
    });
    expect(
      renderMonitoringVerification(evaluateMonitoringState(config(), unavailable)),
    ).not.toContain("secret-that-must-not-escape");
  });

  it("requires one explicit --live before auth or network work", async () => {
    const fetchState = vi.fn();
    const stdout = vi.fn();
    const stderr = vi.fn();
    const setExitCode = vi.fn();

    const missing = await main(
      [`--operator-email=${OPERATOR_EMAIL}`],
      {},
      { fetchState, setExitCode, stderr, stdout },
    );
    expect(missing).toMatchObject({ status: "refused" });
    expect(fetchState).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);

    fetchState.mockClear();
    stdout.mockClear();
    stderr.mockClear();
    setExitCode.mockClear();
    const duplicate = await main(
      ["--live", "--live", `--operator-email=${OPERATOR_EMAIL}`],
      {},
      { fetchState, setExitCode, stderr, stdout },
    );
    expect(duplicate).toMatchObject({ status: "refused" });
    expect(fetchState).not.toHaveBeenCalled();
  });

  it("prints only the redacted evaluated report in explicit live mode", async () => {
    const state = exactState();
    state.unrelated = {
      recipient: "resident@example.invalid",
      secret: "fixture-secret-value",
      tenant: "Tenant Name",
      unit: "Unit 123",
    };
    const stdout = vi.fn();
    const stderr = vi.fn();
    const setExitCode = vi.fn();

    const report = await main(
      ["--live", "--json", `--operator-email=${OPERATOR_EMAIL}`],
      {},
      {
        fetchState: vi.fn(async () => state),
        setExitCode,
        stderr,
        stdout,
      },
    );

    expect(report.status).toBe("ready");
    expect(stderr).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
    const output = String(stdout.mock.calls[0][0]);
    expect(output).not.toMatch(
      /resident@example\.invalid|fixture-secret-value|Tenant Name|Unit 123|monitoring-fixture@/,
    );
  });

  it("contains no mutation request or command-execution primitive", () => {
    const source = readFileSync(VERIFY_SCRIPT, "utf8");
    expect(source).not.toMatch(/node:child_process|execFile|spawnSync|execSync/);
    const methods = [...source.matchAll(/method:\s*"([A-Z]+)"/g)].map(
      (match) => match[1],
    );
    expect(methods).toEqual(["GET"]);
    expect(source).not.toMatch(/method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  });
});
