import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

export const CANDIDATE_ASSURANCE_RECEIPT_SCHEMA = "pmi-kc-candidate-assurance-receipt.v2";
export const PROMOTION_RECEIPT_SCHEMA = "pmi-kc-promotion-receipt.v2";
export const CANDIDATE_RECEIPT_CLAIM_SCHEMA = "pmi-kc-candidate-assurance-claim.v1";
export const CANDIDATE_RECEIPT_TTL_MS = 2 * 60 * 60 * 1000;

const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION = /^[a-z]+-[a-z]+[0-9]$/;
const RESOURCE = /^[a-z][a-z0-9-]{0,62}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const RECEIPT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const BASELINE_KEYS = Object.freeze([
  "verifiedAt",
  "canonicalOrigin",
  "expectedCommit",
  "expectedRevision",
  "expectedConfigurationFingerprint",
  "trafficPercent",
  "adminVerdict",
  "editorVerdict",
  "monitoringState",
]);
const CANDIDATE_KEYS = Object.freeze([
  "schemaVersion",
  "candidateReceiptId",
  "issuedAt",
  "expiresAt",
  "project",
  "region",
  "service",
  "candidateOrigin",
  "canonicalOrigin",
  "expectedCommit",
  "expectedRevision",
  "expectedConfigurationFingerprint",
  "predecessorRevision",
  "predecessorBaseline",
  "adminVerdict",
  "editorVerdict",
  "reconciliationState",
  "monitoringState",
]);
const PROMOTION_KEYS = Object.freeze([
  "schemaVersion",
  "candidateReceiptId",
  "candidateReceiptIssuedAt",
  "promotionStartedAt",
  "promotionVerifiedAt",
  "project",
  "region",
  "service",
  "canonicalOrigin",
  "expectedCommit",
  "expectedRevision",
  "expectedConfigurationFingerprint",
  "predecessorRevision",
  "predecessorBaseline",
]);
const CLAIM_KEYS = Object.freeze([
  "schemaVersion",
  "candidateReceiptId",
  "claimedAt",
  "project",
  "region",
  "service",
  "expectedCommit",
  "expectedRevision",
]);

const DEFAULT_IO = Object.freeze({
  close: closeSync,
  exists: existsSync,
  fsync: fsyncSync,
  link: linkSync,
  mkdir: mkdirSync,
  open: openSync,
  read: readFileSync,
  realpath: realpathSync,
  stat: statSync,
  unlink: unlinkSync,
  write: writeFileSync,
});

export function buildCandidateAssuranceReceipt(
  input,
  nowMs = Date.now(),
  candidateReceiptId = randomUUID(),
) {
  const issuedAt = new Date(nowMs).toISOString();
  return assertCandidateAssuranceReceipt(
    {
      schemaVersion: CANDIDATE_ASSURANCE_RECEIPT_SCHEMA,
      candidateReceiptId,
      issuedAt,
      expiresAt: new Date(nowMs + CANDIDATE_RECEIPT_TTL_MS).toISOString(),
      project: input.project,
      region: input.region,
      service: input.service,
      candidateOrigin: input.candidateOrigin,
      canonicalOrigin: input.canonicalOrigin,
      expectedCommit: input.expectedCommit,
      expectedRevision: input.expectedRevision,
      expectedConfigurationFingerprint: input.expectedConfigurationFingerprint,
      predecessorRevision: input.predecessorRevision,
      predecessorBaseline: input.predecessorBaseline,
      adminVerdict: input.adminVerdict,
      editorVerdict: input.editorVerdict,
      reconciliationState: input.reconciliationState,
      monitoringState: input.monitoringState,
    },
    {},
    nowMs,
  );
}

