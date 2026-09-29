import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { writeReceipt } from "../../scripts/production-assurance-receipts.mjs";
import {
  pausedPredecessorTemplate,
  RECOVERY_BASELINE_SCHEMA,
  recoveryReference,
  recoveryHash,
} from "../../scripts/release-recovery.mjs";
import { fingerprintRevisionRuntimeConfiguration as fingerprint } from "../../lib/production-assurance/revision-fingerprint.mjs";

export function recoveryFixture(root, options = {}) {
  const runId = randomUUID();
  const sha = "a".repeat(40),
    originalSha = "c".repeat(40);
  const project = "pmi-kc-kb-prod",
    region = "us-central1",
    service = "pmi-kc-app";
  const original = "pmi-kc-app-predecessor-isolated",
    candidate = "pmi-kc-app-candidate-isolated";
  const target = `${service}-recovery-${runId.replaceAll("-", "").slice(0, 16)}`;
  const parent = `projects/${project}/locations/${region}/services/${service}`;
  const canonicalOrigin = "https://pmi-kc-app-isolated.a.run.app",
    tag = "cand-original",
    tagOrigin = "https://cand-original---pmi-kc-app-isolated.a.run.app";
  const source = {
    name: `${parent}/revisions/${original}`,
    service: parent,
    launchStage: "GA",
    containers: [
      {
        name: "app",
        image: `registry.invalid/original@sha256:${"d".repeat(64)}`,
        command: ["node"],
        args: ["server.js"],
        env: [
          { name: "APP_COMMIT_SHA", value: originalSha },
          { name: "OTHER", value: "original" },
          {
            name: "PRIVATE_BINDING",
            valueSource: { secretKeyRef: { secret: "binding", version: "1" } },
          },
          { name: "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", value: "true" },
        ],
        resources: { limits: { cpu: "1", memory: "512Mi" } },
        ports: [{ containerPort: 8080 }],
        startupProbe: { tcpSocket: { port: 8080 } },
      },
    ],
    serviceAccount: "runtime@pmi-kc-kb-prod.iam.gserviceaccount.com",
    volumes: [],
    scaling: { maxInstanceCount: 2 },
    timeout: "300s",
    executionEnvironment: "EXECUTION_ENVIRONMENT_GEN2",
    vpcAccess: { egress: "PRIVATE_RANGES_ONLY" },
    maxInstanceRequestConcurrency: 80,
    labels: { application: "original" },
    annotations: {},
    conditions: [{ type: "Ready", state: "CONDITION_SUCCEEDED" }],
    reconciling: false,
  };
  const paused = pausedPredecessorTemplate(
    source,
    target,
    source.containers.map((c) => c.image),
  );
  const recovered = { ...paused.expected, name: `${parent}/revisions/${target}` };
  const originalBaseline = {
    legacyException: null,
    browserPolicy: "owner-admin-2026-09-10",
    verifiedAt: new Date().toISOString(),
    canonicalOrigin,
    expectedCommit: originalSha,
    expectedRevision: original,
    expectedConfigurationFingerprint: fingerprint(source),
    trafficPercent: 100,
    adminVerdict: "passed",
    editorVerdict: "not_run",
    monitoringState: "ready",
  };
  const control = { ingress: "INGRESS_TRAFFIC_ALL", invokerIamDisabled: false };
  const state = {
    service: {
      name: parent,
      uri: canonicalOrigin,
      ...control,
      etag: "one",
      template: {
        containers: [
          {
            image: "registry.invalid/candidate",
            env: [{ name: "OTHER", value: "candidate" }],
          },
        ],
      },
      trafficStatuses: [
        { revision: options.serving ?? original, percent: 100 },
        { revision: original, percent: 0, tag, uri: tagOrigin },
      ],
    },
    revisions: new Map([[original, source]]),
    patches: [],
    reads: [],
    fail: null,
    monitoring: true,
  };
  const receipt = {
    schemaVersion: RECOVERY_BASELINE_SCHEMA,
    receiptId: randomUUID(),
    runId,
    sha,
    project,
    region,
    service,
    issuedAt: new Date().toISOString(),
    originalBaseline,
    originalFingerprint: fingerprint(source),
    targetRevision: target,
    targetFingerprint: fingerprint(recovered),
    imageDigests: source.containers.map((c) => c.image),
    allowedDifference: "sheet_writeback_false_and_revision_identity",
    tag,
    tagOrigin,
    tagPreviousRevision: original,
    serviceControlsHash: recoveryHash(control),
    assurance: {
      phase: "recovery_preparation",
      verifiedAt: new Date().toISOString(),
      adminVerdict: "passed",
      editorVerdict: "not_run",
      monitoringState: "ready",
      trafficPercent: 0,
    },
  };
  receipt.issuedAt = receipt.assurance.verifiedAt;
  const path = join(root, `recovery-${runId}-baseline.json`);
  if (options.prepared) {
    state.revisions.set(target, recovered);
    state.service.trafficStatuses[1].revision = target;
    writeReceipt(path, receipt);
  }
  const client = {
    request: async (request) => {
      if (request.method === "GET") {
        state.reads.push(request.url);
        if (request.url.startsWith("https://identitytoolkit.googleapis.com/"))
          return {
            data: {
              authorizedDomains: [
                new URL(canonicalOrigin).hostname,
                new URL(tagOrigin).hostname,
              ],
            },
          };
        if (request.url.endsWith(parent)) return { data: structuredClone(state.service) };
        if (request.url.includes("/operations/"))
          return { data: { name: request.url.split("/v2/")[1], done: true } };
        const revision = state.revisions.get(request.url.split("/").at(-1));
        if (!revision)
          throw Object.assign(new Error("not found"), { response: { status: 404 } });
        return { data: structuredClone(revision) };
      }
      state.patches.push(structuredClone(request));
      if (request.retry !== false) throw new Error("mutations_must_disable_retry");
      if (state.fail === "before") throw new Error("lost_before_dispatch");
      if (request.data.etag !== state.service.etag) throw new Error("etag_conflict");
      if (request.data.template) {
        const { revision, ...template } = request.data.template;
        state.revisions.set(revision, {
          ...source,
          ...template,
          name: `${parent}/revisions/${revision}`,
        });
        state.service.template = structuredClone(template);
      }
      state.service.trafficStatuses = request.data.traffic.map((row) => ({
        revision: row.revision,
        percent: row.percent,
        ...(row.tag
          ? {
              tag: row.tag,
              uri:
                row.tag === tag
                  ? tagOrigin
                  : `https://${row.tag}---pmi-kc-app-isolated.a.run.app`,
            }
          : {}),
      }));
      state.service.etag += "x";
      if (state.fail === "after") throw new Error("lost_after_dispatch");
      return {
        data: {
          name: `projects/${project}/locations/${region}/operations/op-${state.patches.length}`,
          done: true,
        },
      };
    },
  };
  const assureTarget = async (input) => {
    if (
      !state.monitoring ||
      input.expectedConfigurationFingerprint !==
        fingerprint(state.revisions.get(input.expectedRevision))
    )
      throw new Error("assurance_failed");
    return { ...receipt.assurance, verifiedAt: new Date().toISOString() };
  };
  const verifyRecovered = async (bound) => {
    if (
      !state.monitoring ||
      bound.targetFingerprint !==
        fingerprint(state.revisions.get(bound.targetRevision)) ||
      !state.service.trafficStatuses.some(
        (row) => row.revision === bound.targetRevision && row.percent === 100,
      )
    )
      throw new Error("recovery_assurance_failed");
  };
  return {
    root,
    input: {
      runId,
      sha,
      project,
      region,
      service,
      predecessorRevision: original,
      tag,
      tagOrigin,
      tagPreviousRevision: original,
    },
    receipt,
    reference: recoveryReference(path, receipt),
    path,
    state,
    client,
    source,
    recovered,
    candidate,
    original,
    target,
    fingerprint,
    assureTarget,
    verifyRecovered,
    deps: {
      client,
      stateRoot: root,
      authorize: () => true,
      assertLock: () => {},
      captureOriginalBaseline: async () => originalBaseline,
      assureTarget,
      wait: async () => {},
    },
  };
}
