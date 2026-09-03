// READ-ONLY S51 monitoring verifier.
//
// Importing this module performs no authentication and opens no network connection. The CLI refuses
// unless --live is explicit. In live mode it obtains Application Default Credentials, then issues
// paginated GET requests only to the Cloud Monitoring and Cloud Logging read APIs.

import { pathToFileURL } from "node:url";

import {
  loadMonitoringBundle,
  normalizeMonitoringFilter,
  renderMonitoringBundle,
} from "../infra/monitoring/manifest.mjs";
import { MonitoringPlanRefusal, resolveMonitoringConfig } from "./setup-monitoring.mjs";

const MAX_PAGES_PER_COLLECTION = 100;
const COLLECTIONS = Object.freeze([
  {
    key: "policies",
    host: "monitoring.googleapis.com",
    path: "alertPolicies",
    responseKey: "alertPolicies",
  },
  {
    key: "channels",
    host: "monitoring.googleapis.com",
    path: "notificationChannels",
    responseKey: "notificationChannels",
  },
  {
    key: "metrics",
    host: "logging.googleapis.com",
    path: "metrics",
    responseKey: "metrics",
  },
]);
const ALLOWED_READ_HOSTS = new Set(COLLECTIONS.map((entry) => entry.host));
const POLICY_LABELS = Object.freeze({
  managed_by: "pmi_kc",
  suite: "s51",
});

export class MonitoringVerificationRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = "MonitoringVerificationRefusal";
  }
}

export async function fetchMonitoringState(config, dependencies = {}) {
  const emptyState = {
    credentialsAvailable: false,
    policies: [],
    channels: [],
    metrics: [],
    errors: [],
  };

  let request = dependencies.request;
  if (request === undefined) {
    try {
      request = await resolveAuthenticatedRequest(
        dependencies.authFactory,
        dependencies.signal,
      );
    } catch {
      return {
        ...emptyState,
        errors: ["credentials_unavailable"],
      };
    }
  }
  if (typeof request !== "function") {
    return {
      ...emptyState,
      errors: ["credentials_unavailable"],
    };
  }

  const state = {
    ...emptyState,
    credentialsAvailable: true,
  };
  for (const collection of COLLECTIONS) {
    try {
      state[collection.key] = await readCollectionPages(
        config.project,
        collection,
        request,
        dependencies.maxPages ?? MAX_PAGES_PER_COLLECTION,
        dependencies.signal,
      );
    } catch {
      state.errors.push(`${collection.key}_read_failed`);
    }
  }
  return state;
}

export function evaluateMonitoringState(config, state, bundle = loadMonitoringBundle()) {
  const rendered = renderMonitoringBundle(bundle, config);
  const counts = {
    policies: safeArray(state?.policies).length,
    channels: safeArray(state?.channels).length,
    metrics: safeArray(state?.metrics).length,
  };
  const target = {
    project: config.project,
    region: config.region,
    service: config.service,
  };

  if (!state?.credentialsAvailable) {
    return {
      status: "unverified",
      target,
      counts,
      checks: [],
      reason: "credentials_unavailable",
    };
  }
  if (!Array.isArray(state.errors) || state.errors.length > 0) {
    return {
      status: "unverified",
      target,
      counts,
      checks: [],
      reason: "read_incomplete",
    };
  }

  const checks = [];
  const managedChannels = safeArray(state.channels).filter((channel) =>
    hasLabels(channel?.userLabels, POLICY_LABELS),
  );
  const channelCheck = evaluateChannel(
    config,
    managedChannels,
    rendered.manifest.channel,
  );
  checks.push(channelCheck.result);

  const expectedMetric = rendered.logMetrics[0];
  const expectedMetricResourceName = `projects/${config.project}/metrics/${expectedMetric.metricId}`;
  const managedMetrics = safeArray(state.metrics).filter(
    (metric) =>
      metric?.name === expectedMetric.metricId ||
      metric?.resourceName === expectedMetricResourceName,
  );
  checks.push(evaluateMetric(config, managedMetrics, expectedMetric));

  const allManagedPolicies = safeArray(state.policies).filter((policy) =>
    hasLabels(policy?.userLabels, POLICY_LABELS),
  );
  const observedPolicyKeys = allManagedPolicies
    .map((policy) => policy?.userLabels?.policy_key)
    .sort();
  checks.push(
    JSON.stringify(observedPolicyKeys) === JSON.stringify(["a1", "a2", "a3", "a4"])
      ? check("policy-set", "ready", "exact")
      : check("policy-set", "drift", "unexpected_or_duplicate"),
  );

  for (const expectedPolicy of rendered.policies) {
    const managedPolicies = allManagedPolicies.filter(
      (policy) => policy?.userLabels?.policy_key === expectedPolicy.key,
    );
    checks.push(
      evaluatePolicy(config, managedPolicies, expectedPolicy, channelCheck.channelName),
    );
  }

  return {
    status: checks.every((check) => check.status === "ready") ? "ready" : "drift",
    target,
    counts,
    checks,
  };
}