export function assertCandidateAssuranceReceipt(
  value,
  expected = {},
  nowMs = Date.now(),
  { allowExpired = false } = {},
) {
  assertPlainObject(value, "candidate_assurance_receipt_invalid");
  assertExactKeys(value, CANDIDATE_KEYS, "candidate_assurance_receipt_invalid");
  const baseline = assertPredecessorBaseline(
    value.predecessorBaseline,
    value.service,
    "candidate_assurance_receipt_invalid",
  );
  if (
    value.schemaVersion !== CANDIDATE_ASSURANCE_RECEIPT_SCHEMA ||
    !RECEIPT_ID.test(value.candidateReceiptId) ||
    !validIso(value.issuedAt) ||
    !validIso(value.expiresAt) ||
    (!allowExpired && Date.parse(value.expiresAt) <= nowMs) ||
    Date.parse(value.issuedAt) > nowMs + 30_000 ||
    Date.parse(value.expiresAt) - Date.parse(value.issuedAt) !==
      CANDIDATE_RECEIPT_TTL_MS ||
    !PROJECT.test(value.project) ||
    !REGION.test(value.region) ||
    !RESOURCE.test(value.service) ||
    !validOrigin(value.candidateOrigin) ||
    !validOrigin(value.canonicalOrigin) ||
    value.candidateOrigin === value.canonicalOrigin ||
    !COMMIT.test(value.expectedCommit) ||
    !RESOURCE.test(value.expectedRevision) ||
    !value.expectedRevision.startsWith(`${value.service}-`) ||
    !FINGERPRINT.test(value.expectedConfigurationFingerprint) ||
    !RESOURCE.test(value.predecessorRevision) ||
    value.predecessorRevision === value.expectedRevision ||
    baseline.canonicalOrigin !== value.canonicalOrigin ||
    baseline.expectedRevision !== value.predecessorRevision ||
    Date.parse(baseline.verifiedAt) > Date.parse(value.issuedAt) ||
    Date.parse(value.issuedAt) - Date.parse(baseline.verifiedAt) >
      CANDIDATE_RECEIPT_TTL_MS ||
    value.adminVerdict !== "passed" ||
    value.editorVerdict !== "passed" ||
    value.reconciliationState !== "matched" ||
    value.monitoringState !== "ready"
  ) {
    throw new Error("candidate_assurance_receipt_invalid");
  }
  assertExpected(value, expected, "candidate_assurance_receipt_mismatch");
  return Object.freeze({ ...value, predecessorBaseline: baseline });
}

export function buildPromotionReceipt(
  candidate,
  promotionStartedAtMs,
  promotionVerifiedAtMs = Date.now(),
) {
  if (!Number.isSafeInteger(promotionStartedAtMs)) {
    throw new Error("promotion_started_at_required");
  }
  const checked = assertCandidateAssuranceReceipt(candidate, {}, promotionStartedAtMs);
  return assertPromotionReceipt(
    {
      schemaVersion: PROMOTION_RECEIPT_SCHEMA,
      candidateReceiptId: checked.candidateReceiptId,
      candidateReceiptIssuedAt: checked.issuedAt,
      promotionStartedAt: new Date(promotionStartedAtMs).toISOString(),
      promotionVerifiedAt: new Date(promotionVerifiedAtMs).toISOString(),
      project: checked.project,
      region: checked.region,
      service: checked.service,
      canonicalOrigin: checked.canonicalOrigin,
      expectedCommit: checked.expectedCommit,
      expectedRevision: checked.expectedRevision,
      expectedConfigurationFingerprint: checked.expectedConfigurationFingerprint,
      predecessorRevision: checked.predecessorRevision,
      predecessorBaseline: checked.predecessorBaseline,
    },
    {},
    promotionVerifiedAtMs,
  );
}

