// Read-only service-authenticated candidate gate. The permanently paused probe job issues GET,
// never POST, so no customer occurrence or synthetic production record is used as test proof.
// Scheduler contract: https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs/run
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { GoogleAuth } from "google-auth-library";
const PROJECT = "pmi-kc-kb-prod";
const BASE = "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app";
const PATH = "/api/gmail-hub/sequence-worker";
const ACCOUNT = "pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com";
const JOB = `projects/${PROJECT}/locations/us-central1/jobs/pmi-kc-communication-worker-readiness`;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function targetEqual(a, b) {
  const normalize = (t) => ({
    ...t,
    headers: Object.fromEntries(
      Object.entries(t.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  });
  return equal(normalize(a), normalize(b));
}
function save(file, state) {
  const temp = file + "." + randomUUID() + ".tmp";
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(state, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, file);
  const directory = openSync(dirname(file), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
export function assertCommunicationProbeJob(job) {
  const t = job?.httpTarget;
  if (
    job?.name !== JOB ||
    job.state !== "PAUSED" ||
    job.schedule !== "0 0 1 1 *" ||
    job.attemptDeadline !== "120s" ||
    (job.retryConfig?.retryCount ?? 0) !== 0 ||
    t?.httpMethod !== "GET" ||
    t.uri !== BASE + PATH ||
    t.body ||
    t.oauthToken ||
    t.oidcToken?.serviceAccountEmail !== ACCOUNT ||
    t.oidcToken?.audience !== BASE + PATH
  )
    throw new Error("communication_worker_probe_configuration_unverified");
}
export async function verifyCommunicationWorkerAssurance(
  cp,
  {
    stateRoot,
    client: suppliedClient,
    now = Date.now,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    deadlineMs = 90_000,
  } = {},
) {
  const origin = new URL(cp.candidateOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !/^cand-[a-z0-9-]+---pmi-kc-app-kq6wuvpiva-uc\.a\.run\.app$/.test(origin.hostname) ||
    !/^[a-f0-9]{40}$/.test(cp.sha) ||
    !/^pmi-kc-app-[a-z0-9-]+$/.test(cp.revision) ||
    !stateRoot
  )
    throw new Error("communication_worker_candidate_binding_invalid");
  const file = join(stateRoot, `communication-worker-${cp.revision}.json`);
  const client =
    suppliedClient ??
    (await new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    }).getClient());
  const url = "https://cloudscheduler.googleapis.com/v1/" + JOB;
  const request = async (method, url, data) =>
    (
      await client.request({
        method,
        url,
        ...(data === undefined ? {} : { data }),
        retry: false,
        timeout: 30_000,
      })
    ).data;
  const original = await request("GET", url);
  if (existsSync(file)) {
    const old = JSON.parse(readFileSync(file, "utf8"));
    if (
      old.sha === cp.sha &&
      old.revision === cp.revision &&
      old.origin === origin.origin &&
      old.outcome === "passed" &&
      old.restored === true
    ) {
      assertCommunicationProbeJob(original);
      return { verified: true, path: file };
    }
    // A consumed/uncertain probe is reconciled from its own logs; never issue another jobs.run.
    throw new Error("communication_worker_probe_reconciliation_required");
  }
  assertCommunicationProbeJob(original);
  const started = now();
  const state = {
    schemaVersion: 1,
    sha: cp.sha,
    revision: cp.revision,
    origin: origin.origin,
    probeId: randomUUID(),
    startedAt: new Date(started).toISOString(),
    phase: "prepared",
    outcome: "pending",
    restored: false,
    originalTarget: original.httpTarget,
  };
  const target = {
    ...original.httpTarget,
    uri: origin.origin + PATH,
    headers: {
      ...(original.httpTarget.headers ?? {}),
      "X-PMI-Worker-Readiness": state.probeId,
    },
  };
  save(file, state);
  let failure;
  try {
    state.phase = "target_patch_pending";
    save(file, state);
    await request("PATCH", url + "?updateMask=httpTarget", {
      name: JOB,
      httpTarget: target,
    });
    const bound = await request("GET", url);
    if (bound.state !== "PAUSED" || !targetEqual(bound.httpTarget, target))
      throw new Error("communication_worker_probe_target_conflict");
    state.phase = "dispatch_pending";
    save(file, state);
    // This unique claim is durably consumed before the one managed GET invocation.
    await request("POST", url + ":run", {});
    state.phase = "awaiting_readback";
    save(file, state);
    while (now() - started < deadlineMs) {
      const entries = await request(
        "POST",
        "https://logging.googleapis.com/v2/entries:list",
        {
          resourceNames: [`projects/${PROJECT}`],
          pageSize: 10,
          orderBy: "timestamp desc",
          filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="pmi-kc-app" AND resource.labels.revision_name="${cp.revision}" AND jsonPayload.event="communication_worker_readiness" AND jsonPayload.probeId="${state.probeId}" AND timestamp>="${state.startedAt}"`,
        },
      );
      if (
        (entries.entries ?? []).some(
          (e) =>
            e.jsonPayload?.ready === true && e.jsonPayload?.probeId === state.probeId,
        )
      ) {
        state.outcome = "passed";
        state.observedAt = new Date(now()).toISOString();
        save(file, state);
        break;
      }
      const job = await request("GET", url);
      if (job.state !== "PAUSED" || !targetEqual(job.httpTarget, target))
        throw new Error("communication_worker_probe_target_conflict");
      if (
        Date.parse(job.lastAttemptTime ?? "") >= started &&
        (job.status?.code ?? 0) !== 0
      )
        throw new Error("communication_worker_probe_request_failed");
      await wait(3_000);
    }
    if (state.outcome !== "passed")
      throw new Error("communication_worker_probe_readback_unverified");
  } catch (error) {
    failure = error;
    state.outcome = "failed";
    state.reason = error?.message ?? "communication_worker_probe_unverified";
    save(file, state);
  } finally {
    try {
      const current = await request("GET", url);
      if (current.state !== "PAUSED")
        throw new Error("communication_worker_probe_restore_conflict");
      if (targetEqual(current.httpTarget, target)) {
        state.phase = "restore_pending";
        save(file, state);
        await request("PATCH", url + "?updateMask=httpTarget", {
          name: JOB,
          httpTarget: original.httpTarget,
        });
      } else if (!targetEqual(current.httpTarget, original.httpTarget))
        throw new Error("communication_worker_probe_restore_conflict");
      assertCommunicationProbeJob(await request("GET", url));
      state.restored = true;
      state.phase = "complete";
      save(file, state);
    } catch (error) {
      failure = error;
      state.outcome = "failed";
      state.reason = error?.message ?? "communication_worker_probe_restore_unverified";
      save(file, state);
    }
  }
  if (failure) throw failure;
  return { verified: state.outcome === "passed" && state.restored, path: file };
}