export function renderMonitoringVerification(report) {
  const lines = [
    `S51 monitoring verification: ${report.status.toUpperCase()}`,
    `Target: ${report.target.project} / ${report.target.region} / ${report.target.service}`,
    `Observed: ${report.counts.channels} channels, ${report.counts.metrics} metrics, ${report.counts.policies} policies`,
  ];
  if (report.reason) lines.push(`Reason: ${report.reason}`);
  for (const check of report.checks) {
    lines.push(`${check.status.toUpperCase()} ${check.key}: ${check.reason}`);
  }
  return lines.join("\n");
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  dependencies = {},
) {
  const stdout = dependencies.stdout ?? ((value) => console.log(value));
  const stderr = dependencies.stderr ?? ((value) => console.error(value));
  const setExitCode =
    dependencies.setExitCode ??
    ((value) => {
      process.exitCode = value;
    });

  try {
    const plannerArgv = requireExplicitLive(argv);
    const config = resolveMonitoringConfig(plannerArgv, env, dependencies.manifest);
    const bundle = dependencies.bundle ?? loadMonitoringBundle();
    const stateFetcher = dependencies.fetchState ?? fetchMonitoringState;
    const state = await stateFetcher(config, {
      request: dependencies.request,
      authFactory: dependencies.authFactory,
      maxPages: dependencies.maxPages,
      signal: dependencies.signal,
    });
    const report = evaluateMonitoringState(config, state, bundle);
    const output = config.json
      ? JSON.stringify(report, null, 2)
      : renderMonitoringVerification(report);
    stdout(output);
    if (report.status !== "ready") setExitCode(1);
    return report;
  } catch (error) {
    const reason =
      error instanceof MonitoringVerificationRefusal ||
      error instanceof MonitoringPlanRefusal
        ? safeRefusalReason(error)
        : "verification could not complete safely";
    stderr(`Monitoring verification refused: ${reason}.`);
    setExitCode(1);
    return { status: "refused", reason };
  }
}

async function resolveAuthenticatedRequest(authFactory, signal) {
  let auth;
  if (authFactory) {
    auth = await authFactory();
  } else {
    const { GoogleAuth } = await import("google-auth-library");
    auth = new GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/monitoring.read",
        "https://www.googleapis.com/auth/logging.read",
      ],
    });
  }

  const client =
    auth && typeof auth.getClient === "function" ? await auth.getClient() : auth;
  if (!client || typeof client.request !== "function") {
    throw new Error("No authenticated read client.");
  }
  if (typeof client.getAccessToken === "function") {
    await client.getAccessToken();
  }
  return (options) => client.request({ ...options, ...(signal ? { signal } : {}) });
}

async function readCollectionPages(project, collection, request, maxPages, signal) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
    throw new Error("Invalid pagination bound.");
  }
  const records = [];
  const seenTokens = new Set();
  let pageToken;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(
      `https://${collection.host}/v3/projects/${encodeURIComponent(project)}/${collection.path}`,
    );
    if (collection.host === "logging.googleapis.com") {
      url.pathname = `/v2/projects/${encodeURIComponent(project)}/${collection.path}`;
    }
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    assertReadRequest("GET", url);

    const response = await request({
      method: "GET",
      url: url.toString(),
      ...(signal ? { signal } : {}),
    });
    const data = response?.data ?? response;
    if (!isPlainObject(data)) throw new Error("Malformed API response.");
    const pageRecords = data[collection.responseKey] ?? [];
    if (!Array.isArray(pageRecords)) throw new Error("Malformed API collection.");
    records.push(...pageRecords);

    const nextPageToken = data.nextPageToken;
    if (nextPageToken === undefined || nextPageToken === null || nextPageToken === "") {
      return records;
    }
    if (typeof nextPageToken !== "string" || seenTokens.has(nextPageToken)) {
      throw new Error("Invalid pagination token.");
    }
    seenTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }
  throw new Error("Pagination bound exceeded.");
}

