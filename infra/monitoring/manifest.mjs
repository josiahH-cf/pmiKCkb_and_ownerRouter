import { readFileSync } from "node:fs";

export const MONITORING_TEMPLATE_TOKENS = Object.freeze([
  "__PROJECT_ID__",
  "__REGION__",
  "__SERVICE_NAME__",
]);

export const MONITORING_MARKERS = Object.freeze({
  unresolvedLiveEffect: "LIVE_EFFECT_REQUIRES_ATTENTION",
  costThresholdCrossed: "COST_ALERT_THRESHOLD_CROSSED",
  killSwitchFired: "KILL_SWITCH_FIRED",
  killSwitchDisableFailed: "KILL_SWITCH_DISABLE_FAILED",
  killSwitchAlreadyDisabled: "KILL_SWITCH_ALREADY_DISABLED",
});

export const MONITORING_MANIFEST = deepFreeze({
  schemaVersion: "pmi-kc-monitoring.v1",
  defaults: {
    project: "pmi-kc-kb-prod",
    region: "us-central1",
    service: "pmi-kc-kb-demo",
    budgetGuardrailService: "budget-guardrail",
  },
  channel: {
    key: "operator_email",
    displayName: "PMI KC Production Operations",
    type: "email",
    userLabels: {
      managed_by: "pmi_kc",
      suite: "s51",
      channel_key: "operator_email",
    },
  },
  logMetrics: [
    {
      key: "a2",
      metricId: "pmi_kc_unresolved_live_effect_count",
      path: "log-metrics/a2-unresolved-live-effect.json",
    },
  ],
  policies: [
    {
      key: "a1",
      kind: "metric_threshold",
      path: "policies/a1-cloud-run-5xx.json",
    },
    {
      key: "a2",
      kind: "metric_threshold",
      path: "policies/a2-unresolved-live-effect.json",
    },
    {
      key: "a3",
      kind: "log_match",
      path: "policies/a3-cost-threshold.json",
    },
    {
      key: "a4",
      kind: "log_match",
      path: "policies/a4-kill-switch-outcome.json",
    },
  ],
});

const ALLOWED_TEMPLATE_TOKENS = new Set(MONITORING_TEMPLATE_TOKENS);
const TEMPLATE_TOKEN_PATTERN = /__[A-Z][A-Z0-9_]*__/g;
const EMAIL_LITERAL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z]+-[a-z]+[0-9]$/;
const SERVICE_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EXPECTED_A2_METRIC_FILTER =
  'resource.type="cloud_run_revision" AND resource.labels.project_id="__PROJECT_ID__" AND resource.labels.location="__REGION__" AND resource.labels.service_name="__SERVICE_NAME__" AND jsonPayload.marker="LIVE_EFFECT_REQUIRES_ATTENTION" AND jsonPayload.data_mode="live" AND (jsonPayload.state="failed" OR jsonPayload.state="ambiguous")';
const EXPECTED_POLICY_FILTERS = Object.freeze({
  a1: 'resource.type = "cloud_run_revision" AND metric.type = "run.googleapis.com/request_count" AND resource.label."project_id" = "__PROJECT_ID__" AND resource.label."location" = "__REGION__" AND resource.label."service_name" = "__SERVICE_NAME__" AND metric.label."response_code_class" = "5xx"',
  a2: 'resource.type = "cloud_run_revision" AND metric.type = "logging.googleapis.com/user/pmi_kc_unresolved_live_effect_count" AND resource.label."project_id" = "__PROJECT_ID__" AND resource.label."location" = "__REGION__" AND resource.label."service_name" = "__SERVICE_NAME__"',
  a3: 'resource.type="cloud_run_revision" AND resource.labels.project_id="__PROJECT_ID__" AND resource.labels.location="__REGION__" AND resource.labels.service_name="budget-guardrail" AND jsonPayload.marker="COST_ALERT_THRESHOLD_CROSSED"',
  a4: 'resource.type="cloud_run_revision" AND resource.labels.project_id="__PROJECT_ID__" AND resource.labels.location="__REGION__" AND resource.labels.service_name="budget-guardrail" AND (jsonPayload.marker="KILL_SWITCH_FIRED" OR jsonPayload.marker="KILL_SWITCH_DISABLE_FAILED")',
});

