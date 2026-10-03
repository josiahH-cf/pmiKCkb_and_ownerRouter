import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  recoveryFixture,
  setSheetWriteback,
} from "../helpers/release-recovery-fixture.mjs";
import { REVIEWED_CANDIDATE_SHEET_WRITEBACK } from "../../lib/production-assurance/sheet-writeback-expectation.mjs";
import {
  executeSafeRecovery,
  prepareRecoveryBaseline,
  recoveryHash,
  recoveryReference,
  verifyRecoveryAvailability,
} from "../../scripts/release-recovery.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const copy = (value) => structuredClone(value);
const save = (path, value) => writeFileSync(path, JSON.stringify(value));
const edit = (path, update) => {
  const value = JSON.parse(readFileSync(path, "utf8"));
  update(value);
  save(path, value);
};

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "recovery-build-proof-"));
  roots.push(root);
  const h = recoveryFixture(root);
  const buildId = "12345678-1234-4234-8234-123456789012";
  const imageUri = "us-central1-docker.pkg.dev/pmi-kc-kb-prod/source/app:latest";
  const digest = `sha256:${"b".repeat(64)}`;
  const imageDigest = imageUri.replace(/:latest$/, "") + "@" + digest;
  h.state.service.buildConfig = {
    name: "projects/123456789/locations/us-central1/builds/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sourceLocation: "gs://isolated-source/before.tgz#100",
    imageUri,
    serviceAccount:
      "projects/pmi-kc-kb-prod/serviceAccounts/build@pmi-kc-kb-prod.iam.gserviceaccount.com",
    enableAutomaticUpdates: false,
  };
  h.state.service.labels = { purpose: "isolated" };
  h.state.service.annotations = { "example.invalid/fixed": "unchanged" };
  const result = await prepareRecoveryBaseline(h.input, h.deps);
  h.receipt = result.receipt;
  h.path = result.path;
  h.reference = recoveryReference(h.path, h.receipt);
  const original = copy(h.state.service);
  h.operationPath = join(root, `recovery-${h.input.runId}-preparation-operation.json`);
  h.intentPath = join(root, `recovery-${h.input.runId}-preparation-intent.json`);
  h.dispatchPath = join(root, `recovery-${h.input.runId}-preparation-dispatch.json`);
  h.applicationPath = join(root, `application-build-${h.input.runId}.json`);
  const start = Date.parse(h.receipt.issuedAt) + 1000;
  save(h.applicationPath, {
    runId: h.input.runId,
    sha: h.input.sha,
    revision: h.candidate,
    claimedAt: new Date(start).toISOString(),
  });
  const source = {
    bucket: "isolated-source",
    object: "candidate.tgz",
    generation: "101",
  };
  h.build = {
    name: `projects/123456789/locations/us-central1/builds/${buildId}`,
    id: buildId,
    projectId: h.input.project,
    status: "SUCCESS",
    createTime: new Date(start + 1000).toISOString(),
    startTime: new Date(start + 2000).toISOString(),
    finishTime: new Date(start + 3000).toISOString(),
    source: { storageSource: source },
    sourceProvenance: { resolvedStorageSource: copy(source) },
    results: { images: [{ name: imageUri, digest }] },
  };
  h.operation = {
    name: JSON.parse(readFileSync(h.operationPath, "utf8")).name,
    done: true,
    response: { "@type": "type.googleapis.com/google.cloud.run.v2.Service", ...original },
  };
  h.state.service.buildConfig = {
    ...original.buildConfig,
    name: h.build.name,
    sourceLocation: "gs://isolated-source/candidate.tgz#101",
  };
  // S159: the candidate carries the reviewed value while the predecessor keeps its own.
  const revision = setSheetWriteback(
    copy(h.recovered),
    REVIEWED_CANDIDATE_SHEET_WRITEBACK,
  );
  revision.name = original.name + "/revisions/" + h.candidate;
  revision.containers[0].image = imageDigest;
  revision.containers[0].env.find((entry) => entry.name === "APP_COMMIT_SHA").value =
    h.input.sha;
  h.state.revisions.set(h.candidate, revision);
  h.v1 = {
    metadata: {
      name: h.candidate,
      annotations: { "run.googleapis.com/build-id": JSON.stringify({ app: buildId }) },
    },
    status: { imageDigest },
  };
  h.requests = [];
  const base = h.client.request;
  h.client.request = async (request) => {
    h.requests.push(copy(request));
    if (request.url.startsWith("https://cloudbuild.googleapis.com/"))
      return { data: copy(h.build) };
    if (request.url.includes("/operations/")) return { data: copy(h.operation) };
    if (request.url.includes("/apis/serving.knative.dev/")) return { data: copy(h.v1) };
    return base(request);
  };
  h.available = () =>
    verifyRecoveryAvailability(h.receipt, {
      client: h.client,
      candidateRevision: h.candidate,
      stateRoot: root,
    });
  h.recover = () =>
    executeSafeRecovery(h.reference, {
      client: h.client,
      candidateRevision: h.candidate,
      stateRoot: root,
      assertLock: () => {},
      verifyRecovered: h.verifyRecovered,
      wait: async () => {},
    });
  return h;
}