export function assertPromotionReceipt(
  value,
  expected = {},
  nowMs = Date.now(),
  { allowStale = false } = {},
) {
  assertPlainObject(value, "promotion_receipt_invalid");
  assertExactKeys(value, PROMOTION_KEYS, "promotion_receipt_invalid");
  const baseline = assertPredecessorBaseline(
    value.predecessorBaseline,
    value.service,
    "promotion_receipt_invalid",
  );
  const startedAtMs = Date.parse(value.promotionStartedAt);
  const verifiedAtMs = Date.parse(value.promotionVerifiedAt);
  const candidateIssuedAtMs = Date.parse(value.candidateReceiptIssuedAt);
  if (
    value.schemaVersion !== PROMOTION_RECEIPT_SCHEMA ||
    !RECEIPT_ID.test(value.candidateReceiptId) ||
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(verifiedAtMs) ||
    verifiedAtMs < startedAtMs ||
    verifiedAtMs > nowMs + 30_000 ||
    (!allowStale && nowMs - verifiedAtMs > 14 * 60 * 1000) ||
    !Number.isFinite(candidateIssuedAtMs) ||
    candidateIssuedAtMs > startedAtMs ||
    startedAtMs - candidateIssuedAtMs > CANDIDATE_RECEIPT_TTL_MS ||
    !PROJECT.test(value.project) ||
    !REGION.test(value.region) ||
    !RESOURCE.test(value.service) ||
    !validOrigin(value.canonicalOrigin) ||
    !COMMIT.test(value.expectedCommit) ||
    !RESOURCE.test(value.expectedRevision) ||
    !value.expectedRevision.startsWith(`${value.service}-`) ||
    !FINGERPRINT.test(value.expectedConfigurationFingerprint) ||
    !RESOURCE.test(value.predecessorRevision) ||
    value.predecessorRevision === value.expectedRevision ||
    baseline.canonicalOrigin !== value.canonicalOrigin ||
    baseline.expectedRevision !== value.predecessorRevision ||
    Date.parse(baseline.verifiedAt) > startedAtMs
  ) {
    throw new Error("promotion_receipt_invalid");
  }
  assertExpected(value, expected, "promotion_receipt_mismatch");
  return Object.freeze({ ...value, predecessorBaseline: baseline });
}

export function readCandidateAssuranceReceipt(path, expected = {}, nowMs = Date.now()) {
  return assertCandidateAssuranceReceipt(readJson(path), expected, nowMs);
}

export function readPromotionReceipt(path, expected = {}, nowMs = Date.now()) {
  return assertPromotionReceipt(readJson(path), expected, nowMs);
}

/** Recovery is read-only and may be retried after authorization freshness has elapsed. */
export function readAssuranceReceiptForRecovery(path, expected = {}, nowMs = Date.now()) {
  const value = readJson(path);
  if (value?.schemaVersion === CANDIDATE_ASSURANCE_RECEIPT_SCHEMA) {
    return assertCandidateAssuranceReceipt(value, expected, nowMs, {
      allowExpired: true,
    });
  }
  if (value?.schemaVersion === PROMOTION_RECEIPT_SCHEMA) {
    return assertPromotionReceipt(value, expected, nowMs, { allowStale: true });
  }
  throw new Error("recovery_receipt_invalid");
}

export function claimCandidateAssuranceReceipt(
  candidatePath,
  candidate,
  nowMs = Date.now(),
  options = {},
) {
  const checked = assertCandidateAssuranceReceipt(candidate, {}, nowMs);
  const claim = Object.freeze({
    schemaVersion: CANDIDATE_RECEIPT_CLAIM_SCHEMA,
    candidateReceiptId: checked.candidateReceiptId,
    claimedAt: new Date(nowMs).toISOString(),
    project: checked.project,
    region: checked.region,
    service: checked.service,
    expectedCommit: checked.expectedCommit,
    expectedRevision: checked.expectedRevision,
  });
  assertCandidateClaim(claim);
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const io = options.io ?? DEFAULT_IO;
  exactExternalReceiptPath(candidatePath, repositoryRoot, io);
  // Consumption is global to the project/service release authority on this host, not adjacent to a
  // caller-selected receipt path. Copying the same receipt to any other allowed directory therefore
  // cannot mint another traffic attempt. Tests may inject an isolated authority root; production
  // always uses the stable per-user root below.
  const authorityRoot = resolveCandidateClaimAuthorityRoot(
    checked,
    options.authorityRoot,
    repositoryRoot,
    io,
  );
  const claimPath = resolve(
    authorityRoot,
    `.pmi-kc-candidate-assurance-${checked.candidateReceiptId}.claim`,
  );
  writeReceipt(claimPath, claim);
  return Object.freeze({ claimPath, claim });
}