export function loadMonitoringBundle({
  manifest = MONITORING_MANIFEST,
  readText = (url) => readFileSync(url, "utf8"),
} = {}) {
  validateMonitoringManifest(manifest);
  const load = (entry) => {
    const url = new URL(entry.path, import.meta.url);
    let definition;
    try {
      definition = JSON.parse(readText(url));
    } catch {
      throw new Error(`Monitoring definition ${entry.path} is missing or invalid JSON.`);
    }
    return { ...entry, definition };
  };
  const bundle = {
    manifest,
    logMetrics: manifest.logMetrics.map(load),
    policies: manifest.policies.map(load),
  };
  validateMonitoringBundle(bundle);
  return bundle;
}

export function renderMonitoringBundle(bundle, target) {
  validateMonitoringBundle(bundle);
  validateRenderTarget(target);
  const replacements = new Map([
    ["__PROJECT_ID__", target.project],
    ["__REGION__", target.region],
    ["__SERVICE_NAME__", target.service],
  ]);
  const render = (entry) => ({
    ...entry,
    definition: replaceTokens(entry.definition, replacements),
  });
  const rendered = {
    manifest: bundle.manifest,
    logMetrics: bundle.logMetrics.map(render),
    policies: bundle.policies.map(render),
  };
  const unresolved = JSON.stringify(rendered).match(TEMPLATE_TOKEN_PATTERN);
  if (unresolved) {
    throw new Error(
      `Monitoring definition has unresolved template token ${unresolved[0]}.`,
    );
  }
  return rendered;
}

export function validateMonitoringManifest(manifest = MONITORING_MANIFEST) {
  if (!isPlainObject(manifest) || manifest.schemaVersion !== "pmi-kc-monitoring.v1") {
    throw new Error("Monitoring manifest schema version is invalid.");
  }
  if (
    !isPlainObject(manifest.defaults) ||
    !hasExactStringEntries(manifest.defaults, {
      budgetGuardrailService: "budget-guardrail",
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: "pmi-kc-kb-demo",
    }) ||
    !isPlainObject(manifest.channel) ||
    !Array.isArray(manifest.logMetrics) ||
    !Array.isArray(manifest.policies)
  ) {
    throw new Error("Monitoring manifest shape is invalid.");
  }
  if (manifest.logMetrics.length !== 1 || manifest.policies.length !== 4) {
    throw new Error("Monitoring manifest must declare one log metric and four policies.");
  }
  if (
    !hasExactObjectKeys(manifest.channel, ["displayName", "key", "type", "userLabels"]) ||
    manifest.channel.key !== "operator_email" ||
    manifest.channel.displayName !== "PMI KC Production Operations" ||
    manifest.channel.type !== "email" ||
    !hasExactStringEntries(manifest.channel.userLabels, {
      channel_key: "operator_email",
      managed_by: "pmi_kc",
      suite: "s51",
    })
  ) {
    throw new Error("Monitoring manifest channel descriptor is invalid.");
  }
  if (EMAIL_LITERAL_PATTERN.test(JSON.stringify(manifest))) {
    throw new Error("Monitoring manifest must not commit an operator email literal.");
  }

  const allEntries = [...manifest.logMetrics, ...manifest.policies];
  const keys = new Set();
  const paths = new Set();
  for (const entry of allEntries) {
    if (
      !isPlainObject(entry) ||
      typeof entry.key !== "string" ||
      typeof entry.path !== "string" ||
      !/^(?:log-metrics|policies)\/[a-z0-9-]+\.json$/.test(entry.path)
    ) {
      throw new Error("Monitoring manifest contains an invalid entry.");
    }
    if (keys.has(`${entry.path.split("/")[0]}:${entry.key}`) || paths.has(entry.path)) {
      throw new Error("Monitoring manifest contains a duplicate key or path.");
    }
    keys.add(`${entry.path.split("/")[0]}:${entry.key}`);
    paths.add(entry.path);
  }

  const policyKeys = manifest.policies.map((entry) => entry.key).sort();
  if (JSON.stringify(policyKeys) !== JSON.stringify(["a1", "a2", "a3", "a4"])) {
    throw new Error("Monitoring manifest policy keys must be exactly a1 through a4.");
  }
  const metric = manifest.logMetrics[0];
  if (metric.key !== "a2" || metric.metricId !== "pmi_kc_unresolved_live_effect_count") {
    throw new Error("Monitoring manifest A2 metric identity is invalid.");
  }
  return manifest;
}