describe("exact source-build provenance across predecessor recovery", () => {
  it("keeps the old strict path and requires new proof for the actual two-leaf deployment transition", async () => {
    const h = await fixture();
    await expect(
      verifyRecoveryAvailability(h.receipt, { client: h.client, stateRoot: h.root }),
    ).rejects.toThrow("recovery_build_provenance_unverified");
    await expect(h.available()).resolves.toBe(true);
    expect(h.requests.every((r) => r.method === "GET")).toBe(true);
    expect(
      h.requests.find((r) => r.url.startsWith("https://cloudbuild.googleapis.com/")).url,
    ).toContain(
      `/projects/${h.input.project}/locations/${h.input.region}/builds/${h.build.id}`,
    );
    expect(h.requests.some((r) => r.url.includes("/projects/123456789/"))).toBe(false);
  });
  it("freshly validates assurance, final pre-promotion, rollback and already-recovered replay without rewriting evidence", async () => {
    const h = await fixture();
    const before = new Map(
      readdirSync(h.root).map((name) => [name, readFileSync(join(h.root, name), "utf8")]),
    );
    await h.available();
    await h.available();
    h.state.service.trafficStatuses[0].revision = h.candidate;
    expect((await h.recover()).state).toBe("ROLLED_BACK_VERIFIED");
    expect((await h.recover()).state).toBe("ROLLED_BACK_VERIFIED");
    expect(h.state.patches).toHaveLength(2); // one preparation + one recovery traffic dispatch
    for (const [name, bytes] of before)
      expect(readFileSync(join(h.root, name), "utf8")).toBe(bytes);
    expect(
      h.requests.filter((r) => r.url.startsWith("https://cloudbuild.googleapis.com/"))
        .length,
    ).toBe(6);
  });
  it("unchanged full control hash needs no build proof or new metadata requirement", async () => {
    const h = await fixture();
    h.state.service.buildConfig = copy(h.operation.response.buildConfig);
    unlinkSync(h.applicationPath);
    await expect(h.available()).resolves.toBe(true);
    expect(h.requests.some((r) => r.url.includes("cloudbuild"))).toBe(false);
  });
  it("uses the singleton build ID value and exact digest, not a guessed annotation map-key grammar", async () => {
    const h = await fixture();
    h.v1.metadata.annotations["run.googleapis.com/build-id"] = JSON.stringify({
      "opaque.provider_container": h.build.id,
    });
    await expect(h.available()).resolves.toBe(true);
  });
  it.each([0, 1])(
    "selects only the unique exact-name output with an unrelated image at index %i",
    async (index) => {
      const h = await fixture();
      h.build.results.images.splice(index, 0, {
        name: "registry.invalid/unrelated-output:latest",
        digest: `sha256:${"e".repeat(64)}`,
      });
      await expect(h.available()).resolves.toBe(true);
      h.state.service.trafficStatuses[0].revision = h.candidate;
      await expect(h.recover()).resolves.toMatchObject({ state: "ROLLED_BACK_VERIFIED" });
      expect(h.state.patches).toHaveLength(2);
    },
  );
  it.each(["operation", "build", "revision"])(
    "refuses an unavailable %s read without any effect or fallback",
    async (kind) => {
      const h = await fixture();
      const base = h.client.request;
      h.client.request = async (request) => {
        if (
          (kind === "operation" && request.url.includes("/operations/")) ||
          (kind === "build" && request.url.includes("cloudbuild.googleapis.com")) ||
          (kind === "revision" && request.url.endsWith(`/revisions/${h.candidate}`))
        ) {
          throw new Error("synthetic unavailable provider detail must not escape");
        }
        return base(request);
      };
      await expect(h.available()).rejects.toThrow(
        /^recovery_build_provenance_unverified$/,
      );
      expect(h.state.patches).toHaveLength(1);
    },
  );
  const refusals = [
    ["missing application claim", (h) => unlinkSync(h.applicationPath)],
    [
      "wrong application run",
      (h) =>
        edit(h.applicationPath, (v) => {
          v.runId = "00000000-0000-4000-8000-000000000000";
        }),
    ],
    [
      "wrong application SHA",
      (h) =>
        edit(h.applicationPath, (v) => {
          v.sha = "f".repeat(40);
        }),
    ],
    [
      "wrong application revision",
      (h) =>
        edit(h.applicationPath, (v) => {
          v.revision = h.target;
        }),
    ],
    [
      "application claim predates baseline",
      (h) =>
        edit(h.applicationPath, (v) => {
          v.claimedAt = "2000-01-01T00:00:00Z";
        }),
    ],
    ["missing recovery claim", (h) => unlinkSync(h.dispatchPath)],
    [
      "wrong recovery claim hash",
      (h) =>
        edit(h.dispatchPath, (v) => {
          v.intentHash = `sha256:${"f".repeat(64)}`;
        }),
    ],
    [
      "wrong recovery intent",
      (h) =>
        edit(h.intentPath, (v) => {
          v.tagPreviousRevision = h.candidate;
        }),
    ],
    ["missing operation", (h) => unlinkSync(h.operationPath)],
    [
      "wrong operation",
      (h) => {
        h.operation.name += "-other";
      },
    ],
    [
      "unfinished operation",
      (h) => {
        h.operation.done = false;
      },
    ],
    [
      "operation error",
      (h) => {
        h.operation.error = { code: 7 };
      },
    ],
    [
      "wrong operation response type",
      (h) => {
        h.operation.response["@type"] = "type.googleapis.com/foreign.Service";
      },
    ],
    [
      "wrong operation response service",
      (h) => {
        h.operation.response.name += "-other";
      },
    ],
    [
      "old preimage mismatch",
      (h) => {
        h.operation.response.ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY";
      },
    ],
    [
      "failed build",
      (h) => {
        h.build.status = "FAILURE";
      },
    ],
    [
      "foreign build project",
      (h) => {
        h.build.projectId = "foreign-project";
      },
    ],
    [
      "wrong build resource",
      (h) => {
        h.build.name += "0";
      },
    ],
    [
      "wrong build ID",
      (h) => {
        h.build.id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
      },
    ],
    [
      "build predates claim",
      (h) => {
        h.build.createTime = "2000-01-01T00:00:00Z";
      },
    ],
    [
      "invalid build time order",
      (h) => {
        h.build.finishTime = h.build.createTime;
      },
    ],
    [
      "unqualified source",
      (h) => {
        h.state.service.buildConfig.sourceLocation = "gs://isolated-source/candidate.tgz";
      },
    ],
    [
      "wrong source generation",
      (h) => {
        h.build.source.storageSource.generation = "102";
      },
    ],
    [
      "wrong source bucket",
      (h) => {
        h.build.source.storageSource.bucket = "foreign-bucket";
      },
    ],
    [
      "wrong source object",
      (h) => {
        h.build.source.storageSource.object = "other.tgz";
      },
    ],
    [
      "resolved source mismatch",
      (h) => {
        h.build.sourceProvenance.resolvedStorageSource.generation = "102";
      },
    ],
    [
      "source query",
      (h) => {
        h.state.service.buildConfig.sourceLocation += "?generation=101";
      },
    ],
    [
      "wrong candidate name",
      (h) => {
        h.state.revisions.get(h.candidate).name += "-other";
      },
    ],
    [
      "candidate not Ready",
      (h) => {
        h.state.revisions.get(h.candidate).conditions = [];
      },
    ],
    [
      "wrong candidate SHA",
      (h) => {
        h.state.revisions
          .get(h.candidate)
          .containers[0].env.find((e) => e.name === "APP_COMMIT_SHA").value = "f".repeat(
          40,
        );
      },
    ],
    [
      "ambiguous candidate SHA",
      (h) => {
        h.state.revisions
          .get(h.candidate)
          .containers[0].env.push({ name: "APP_COMMIT_SHA", value: h.input.sha });
      },
    ],
    [
      "candidate Sheet switch differing from the reviewed value",
      (h) => {
        h.state.revisions
          .get(h.candidate)
          .containers[0].env.find(
            (e) => e.name === "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED",
          ).value = "false";
      },
    ],
    [
      "wrong V1 candidate",
      (h) => {
        h.v1.metadata.name = h.original;
      },
    ],
    [
      "wrong candidate build ID",
      (h) => {
        h.v1.metadata.annotations["run.googleapis.com/build-id"] = JSON.stringify({
          app: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        });
      },
    ],
    [
      "ambiguous candidate builds",
      (h) => {
        h.v1.metadata.annotations["run.googleapis.com/build-id"] = JSON.stringify({
          app: h.build.id,
          other: h.build.id,
        });
      },
    ],
    [
      "wrong V1 digest",
      (h) => {
        h.v1.status.imageDigest = h.v1.status.imageDigest.replace(
          /b{64}$/,
          "f".repeat(64),
        );
      },
    ],
    [
      "wrong V2 image",
      (h) => {
        h.state.revisions.get(h.candidate).containers[0].image =
          "registry.invalid/other@sha256:" + "f".repeat(64);
      },
    ],
    [
      "wrong build image",
      (h) => {
        h.build.results.images[0].name = "registry.invalid/other:latest";
      },
    ],
    [
      "wrong build digest",
      (h) => {
        h.build.results.images[0].digest = `sha256:${"f".repeat(64)}`;
      },
    ],
    [
      "duplicate exact-name output with the same digest",
      (h) => {
        h.build.results.images.push(copy(h.build.results.images[0]));
      },
    ],
    [
      "duplicate exact-name output with a conflicting digest",
      (h) => {
        h.build.results.images.push({
          ...h.build.results.images[0],
          digest: `sha256:${"e".repeat(64)}`,
        });
      },
    ],
    [
      "non-array build output list",
      (h) => {
        h.build.results.images = {};
      },
    ],
    [
      "empty build output list",
      (h) => {
        h.build.results.images = [];
      },
    ],
    [
      "null build output entry",
      (h) => {
        h.build.results.images.push(null);
      },
    ],
    [
      "string build output entry",
      (h) => {
        h.build.results.images.push("unrelated");
      },
    ],
    [
      "array build output entry",
      (h) => {
        h.build.results.images.push([]);
      },
    ],
    [
      "build output entry missing name",
      (h) => {
        h.build.results.images.push({ digest: `sha256:${"e".repeat(64)}` });
      },
    ],
    [
      "build output entry missing digest",
      (h) => {
        h.build.results.images.push({ name: "registry.invalid/unrelated" });
      },
    ],
    [
      "build output entry malformed digest",
      (h) => {
        h.build.results.images.push({
          name: "registry.invalid/unrelated",
          digest: "not-a-content-digest",
        });
      },
    ],
    [
      "build output entry nonstring digest",
      (h) => {
        h.build.results.images.push({ name: "registry.invalid/unrelated", digest: 123 });
      },
    ],
    [
      "build output entry empty name",
      (h) => {
        h.build.results.images.push({ name: "", digest: `sha256:${"e".repeat(64)}` });
      },
    ],
    [
      "only one leaf changes",
      (h) => {
        h.state.service.buildConfig.name = h.operation.response.buildConfig.name;
      },
    ],
  ];
  describe.each(["availability", "recovery"])("%s refuses before any effect", (mode) => {
    it.each(refusals)("%s", async (_label, mutate) => {
      const h = await fixture();
      mutate(h);
      if (mode === "recovery") h.state.service.trafficStatuses[0].revision = h.candidate;
      await expect(mode === "recovery" ? h.recover() : h.available()).rejects.toThrow(
        "recovery_build_provenance_unverified",
      );
      expect(h.state.patches).toHaveLength(1);
      expect(
        readdirSync(h.root).some((path) => path.endsWith("-traffic-attempt.json")),
      ).toBe(false);
    });
    it.each([
      [
        "ingress",
        (h) => {
          h.state.service.ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY";
        },
      ],
      [
        "IAM",
        (h) => {
          h.state.service.invokerIamDisabled = true;
        },
      ],
      [
        "labels",
        (h) => {
          h.state.service.labels.extra = "changed";
        },
      ],
      [
        "annotations",
        (h) => {
          h.state.service.annotations.extra = "changed";
        },
      ],
      [
        "unknown service setting",
        (h) => {
          h.state.service.futureSecuritySetting = true;
        },
      ],
      [
        "build service identity",
        (h) => {
          h.state.service.buildConfig.serviceAccount = "other";
        },
      ],
      [
        "automatic update control",
        (h) => {
          h.state.service.buildConfig.enableAutomaticUpdates = true;
        },
      ],
      [
        "added unknown build setting",
        (h) => {
          h.state.service.buildConfig.futureSetting = true;
        },
      ],
      [
        "removed build setting",
        (h) => {
          delete h.state.service.buildConfig.serviceAccount;
        },
      ],
      [
        "image URI",
        (h) => {
          h.state.service.buildConfig.imageUri = "registry.invalid/new";
        },
      ],
    ])("%s remains exact", async (_label, mutate) => {
      const h = await fixture();
      mutate(h);
      if (mode === "recovery") h.state.service.trafficStatuses[0].revision = h.candidate;
      await expect(mode === "recovery" ? h.recover() : h.available()).rejects.toThrow(
        "recovery_service_controls_changed",
      );
      expect(h.state.patches).toHaveLength(1);
    });
  });
  it("refuses control drift at final rollback readback and never dispatches again", async () => {
    const h = await fixture();
    h.state.service.trafficStatuses[0].revision = h.candidate;
    const base = h.client.request;
    h.client.request = async (request) => {
      const response = await base(request);
      if (request.method === "PATCH") h.state.service.invokerIamDisabled = true;
      return response;
    };
    await expect(h.recover()).rejects.toThrow("recovery_service_controls_changed");
    await expect(h.recover()).rejects.toThrow("recovery_service_controls_changed");
    expect(h.state.patches).toHaveLength(2);
    expect(readdirSync(h.root).some((path) => path.endsWith("-verified.json"))).toBe(
      false,
    );
  });
  it("rechecks build provenance after dispatch even if the control hashes have not changed", async () => {
    const h = await fixture();
    h.state.service.trafficStatuses[0].revision = h.candidate;
    const base = h.client.request;
    h.client.request = async (request) => {
      const response = await base(request);
      if (request.method === "PATCH") h.build.status = "FAILURE";
      return response;
    };
    await expect(h.recover()).rejects.toThrow("recovery_build_provenance_unverified");
    expect(h.state.patches).toHaveLength(2);
  });
  it("does not authorize tampering with a baseline merely by recomputing a claim", async () => {
    const h = await fixture();
    edit(h.intentPath, (v) => {
      v.serviceControlsHash = recoveryHash(h.state.service);
    });
    edit(h.dispatchPath, (v) => {
      v.intentHash = recoveryHash(JSON.parse(readFileSync(h.intentPath, "utf8")));
    });
    await expect(h.available()).rejects.toThrow("recovery_build_provenance_unverified");
  });
});
