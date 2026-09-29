// Shared G6/G7 authority. Raw revision configuration stays in memory; durable state contains
// identities, hashes and outcomes only. Every provider mutation has one immutable dispatch claim.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultReleaseStateRoot,
  assertReleaseAdmission,
  assertReleaseCheckpoint,
} from "./release-control.mjs";
import { assertReleaseProcessLock } from "./release-lock.mjs";
import {
  writeReceipt,
  exactExternalReceiptPath,
  assertRecordedPredecessorBaseline,
} from "./production-assurance-receipts.mjs";
import { fingerprintRevisionRuntimeConfiguration } from "../lib/production-assurance/revision-fingerprint.mjs";

export const RECOVERY_BASELINE_SCHEMA = "pmi-kc-recovery-baseline.v1";
const FLAG = "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const FP = /^sha256:[a-f0-9]{64}$/;
const NAME = /^[a-z][a-z0-9-]{0,62}$/;
const DIGEST = /^[a-z0-9][a-z0-9.:/_-]*@sha256:[a-f0-9]{64}$/;
const TEMPLATE_KEYS = new Set([
  "labels",
  "annotations",
  "scaling",
  "vpcAccess",
  "maxInstanceRequestConcurrency",
  "timeout",
  "serviceAccount",
  "containers",
  "volumes",
  "executionEnvironment",
  "encryptionKey",
  "serviceMesh",
  "encryptionKeyRevocationAction",
  "encryptionKeyShutdownDuration",
  "sessionAffinity",
  "nodeSelector",
  "gpuZonalRedundancyDisabled",
]);
const OUTPUT_KEYS = new Set([
  "name",
  "uid",
  "generation",
  "createTime",
  "updateTime",
  "deleteTime",
  "expireTime",
  "launchStage",
  "service",
  "reconciling",
  "conditions",
  "observedGeneration",
  "logUri",
  "satisfiesPzs",
  "scalingStatus",
  "creator",
  "client",
  "clientVersion",
  "etag",
]);
const API = "https://run.googleapis.com/v2/";
const clone = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const recoveryHash = (value) =>
  `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
const equal = (left, right) => recoveryHash(left) === recoveryHash(right);
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const nameOf = (value) => value?.name?.split("/").at(-1);
const serviceName = (input) =>
  `projects/${input.project}/locations/${input.region}/services/${input.service}`;
const revisionName = (input, revision) => `${serviceName(input)}/revisions/${revision}`;
const statePath = (root, runId, suffix) => join(root, `recovery-${runId}-${suffix}.json`);

function coordinates(input) {
  if (
    !UUID.test(input.runId) ||
    !SHA.test(input.sha) ||
    !NAME.test(input.project) ||
    !/^[a-z]+-[a-z]+\d$/.test(input.region) ||
    !NAME.test(input.service)
  )
    throw new Error("recovery_coordinates_invalid");
}
function onlyKeys(value, keys) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  )
    throw new Error("recovery_receipt_invalid");
}
export function revisionSheetPaused(revision) {
  if (!Array.isArray(revision?.containers) || !revision.containers.length) return false;
  return revision.containers.every((container) => {
    const flags = (container.env ?? []).filter((env) => env.name === FLAG);
    return flags.length === 1 && flags[0].value === "false" && !flags[0].valueSource;
  });
}
function assertReady(revision, input, expectedRevision) {
  if (
    revision?.name !== revisionName(input, expectedRevision) ||
    revision.reconciling === true ||
    !revision.conditions?.some(
      (condition) =>
        condition.type === "Ready" && condition.state === "CONDITION_SUCCEEDED",
    )
  )
    throw new Error("recovery_revision_not_ready");
}
export function exactTraffic(service) {
  if (!Array.isArray(service?.trafficStatuses) || !service.trafficStatuses.length)
    throw new Error("recovery_traffic_unavailable");
  return service.trafficStatuses
    .filter((row) => Number(row.percent ?? 0) > 0)
    .map((row) => ({ revision: row.revision, percent: Number(row.percent) }))
    .sort((a, b) => a.revision.localeCompare(b.revision));
}
function assertServing(service, revision) {
  if (
    service.reconciling === true ||
    !equal(exactTraffic(service), [{ revision, percent: 100 }])
  )
    throw new Error("recovery_serving_traffic_changed");
}
function serviceControlHash(service) {
  // Template and traffic are the only authorized fields this mechanism changes. All other
  // writable service settings (including future fields) must survive byte-for-byte.
  const ignored = new Set([
    "template",
    "traffic",
    "trafficStatuses",
    "name",
    "uid",
    "generation",
    "observedGeneration",
    "createTime",
    "updateTime",
    "deleteTime",
    "expireTime",
    "creator",
    "lastModifier",
    "client",
    "clientVersion",
    "etag",
    "reconciling",
    "conditions",
    "terminalCondition",
    "latestReadyRevision",
    "latestCreatedRevision",
    "urls",
    "uri",
    "satisfiesPzs",
  ]);
  return recoveryHash(
    Object.fromEntries(Object.entries(service).filter(([key]) => !ignored.has(key))),
  );
}
function explicitTraffic(service) {
  return service.trafficStatuses.map((row) => {
    if (!NAME.test(row.revision) || !Number.isFinite(Number(row.percent ?? 0)))
      throw new Error("recovery_traffic_unavailable");
    return {
      type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
      revision: row.revision,
      percent: Number(row.percent ?? 0),
      ...(row.tag ? { tag: row.tag } : {}),
    };
  });
}

/** Preserve the immutable predecessor, never the current service template. Resolve image tags
 * before calling this function. Unknown configuration fields fail closed instead of being dropped. */
export function pausedPredecessorTemplate(source, expectedRevision, imageDigests) {
  if (
    !NAME.test(expectedRevision) ||
    !Array.isArray(source?.containers) ||
    source.containers.length === 0 ||
    source.containers.length !== imageDigests.length ||
    imageDigests.some((image) => typeof image !== "string" || !DIGEST.test(image))
  )
    throw new Error("recovery_digest_required");
  for (const key of Object.keys(source))
    if (!TEMPLATE_KEYS.has(key) && !OUTPUT_KEYS.has(key))
      throw new Error("recovery_unmapped_configuration_field");
  const expected = clone(source);
  expected.containers = expected.containers.map((container, index) => {
    const env = container.env ?? [];
    if (env.filter((row) => row.name === FLAG).length > 1)
      throw new Error("recovery_sheet_flag_ambiguous");
    return {
      ...container,
      image: imageDigests[index],
      env: [...env.filter((row) => row.name !== FLAG), { name: FLAG, value: "false" }],
    };
  });
  const template = Object.fromEntries(
    Object.entries(expected).filter(([key]) => TEMPLATE_KEYS.has(key)),
  );
  // Cloud Run reconstructs reserved provider metadata; the full expected fingerprint below still
  // requires the readback to preserve it. No discarded metadata becomes an allowed config diff.
  for (const key of ["labels", "annotations"])
    if (template[key])
      template[key] = Object.fromEntries(
        Object.entries(template[key]).filter(
          ([name]) =>
            !/^(run|serving\.knative|cloud)\.googleapis\.com\//.test(name) &&
            !/^serving\.knative\.dev\//.test(name),
        ),
      );
  return { template: { ...template, revision: expectedRevision }, expected };
}

export function assertRecoveryBaseline(value, expected = {}) {
  onlyKeys(value, [
    "schemaVersion",
    "receiptId",
    "runId",
    "sha",
    "project",
    "region",
    "service",
    "issuedAt",
    "originalBaseline",
    "originalFingerprint",
    "targetRevision",
    "targetFingerprint",
    "imageDigests",
    "allowedDifference",
    "tag",
    "tagOrigin",
    "tagPreviousRevision",
    "serviceControlsHash",
    "assurance",
  ]);
  coordinates(value);
  assertRecordedPredecessorBaseline(value.originalBaseline, value.service);
  if (
    !value.targetRevision?.startsWith(`${value.service}-`) ||
    Date.parse(value.originalBaseline.verifiedAt) >
      Date.parse(value.assurance?.verifiedAt)
  )
    throw new Error("recovery_receipt_invalid");
  if (
    value.schemaVersion !== RECOVERY_BASELINE_SCHEMA ||
    !UUID.test(value.receiptId) ||
    !Number.isFinite(Date.parse(value.issuedAt)) ||
    !FP.test(value.originalFingerprint) ||
    !FP.test(value.targetFingerprint) ||
    !FP.test(value.serviceControlsHash) ||
    !NAME.test(value.targetRevision) ||
    value.targetRevision === value.originalBaseline?.expectedRevision ||
    value.originalFingerprint !==
      value.originalBaseline?.expectedConfigurationFingerprint ||
    !SHA.test(value.originalBaseline?.expectedCommit) ||
    value.originalBaseline?.trafficPercent !== 100 ||
    value.originalBaseline?.adminVerdict !== "passed" ||
    value.originalBaseline?.monitoringState !== "ready" ||
    !Array.isArray(value.imageDigests) ||
    !value.imageDigests.length ||
    value.imageDigests.some((image) => !DIGEST.test(image)) ||
    value.allowedDifference !== "sheet_writeback_false_and_revision_identity" ||
    !/^cand-[a-z0-9-]+$/.test(value.tag) ||
    !/^https:\/\/[^/]+$/.test(value.tagOrigin) ||
    !NAME.test(value.tagPreviousRevision)
  )
    throw new Error("recovery_receipt_invalid");
  onlyKeys(value.assurance, [
    "phase",
    "verifiedAt",
    "adminVerdict",
    "editorVerdict",
    "monitoringState",
    "trafficPercent",
  ]);
  if (
    value.assurance.phase !== "recovery_preparation" ||
    value.assurance.adminVerdict !== "passed" ||
    value.assurance.editorVerdict !== "not_run" ||
    value.assurance.monitoringState !== "ready" ||
    value.assurance.trafficPercent !== 0 ||
    !Number.isFinite(Date.parse(value.assurance.verifiedAt)) ||
    Date.parse(value.assurance.verifiedAt) > Date.parse(value.issuedAt)
  )
    throw new Error("recovery_receipt_invalid");
  for (const [key, val] of Object.entries(expected))
    if (value[key] !== val) throw new Error("recovery_receipt_mismatch");
  return Object.freeze(value);
}
export function recoveryReference(path, receipt) {
  exactExternalReceiptPath(path);
  return {
    path,
    receiptId: receipt.receiptId,
    hash: recoveryHash(receipt),
    runId: receipt.runId,
  };
}
export function readRecoveryBaseline(reference, expected = {}) {
  onlyKeys(reference, ["path", "receiptId", "hash", "runId"]);
  exactExternalReceiptPath(reference.path);
  const receipt = assertRecoveryBaseline(read(reference.path), {
    ...expected,
    receiptId: reference.receiptId,
    runId: reference.runId,
  });
  if (recoveryHash(receipt) !== reference.hash)
    throw new Error("recovery_receipt_hash_mismatch");
  return receipt;
}
async function get(client, path) {
  return (await client.request({ method: "GET", url: API + path })).data;
}
async function getRevision(client, input, revision) {
  try {
    return await get(client, revisionName(input, revision));
  } catch (error) {
    if (error?.response?.status === 404) return null;
    throw new Error("recovery_revision_read_failed");
  }
}
async function settleOperation(client, operation, wait) {
  if (!operation?.name?.startsWith("projects/"))
    throw new Error("recovery_operation_unresolved");
  let result = operation;
  for (let pass = 0; pass < 180 && !result.done; pass++) {
    await wait(2000);
    result = await get(client, operation.name);
  }
  if (!result.done) throw new Error("recovery_operation_unresolved");
  if (result.error) throw new Error("recovery_operation_failed");
}
export async function resolvePredecessorDigests(client, input, source) {
  const images = source.containers.map((container) => container.image);
  if (images.every((image) => DIGEST.test(image))) return images;
  if (images.length !== 1) throw new Error("recovery_digest_required");
  const response = await client.request({
    method: "GET",
    url: `https://${input.region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${input.project}/revisions/${nameOf(source)}`,
  });
  const digest = response.data?.status?.imageDigest;
  if (response.data?.metadata?.name !== nameOf(source) || !DIGEST.test(digest ?? ""))
    throw new Error("recovery_digest_required");
  return [digest];
}