export function validateMonitoringBundle(bundle) {
  if (
    !isPlainObject(bundle) ||
    !Array.isArray(bundle.logMetrics) ||
    !Array.isArray(bundle.policies)
  ) {
    throw new Error("Monitoring bundle shape is invalid.");
  }
  validateMonitoringManifest(bundle.manifest);
  if (bundle.logMetrics.length !== 1 || bundle.policies.length !== 4) {
    throw new Error("Monitoring bundle must contain one log metric and four policies.");
  }

  const metric = bundle.logMetrics[0];
  if (!isPlainObject(metric.definition)) {
    throw new Error("Monitoring A2 metric definition is invalid.");
  }
  const descriptor = metric.definition.metricDescriptor;
  if (
    metric.key !== "a2" ||
    metric.metricId !== bundle.manifest.logMetrics[0].metricId ||
    !hasExactObjectKeys(metric.definition, [
      "description",
      "disabled",
      "filter",
      "metricDescriptor",
    ]) ||
    typeof metric.definition.description !== "string" ||
    metric.definition.description.trim() === "" ||
    metric.definition.disabled !== false ||
    !isPlainObject(descriptor) ||
    !hasOnlyObjectKeys(descriptor, ["labels", "metricKind", "unit", "valueType"]) ||
    descriptor.metricKind !== "DELTA" ||
    descriptor.valueType !== "INT64" ||
    descriptor.unit !== "1" ||
    (descriptor.labels !== undefined &&
      (!Array.isArray(descriptor.labels) || descriptor.labels.length > 0)) ||
    normalizeMonitoringFilter(metric.definition.filter) !==
      normalizeMonitoringFilter(EXPECTED_A2_METRIC_FILTER)
  ) {
    throw new Error(
      "Monitoring A2 metric must be the exact enabled, label-free DELTA INT64 live-failure counter.",
    );
  }
  assertDefinitionSafety(metric.definition, metric.path);

  const policyKeys = [];
  const expectedSeverities = {
    a1: "sev2",
    a2: "sev1",
    a3: "sev2",
    a4: "sev1",
  };
  for (const policy of bundle.policies) {
    policyKeys.push(policy.key);
    const definition = policy.definition;
    const expectedDefinitionKeys =
      policy.kind === "metric_threshold"
        ? [
            "combiner",
            "conditions",
            "displayName",
            "documentation",
            "enabled",
            "userLabels",
          ]
        : [
            "alertStrategy",
            "combiner",
            "conditions",
            "displayName",
            "documentation",
            "enabled",
            "userLabels",
          ];
    if (
      !isPlainObject(definition) ||
      !hasExactObjectKeys(definition, expectedDefinitionKeys) ||
      definition.enabled !== true ||
      definition.combiner !== "OR" ||
      !Array.isArray(definition.conditions) ||
      definition.conditions.length !== 1 ||
      !hasExactStringEntries(definition.userLabels, {
        managed_by: "pmi_kc",
        policy_key: policy.key,
        severity: expectedSeverities[policy.key],
        suite: "s51",
      }) ||
      !hasExactObjectKeys(definition.documentation, ["content", "mimeType"]) ||
      typeof definition.documentation.content !== "string" ||
      definition.documentation.content.trim() === "" ||
      definition.documentation.mimeType !== "text/markdown" ||
      Object.prototype.hasOwnProperty.call(definition, "name") ||
      Object.prototype.hasOwnProperty.call(definition, "notificationChannels")
    ) {
      throw new Error(`Monitoring policy ${policy.key} definition is invalid.`);
    }
    const condition = definition.conditions[0];
    const expectedConditionField =
      policy.kind === "metric_threshold" ? "conditionThreshold" : "conditionMatchedLog";
    if (
      !isPlainObject(condition) ||
      !hasExactObjectKeys(condition, ["displayName", expectedConditionField]) ||
      !isPlainObject(condition[expectedConditionField]) ||
      Object.keys(condition).some(
        (key) =>
          key.startsWith("condition") &&
          key !== expectedConditionField &&
          key !== "displayName",
      )
    ) {
      throw new Error(`Monitoring policy ${policy.key} condition kind is invalid.`);
    }
    assertDefinitionSafety(definition, policy.path);
  }
  if (JSON.stringify(policyKeys.sort()) !== JSON.stringify(["a1", "a2", "a3", "a4"])) {
    throw new Error("Monitoring bundle policy keys must be exactly a1 through a4.");
  }
  validateExactPolicySignals(bundle.policies);

  const serialized = JSON.stringify(bundle);
  assertIncludes(serialized, MONITORING_MARKERS.unresolvedLiveEffect, "A2 marker");
  assertIncludes(serialized, MONITORING_MARKERS.costThresholdCrossed, "A3 marker");
  assertIncludes(serialized, MONITORING_MARKERS.killSwitchFired, "A4 fired marker");
  assertIncludes(
    serialized,
    MONITORING_MARKERS.killSwitchDisableFailed,
    "A4 failure marker",
  );
  if (serialized.includes(MONITORING_MARKERS.killSwitchAlreadyDisabled)) {
    throw new Error(
      "Monitoring definitions must not page on already-disabled no-op events.",
    );
  }
  return bundle;
}