function evaluateChannel(config, channels, descriptor) {
  const key = `channel:${descriptor.key}`;
  if (channels.length === 0) {
    return {
      channelName: undefined,
      result: check(key, "drift", "missing"),
    };
  }
  if (channels.length !== 1) {
    return {
      channelName: undefined,
      result: check(key, "drift", "duplicate"),
    };
  }
  const channel = channels[0];
  if (
    !hasOnlyObjectKeys(channel, [
      "creationRecord",
      "description",
      "displayName",
      "enabled",
      "labels",
      "mutationRecords",
      "name",
      "type",
      "userLabels",
      "verificationStatus",
    ]) ||
    typeof channel.name !== "string" ||
    !channel.name.startsWith(`projects/${config.project}/notificationChannels/`)
  ) {
    return {
      channelName: undefined,
      result: check(key, "drift", "wrong_target"),
    };
  }
  if (
    channel.displayName !== descriptor.displayName ||
    channel.type !== descriptor.type ||
    channel.enabled !== true ||
    channel.verificationStatus !== "VERIFIED" ||
    !hasExactLabels(channel.userLabels, descriptor.userLabels) ||
    !hasExactLabels(channel.labels, { email_address: config.operatorEmail }) ||
    (channel.description !== undefined && channel.description !== "")
  ) {
    return {
      channelName: channel.name,
      result: check(key, "drift", "definition_mismatch"),
    };
  }
  return {
    channelName: channel.name,
    result: check(key, "ready", "exact"),
  };
}

function evaluateMetric(config, metrics, expected) {
  const key = `metric:${expected.key}`;
  if (metrics.length === 0) return check(key, "drift", "missing");
  if (metrics.length !== 1) return check(key, "drift", "duplicate");
  const metric = metrics[0];
  const definition = expected.definition;
  if (
    metric.name !== expected.metricId ||
    metric.resourceName !== `projects/${config.project}/metrics/${expected.metricId}`
  ) {
    return check(key, "drift", "wrong_target");
  }
  if (
    !hasOnlyObjectKeys(metric, [
      "bucketName",
      "createTime",
      "description",
      "disabled",
      "filter",
      "labelExtractors",
      "metricDescriptor",
      "name",
      "resourceName",
      "updateTime",
      "valueExtractor",
      "version",
    ]) ||
    metric.disabled === true ||
    metric.description !== definition.description ||
    normalizeMonitoringFilter(metric.filter) !==
      normalizeMonitoringFilter(definition.filter) ||
    metric.metricDescriptor?.metricKind !== definition.metricDescriptor.metricKind ||
    metric.metricDescriptor?.valueType !== definition.metricDescriptor.valueType ||
    metric.metricDescriptor?.unit !== definition.metricDescriptor.unit ||
    (metric.bucketName !== undefined && metric.bucketName !== "") ||
    (metric.valueExtractor !== undefined && metric.valueExtractor !== "") ||
    !isEmptyOptionalObject(metric.labelExtractors) ||
    (metric.metricDescriptor?.labels !== undefined &&
      (!Array.isArray(metric.metricDescriptor.labels) ||
        metric.metricDescriptor.labels.length > 0))
  ) {
    return check(key, "drift", "definition_mismatch");
  }
  return check(key, "ready", "exact");
}

function evaluatePolicy(config, policies, expected, expectedChannelName) {
  const key = `policy:${expected.key}`;
  if (policies.length === 0) return check(key, "drift", "missing");
  if (policies.length !== 1) return check(key, "drift", "duplicate");
  const policy = policies[0];
  if (
    typeof policy.name !== "string" ||
    !policy.name.startsWith(`projects/${config.project}/alertPolicies/`)
  ) {
    return check(key, "drift", "wrong_target");
  }
  if (
    !expectedChannelName ||
    !Array.isArray(policy.notificationChannels) ||
    policy.notificationChannels.length !== 1 ||
    policy.notificationChannels[0] !== expectedChannelName
  ) {
    return check(key, "drift", "channel_mismatch");
  }
  if (!policyDefinitionMatches(policy, expected.definition)) {
    return check(key, "drift", "definition_mismatch");
  }
  return check(key, "ready", "exact");
}

function policyDefinitionMatches(actual, expected) {
  const allowedActualKeys = new Set([
    ...Object.keys(expected),
    "alertStrategy",
    "creationRecord",
    "mutationRecord",
    "name",
    "notificationChannels",
    "validity",
  ]);
  if (
    !isPlainObject(actual) ||
    Object.keys(actual).some((key) => !allowedActualKeys.has(key)) ||
    !policyValidityIsReady(actual.validity) ||
    actual.displayName !== expected.displayName ||
    actual.combiner !== expected.combiner ||
    actual.enabled !== expected.enabled ||
    !hasExactLabels(actual.userLabels, expected.userLabels) ||
    !deepEqual(actual.documentation, expected.documentation) ||
    !alertStrategyMatches(actual.alertStrategy, expected.alertStrategy) ||
    !Array.isArray(actual.conditions) ||
    actual.conditions.length !== expected.conditions.length
  ) {
    return false;
  }
  return expected.conditions.every((condition, index) =>
    conditionMatches(actual.conditions[index], condition),
  );
}