function resolveCandidateClaimAuthorityRoot(
  candidate,
  configuredRoot,
  repositoryRoot,
  io,
) {
  const root = resolve(
    configuredRoot ??
      resolve(
        homedir(),
        ".pmi-kc",
        "release-authority",
        `${candidate.project}--${candidate.region}--${candidate.service}`,
      ),
  );
  try {
    io.mkdir(root, { recursive: true, mode: 0o700 });
    const canonical = io.realpath(root);
    if (!io.stat(canonical).isDirectory()) throw new Error();
    const repository = io.realpath(repositoryRoot);
    const fromRepository = relative(repository, canonical);
    if (
      fromRepository === "" ||
      (!fromRepository.startsWith("..") && !isAbsolute(fromRepository))
    ) {
      throw new Error();
    }
    return canonical;
  } catch {
    throw new Error("candidate_claim_authority_unavailable");
  }
}

export function writeReceipt(path, receipt) {
  const reservation = reserveReceipt(path);
  try {
    return commitReservedReceipt(reservation, receipt);
  } catch (error) {
    discardReceiptReservation(reservation);
    throw error;
  }
}

/** Reserve a same-directory pending file; the schema-valid final path remains absent. */
export function reserveReceipt(path, repositoryRoot = process.cwd(), io = DEFAULT_IO) {
  const output = exactExternalReceiptPath(path, repositoryRoot, io);
  if (io.exists(output)) throw new Error("receipt_path_exists");
  const pendingPath = resolve(dirname(output), `.${basename(output)}.pending`);
  const descriptor = io.open(pendingPath, "wx", 0o600);
  return {
    path: output,
    pendingPath,
    descriptor,
    open: true,
    finalPublished: false,
    io,
  };
}

/** fsync pending bytes, atomically link without overwrite, then fsync the containing directory. */
export function commitReservedReceipt(reservation, receipt) {
  assertOpenReservation(reservation);
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  try {
    reservation.io.write(reservation.descriptor, serialized, { encoding: "utf8" });
    reservation.io.fsync(reservation.descriptor);
    reservation.open = false;
    reservation.io.close(reservation.descriptor);
    reservation.io.link(reservation.pendingPath, reservation.path);
    reservation.finalPublished = true;
    reservation.io.unlink(reservation.pendingPath);
    syncDirectory(dirname(reservation.path), reservation.io);
    return reservation.path;
  } catch (error) {
    cleanupFailedReservation(reservation);
    throw error;
  }
}

/** Remove only pending/final paths created by this reservation. */
export function discardReceiptReservation(reservation) {
  if (!reservation || typeof reservation !== "object") return;
  if (reservation.open === true && Number.isInteger(reservation.descriptor)) {
    reservation.open = false;
    try {
      reservation.io.close(reservation.descriptor);
    } catch {
      // Continue to remove every path even when descriptor cleanup reports an error.
    }
  }
  let changed = unlinkIfPresent(reservation.pendingPath, reservation.io);
  if (reservation.finalPublished === true) {
    changed = unlinkIfPresent(reservation.path, reservation.io) || changed;
  }
  if (changed) {
    try {
      syncDirectory(dirname(reservation.path), reservation.io);
    } catch {
      // The visible paths are already gone. A caller still receives its original release failure.
    }
  }
}