export function normalizeMonitoringFilter(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function assertDefinitionSafety(definition, path) {
  const serialized = JSON.stringify(definition);
  if (EMAIL_LITERAL_PATTERN.test(serialized)) {
    throw new Error(`Monitoring definition ${path} commits an email literal.`);
  }
  const tokens = serialized.match(TEMPLATE_TOKEN_PATTERN) ?? [];
  for (const token of tokens) {
    if (!ALLOWED_TEMPLATE_TOKENS.has(token)) {
      throw new Error(`Monitoring definition ${path} contains unknown token ${token}.`);
    }
  }
  if (/secret|credential|access[_-]?token|refresh[_-]?token/i.test(serialized)) {
    throw new Error(
      `Monitoring definition ${path} contains a forbidden sensitive field.`,
    );
  }
}

function validateRenderTarget(target) {
  if (
    !isPlainObject(target) ||
    typeof target.project !== "string" ||
    !PROJECT_PATTERN.test(target.project) ||
    typeof target.region !== "string" ||
    !REGION_PATTERN.test(target.region) ||
    typeof target.service !== "string" ||
    !SERVICE_PATTERN.test(target.service)
  ) {
    throw new Error("Monitoring render target is invalid.");
  }
}

function validateExactPolicySignals(policies) {
  const byKey = new Map(policies.map((policy) => [policy.key, policy.definition]));
  validateMetricThreshold(byKey.get("a1"), EXPECTED_POLICY_FILTERS.a1, "300s", "A1");
  validateMetricThreshold(byKey.get("a2"), EXPECTED_POLICY_FILTERS.a2, "60s", "A2");
  validateLogMatch(byKey.get("a3"), EXPECTED_POLICY_FILTERS.a3, "900s", "A3");
  validateLogMatch(byKey.get("a4"), EXPECTED_POLICY_FILTERS.a4, "300s", "A4");
}

function validateMetricThreshold(definition, expectedFilter, alignmentPeriod, label) {
  const threshold = definition?.conditions?.[0]?.conditionThreshold;
  const expectedAggregation = [
    {
      alignmentPeriod,
      perSeriesAligner: "ALIGN_SUM",
      crossSeriesReducer: "REDUCE_SUM",
      groupByFields: [
        'resource.label."project_id"',
        'resource.label."location"',
        'resource.label."service_name"',
      ],
    },
  ];
  if (
    !isPlainObject(threshold) ||
    !hasExactObjectKeys(threshold, [
      "aggregations",
      "comparison",
      "duration",
      "filter",
      "thresholdValue",
      "trigger",
    ]) ||
    normalizeMonitoringFilter(threshold.filter) !==
      normalizeMonitoringFilter(expectedFilter) ||
    threshold.comparison !== "COMPARISON_GT" ||
    threshold.thresholdValue !== 0 ||
    threshold.duration !== "0s" ||
    JSON.stringify(threshold.aggregations) !== JSON.stringify(expectedAggregation) ||
    JSON.stringify(threshold.trigger) !== JSON.stringify({ count: 1 })
  ) {
    throw new Error(`Monitoring ${label} threshold signal is not exact.`);
  }
}

function validateLogMatch(definition, expectedFilter, rateLimitPeriod, label) {
  const matchedLog = definition?.conditions?.[0]?.conditionMatchedLog;
  if (
    !isPlainObject(matchedLog) ||
    !hasExactObjectKeys(matchedLog, ["filter"]) ||
    normalizeMonitoringFilter(matchedLog.filter) !==
      normalizeMonitoringFilter(expectedFilter) ||
    JSON.stringify(definition.alertStrategy) !==
      JSON.stringify({
        notificationRateLimit: { period: rateLimitPeriod },
        autoClose: "1800s",
      })
  ) {
    throw new Error(`Monitoring ${label} log-match signal is not exact.`);
  }
}

function replaceTokens(value, replacements) {
  if (typeof value === "string") {
    let rendered = value;
    for (const [token, replacement] of replacements) {
      rendered = rendered.replaceAll(token, replacement);
    }
    return rendered;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceTokens(entry, replacements));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        replaceTokens(child, replacements),
      ]),
    );
  }
  return value;
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`Monitoring bundle is missing ${label}.`);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function hasExactStringEntries(value, expected) {
  return (
    hasExactObjectKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue)
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