function alertStrategyMatches(actual, expected) {
  if (expected === undefined) {
    return (
      actual === undefined || (isPlainObject(actual) && Object.keys(actual).length === 0)
    );
  }
  return deepEqual(actual, expected);
}

function conditionMatches(actual, expected) {
  if (!isPlainObject(actual) || actual.displayName !== expected.displayName) {
    return false;
  }
  if (expected.conditionThreshold) {
    if (
      !hasOnlyObjectKeys(actual, ["conditionThreshold", "displayName", "name"]) ||
      !isPlainObject(actual.conditionThreshold)
    ) {
      return false;
    }
    const left = actual.conditionThreshold;
    const right = expected.conditionThreshold;
    return (
      hasExactObjectKeys(left, Object.keys(right)) &&
      normalizeMonitoringFilter(left.filter) ===
        normalizeMonitoringFilter(right.filter) &&
      left.comparison === right.comparison &&
      left.thresholdValue === right.thresholdValue &&
      left.duration === right.duration &&
      deepEqual(left.aggregations, right.aggregations) &&
      deepEqual(left.trigger, right.trigger) &&
      !hasOtherConditionKind(actual, "conditionThreshold")
    );
  }
  if (expected.conditionMatchedLog) {
    return (
      hasOnlyObjectKeys(actual, ["conditionMatchedLog", "displayName", "name"]) &&
      isPlainObject(actual.conditionMatchedLog) &&
      hasExactObjectKeys(
        actual.conditionMatchedLog,
        Object.keys(expected.conditionMatchedLog),
      ) &&
      normalizeMonitoringFilter(actual.conditionMatchedLog.filter) ===
        normalizeMonitoringFilter(expected.conditionMatchedLog.filter) &&
      !hasOtherConditionKind(actual, "conditionMatchedLog")
    );
  }
  return false;
}

function hasOtherConditionKind(condition, expectedKey) {
  return Object.keys(condition).some(
    (key) => key.startsWith("condition") && key !== expectedKey,
  );
}

function hasExactLabels(actual, expected) {
  if (!isPlainObject(actual) || !isPlainObject(expected)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    deepEqual(actualKeys, expectedKeys) &&
    expectedKeys.every((key) => actual[key] === expected[key])
  );
}

function hasLabels(actual, expected) {
  if (!isPlainObject(actual) || !isPlainObject(expected)) return false;
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function hasExactObjectKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  return (
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort())
  );
}

function hasOnlyObjectKeys(value, allowedKeys) {
  if (!isPlainObject(value)) return false;
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isEmptyOptionalObject(value) {
  return value === undefined || (isPlainObject(value) && Object.keys(value).length === 0);
}

function policyValidityIsReady(validity) {
  if (validity === undefined || validity === null) return true;
  if (
    !isPlainObject(validity) ||
    !hasOnlyObjectKeys(validity, ["code", "details", "message"])
  ) {
    return false;
  }
  return (
    (validity.code === undefined || validity.code === 0) &&
    (validity.message === undefined || validity.message === "") &&
    (validity.details === undefined ||
      (Array.isArray(validity.details) && validity.details.length === 0))
  );
}

function deepEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function assertReadRequest(method, url) {
  if (
    method !== "GET" ||
    url.protocol !== "https:" ||
    !ALLOWED_READ_HOSTS.has(url.hostname)
  ) {
    throw new Error("Monitoring verification attempted a non-read request.");
  }
}

function requireExplicitLive(argv) {
  let liveCount = 0;
  const plannerArgv = [];
  for (const arg of argv) {
    if (arg === "--live") {
      liveCount += 1;
    } else {
      plannerArgv.push(arg);
    }
  }
  if (liveCount !== 1) {
    throw new MonitoringVerificationRefusal(
      "exactly one explicit --live flag is required",
    );
  }
  return plannerArgv;
}

function check(key, status, reason) {
  return { key, status, reason };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeRefusalReason(error) {
  const message =
    error instanceof Error && error.message
      ? error.message.replace(/[\r\n]+/g, " ")
      : "invalid verification request";
  return message.slice(0, 200);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Monitoring verification failed unexpectedly.");
    process.exitCode = 1;
  });
}