export function exactExternalReceiptPath(
  path,
  repositoryRoot = process.cwd(),
  io = DEFAULT_IO,
) {
  if (typeof path !== "string" || path.trim() === "" || !isAbsolute(path)) {
    throw new Error("external_receipt_path_required");
  }
  let root;
  let parent;
  try {
    root = io.realpath(repositoryRoot);
    parent = io.realpath(dirname(resolve(path)));
  } catch {
    throw new Error("external_receipt_path_required");
  }
  const output = resolve(parent, basename(path));
  const fromRoot = relative(root, output);
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    throw new Error("receipt_path_must_be_outside_repository");
  }
  return output;
}

function readJson(path) {
  try {
    return JSON.parse(DEFAULT_IO.read(exactExternalReceiptPath(path), "utf8"));
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "external_receipt_path_required",
        "receipt_path_must_be_outside_repository",
      ].includes(error.message)
    ) {
      throw error;
    }
    throw new Error("receipt_read_failed");
  }
}

function assertPredecessorBaseline(value, service, code) {
  assertPlainObject(value, code);
  assertExactKeys(value, BASELINE_KEYS, code);
  if (
    !validIso(value.verifiedAt) ||
    !validOrigin(value.canonicalOrigin) ||
    !COMMIT.test(value.expectedCommit) ||
    !RESOURCE.test(value.expectedRevision) ||
    !value.expectedRevision.startsWith(`${service}-`) ||
    !FINGERPRINT.test(value.expectedConfigurationFingerprint) ||
    value.trafficPercent !== 100 ||
    value.adminVerdict !== "passed" ||
    value.editorVerdict !== "passed" ||
    value.monitoringState !== "ready"
  ) {
    throw new Error(code);
  }
  return Object.freeze({ ...value });
}

function assertCandidateClaim(value) {
  assertPlainObject(value, "candidate_claim_invalid");
  assertExactKeys(value, CLAIM_KEYS, "candidate_claim_invalid");
  if (
    value.schemaVersion !== CANDIDATE_RECEIPT_CLAIM_SCHEMA ||
    !RECEIPT_ID.test(value.candidateReceiptId) ||
    !validIso(value.claimedAt) ||
    !PROJECT.test(value.project) ||
    !REGION.test(value.region) ||
    !RESOURCE.test(value.service) ||
    !COMMIT.test(value.expectedCommit) ||
    !RESOURCE.test(value.expectedRevision)
  ) {
    throw new Error("candidate_claim_invalid");
  }
}

function cleanupFailedReservation(reservation) {
  if (reservation.open) {
    reservation.open = false;
    try {
      reservation.io.close(reservation.descriptor);
    } catch {
      // Path cleanup remains mandatory.
    }
  }
  let changed = unlinkIfPresent(reservation.pendingPath, reservation.io);
  if (reservation.finalPublished) {
    changed = unlinkIfPresent(reservation.path, reservation.io) || changed;
    reservation.finalPublished = false;
  }
  if (changed) {
    try {
      syncDirectory(dirname(reservation.path), reservation.io);
    } catch {
      // Best-effort durability after an injected/filesystem sync failure; preserve original error.
    }
  }
}

function syncDirectory(path, io) {
  const descriptor = io.open(path, "r");
  try {
    io.fsync(descriptor);
  } finally {
    io.close(descriptor);
  }
}

function unlinkIfPresent(path, io) {
  if (typeof path !== "string") return false;
  try {
    io.unlink(path);
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return false;
  }
}

function validOrigin(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      /(?:^|\.)a\.run\.app$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function validIso(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function assertPlainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
}

function assertExactKeys(value, keys, code) {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(code);
  }
}

function assertExpected(value, expected, code) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && value[key] !== expectedValue)
      throw new Error(code);
  }
}

function assertOpenReservation(value) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.path !== "string" ||
    typeof value.pendingPath !== "string" ||
    !Number.isInteger(value.descriptor) ||
    value.open !== true ||
    value.finalPublished !== false ||
    !value.io
  ) {
    throw new Error("receipt_reservation_invalid");
  }
}