/** One zero-traffic configuration clone, no Cloud Build. A crash after a dispatch claim permits
 * readback only. Even a missing revision does not prove that an earlier request was not dispatched. */
export async function prepareRecoveryBaseline(
  input,
  {
    client,
    fingerprint = fingerprintRevisionRuntimeConfiguration,
    captureOriginalBaseline,
    assureTarget,
    stateRoot = defaultReleaseStateRoot(),
    now = Date.now,
    authorize = () =>
      assertReleaseAdmission({ sha: input.sha, runId: input.runId, stateRoot }),
    assertLock = () => {
      assertReleaseProcessLock({ stateRoot });
      assertReleaseCheckpoint({
        sha: input.sha,
        runId: input.runId,
        phases: ["recovery"],
        stateRoot,
      });
    },
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    resolveDigests = resolvePredecessorDigests,
    persist = writeReceipt,
  },
) {
  coordinates(input);
  assertLock();
  authorize();
  const receiptPath = statePath(stateRoot, input.runId, "baseline");
  if (existsSync(receiptPath))
    return {
      receipt: assertRecoveryBaseline(read(receiptPath), {
        runId: input.runId,
        sha: input.sha,
      }),
      path: receiptPath,
    };
  const service = await get(client, serviceName(input));
  assertServing(service, input.predecessorRevision);
  const source = await getRevision(client, input, input.predecessorRevision);
  assertReady(source, input, input.predecessorRevision);
  const originalPath = statePath(stateRoot, input.runId, "original");
  const originalBaseline = existsSync(originalPath)
    ? read(originalPath)
    : await captureOriginalBaseline();
  if (
    originalBaseline.expectedRevision !== input.predecessorRevision ||
    originalBaseline.expectedConfigurationFingerprint !== fingerprint(source)
  )
    throw new Error("recovery_original_baseline_mismatch");
  if (!existsSync(originalPath)) persist(originalPath, originalBaseline);
  const canonicalHost = new URL(originalBaseline.canonicalOrigin).hostname;
  const recoveryHost = new URL(input.tagOrigin).hostname;
  if (input.tagOrigin !== `https://${input.tag}---${canonicalHost}`)
    throw new Error("recovery_authorized_tag_binding_required");
  const identityConfig = (
    await client.request({
      method: "GET",
      url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${input.project}/config`,
    })
  ).data;
  const domains = identityConfig?.authorizedDomains;
  if (
    !Array.isArray(domains) ||
    domains.filter((host) => host === recoveryHost).length !== 1 ||
    !domains.includes(canonicalHost)
  )
    throw new Error("recovery_origin_not_authorized");
  const imageDigests = await resolveDigests(client, input, source);
  const targetRevision = `${input.service}-recovery-${input.runId.replaceAll("-", "").slice(0, 16)}`;
  const { template, expected } = pausedPredecessorTemplate(
    source,
    targetRevision,
    imageDigests,
  );
  const targetFingerprint = fingerprint(expected);
  const intentPath = statePath(stateRoot, input.runId, "preparation-intent");
  const tagEntry = service.trafficStatuses.find(
    (row) => row.tag === input.tag && row.uri === input.tagOrigin,
  );
  if (
    !tagEntry ||
    (tagEntry.revision !== input.predecessorRevision &&
      !(existsSync(intentPath) && tagEntry.revision === targetRevision)) ||
    !/^cand-[a-z0-9-]+$/.test(input.tag)
  )
    throw new Error("recovery_authorized_tag_binding_required");
  const intent = {
    schemaVersion: "pmi-kc-recovery-preparation-intent.v1",
    runId: input.runId,
    sha: input.sha,
    predecessorRevision: input.predecessorRevision,
    originalFingerprint: fingerprint(source),
    targetRevision,
    targetFingerprint,
    imageDigests,
    tag: input.tag,
    tagOrigin: input.tagOrigin,
    serviceControlsHash: serviceControlHash(service),
  };
  if (existsSync(intentPath)) {
    if (!equal(read(intentPath), intent))
      throw new Error("recovery_preparation_intent_mismatch");
  } else persist(intentPath, intent);
  let target = await getRevision(client, input, targetRevision);
  const claimPath = statePath(stateRoot, input.runId, "preparation-dispatch");
  const operationPath = statePath(stateRoot, input.runId, "preparation-operation");
  if (!target) {
    if (existsSync(claimPath)) {
      if (existsSync(operationPath))
        await settleOperation(client, read(operationPath), wait);
      target = await getRevision(client, input, targetRevision);
      if (!target) throw new Error("recovery_preparation_outcome_unresolved");
    } else {
      const fresh = await get(client, serviceName(input));
      assertServing(fresh, input.predecessorRevision);
      if (
        !fresh.etag ||
        serviceControlHash(fresh) !== intent.serviceControlsHash ||
        !equal(explicitTraffic(fresh), explicitTraffic(service))
      )
        throw new Error("recovery_service_conflict");
      authorize();
      assertLock();
      persist(claimPath, {
        runId: input.runId,
        targetRevision,
        serviceEtag: fresh.etag,
        claimedAt: new Date(now()).toISOString(),
      });
      // The durable claim survives lock loss. Restart may read back its outcome, never
      // reinterpret that claim as permission for another dispatch.
      assertLock();
      const operation = (
        await client.request({
          method: "PATCH",
          url: API + serviceName(input) + "?updateMask=template,traffic",
          data: {
            name: serviceName(input),
            etag: fresh.etag,
            template,
            traffic: explicitTraffic(fresh)
              .map((row) =>
                row.tag === input.tag
                  ? { ...row, revision: targetRevision, percent: 0 }
                  : row,
              )
              .concat(
                tagEntry.percent === 100
                  ? [
                      {
                        type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
                        revision: input.predecessorRevision,
                        percent: 100,
                      },
                    ]
                  : [],
              ),
          },
          retry: false,
        })
      ).data;
      persist(operationPath, { name: operation.name });
      await settleOperation(client, operation, wait);
      target = await getRevision(client, input, targetRevision);
    }
  }
  assertReady(target, input, targetRevision);
  if (!revisionSheetPaused(target) || fingerprint(target) !== targetFingerprint)
    throw new Error("recovery_configuration_mismatch");
  const after = await get(client, serviceName(input));
  assertServing(after, input.predecessorRevision);
  if (
    serviceControlHash(after) !== intent.serviceControlsHash ||
    !after.trafficStatuses.some(
      (row) =>
        row.tag === input.tag &&
        row.uri === input.tagOrigin &&
        row.revision === targetRevision &&
        !(row.percent > 0),
    )
  )
    throw new Error("recovery_zero_traffic_binding_mismatch");
  const assurance = await assureTarget({
    expectedRevision: targetRevision,
    expectedCommit: originalBaseline.expectedCommit,
    expectedConfigurationFingerprint: targetFingerprint,
    origin: input.tagOrigin,
    phase: "recovery_preparation",
  });
  const finalTarget = await getRevision(client, input, targetRevision);
  const finalService = await get(client, serviceName(input));
  assertReady(finalTarget, input, targetRevision);
  assertServing(finalService, input.predecessorRevision);
  if (
    fingerprint(finalTarget) !== targetFingerprint ||
    !revisionSheetPaused(finalTarget) ||
    serviceControlHash(finalService) !== intent.serviceControlsHash ||
    !finalService.trafficStatuses.some(
      (row) =>
        row.tag === input.tag &&
        row.uri === input.tagOrigin &&
        row.revision === targetRevision &&
        !(row.percent > 0),
    )
  )
    throw new Error("recovery_final_preparation_readback_failed");
  const receipt = assertRecoveryBaseline({
    schemaVersion: RECOVERY_BASELINE_SCHEMA,
    receiptId: randomUUID(),
    runId: input.runId,
    sha: input.sha,
    project: input.project,
    region: input.region,
    service: input.service,
    issuedAt: new Date(now()).toISOString(),
    originalBaseline,
    originalFingerprint: intent.originalFingerprint,
    targetRevision,
    targetFingerprint,
    imageDigests,
    allowedDifference: "sheet_writeback_false_and_revision_identity",
    tag: input.tag,
    tagOrigin: input.tagOrigin,
    tagPreviousRevision: input.predecessorRevision,
    serviceControlsHash: intent.serviceControlsHash,
    assurance,
  });
  assertLock();
  persist(receiptPath, receipt);
  return { receipt, path: receiptPath };
}

/** Fresh last-safe-boundary validation before a candidate receipt is consumed. */
export async function verifyRecoveryAvailability(
  receipt,
  {
    client,
    fingerprint = fingerprintRevisionRuntimeConfiguration,
    now = Date.now,
    requireFresh = true,
  },
) {
  assertRecoveryBaseline(receipt);
  if (
    requireFresh &&
    (now() - Date.parse(receipt.issuedAt) > 2 * 60 * 60_000 ||
      Date.parse(receipt.issuedAt) > now() + 30_000)
  )
    throw new Error("recovery_baseline_stale");
  const service = await get(client, serviceName(receipt));
  assertServing(service, receipt.originalBaseline.expectedRevision);
  if (serviceControlHash(service) !== receipt.serviceControlsHash)
    throw new Error("recovery_service_controls_changed");
  const original = await getRevision(
    client,
    receipt,
    receipt.originalBaseline.expectedRevision,
  );
  const target = await getRevision(client, receipt, receipt.targetRevision);
  assertReady(original, receipt, receipt.originalBaseline.expectedRevision);
  assertReady(target, receipt, receipt.targetRevision);
  if (
    fingerprint(original) !== receipt.originalFingerprint ||
    fingerprint(target) !== receipt.targetFingerprint ||
    !revisionSheetPaused(target) ||
    !equal(
      target.containers.map((container) => container.image),
      receipt.imageDigests,
    )
  )
    throw new Error("recovery_availability_unverified");
  return true;
}

/** Both promotion compensation and observation rollback use this one global run/service claim.
 * Held/expired forward admission never widens recovery: its immutable supplemental receipt is the
 * authority. Unknown dispatch outcomes permit readback, never a second traffic mutation. */
export async function executeSafeRecovery(
  reference,
  {
    client,
    fingerprint = fingerprintRevisionRuntimeConfiguration,
    candidateRevision,
    verifyRecovered,
    stateRoot = defaultReleaseStateRoot(),
    now = Date.now,
    assertLock = (receipt) => {
      assertReleaseProcessLock({ stateRoot });
      assertReleaseCheckpoint({
        sha: receipt.sha,
        runId: receipt.runId,
        revision: candidateRevision,
        phases: ["promote", "observe"],
        stateRoot,
      });
    },
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    persist = writeReceipt,
  },
) {
  const receipt = readRecoveryBaseline(reference);
  assertLock(receipt);
  if (
    !NAME.test(candidateRevision) ||
    candidateRevision === receipt.targetRevision ||
    candidateRevision === receipt.originalBaseline.expectedRevision
  )
    throw new Error("recovery_candidate_binding_invalid");
  const attemptPath = statePath(stateRoot, receipt.runId, "traffic-attempt");
  const operationPath = statePath(stateRoot, receipt.runId, "traffic-operation");
  const verifiedPath = statePath(stateRoot, receipt.runId, "verified");
  const binding = {
    runId: receipt.runId,
    receiptId: receipt.receiptId,
    receiptHash: recoveryHash(receipt),
    project: receipt.project,
    region: receipt.region,
    service: receipt.service,
    candidateRevision,
    targetRevision: receipt.targetRevision,
  };
  if (existsSync(attemptPath) && !equal(read(attemptPath).binding, binding))
    throw new Error("recovery_global_claim_mismatch");
  const target = await getRevision(client, receipt, receipt.targetRevision);
  assertReady(target, receipt, receipt.targetRevision);
  if (
    fingerprint(target) !== receipt.targetFingerprint ||
    !revisionSheetPaused(target) ||
    !equal(
      target.containers.map((container) => container.image),
      receipt.imageDigests,
    )
  )
    throw new Error("recovery_target_unverified");
  let service = await get(client, serviceName(receipt));
  if (serviceControlHash(service) !== receipt.serviceControlsHash)
    throw new Error("recovery_service_controls_changed");
  if (
    !equal(exactTraffic(service), [{ revision: receipt.targetRevision, percent: 100 }])
  ) {
    if (existsSync(attemptPath)) {
      if (existsSync(operationPath))
        await settleOperation(client, read(operationPath), wait);
      service = await get(client, serviceName(receipt));
      if (
        !equal(exactTraffic(service), [
          { revision: receipt.targetRevision, percent: 100 },
        ])
      )
        throw new Error("recovery_dispatch_outcome_unresolved");
    } else {
      const serving = exactTraffic(service);
      // A promotion request with an ambiguous reply may still serve the original predecessor.
      // That is not safe terminal recovery while its Sheet flag is true: shift only once to the
      // already-prepared paused target, while preserving all traffic-tag bindings.
      if (
        !equal(serving, [{ revision: candidateRevision, percent: 100 }]) &&
        !equal(serving, [
          { revision: receipt.originalBaseline.expectedRevision, percent: 100 },
        ])
      )
        throw new Error("recovery_unexpected_traffic");
      if (!service.etag || service.reconciling)
        throw new Error("recovery_service_conflict");
      assertLock(receipt);
      persist(attemptPath, {
        binding,
        claimedAt: new Date(now()).toISOString(),
        serviceEtag: service.etag,
        previousTrafficHash: recoveryHash(explicitTraffic(service)),
      });
      const traffic = explicitTraffic(service)
        .filter((row) => row.tag)
        .map((row) => ({ ...row, percent: 0 }));
      traffic.push({
        type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
        revision: receipt.targetRevision,
        percent: 100,
      });
      assertLock(receipt);
      const operation = (
        await client.request({
          method: "PATCH",
          url: API + serviceName(receipt) + "?updateMask=traffic",
          data: { name: serviceName(receipt), etag: service.etag, traffic },
          retry: false,
        })
      ).data;
      persist(operationPath, { name: operation.name });
      await settleOperation(client, operation, wait);
    }
  }
  const recovered = await getRevision(client, receipt, receipt.targetRevision);
  const finalService = await get(client, serviceName(receipt));
  assertReady(recovered, receipt, receipt.targetRevision);
  assertServing(finalService, receipt.targetRevision);
  if (
    !revisionSheetPaused(recovered) ||
    fingerprint(recovered) !== receipt.targetFingerprint ||
    serviceControlHash(finalService) !== receipt.serviceControlsHash
  )
    throw new Error("recovery_final_readback_failed");
  await verifyRecovered(receipt);
  assertLock(receipt);
  // Repeated verification is read-only and does not rewrite the original terminal receipt.
  if (!existsSync(verifiedPath))
    persist(verifiedPath, {
      schemaVersion: "pmi-kc-recovery-result.v1",
      ...binding,
      verifiedAt: new Date(now()).toISOString(),
      state: "ROLLED_BACK_VERIFIED",
    });
  return {
    state: "ROLLED_BACK_VERIFIED",
    revision: receipt.targetRevision,
    fingerprint: receipt.targetFingerprint,
    receiptPath: verifiedPath,
  };
}
