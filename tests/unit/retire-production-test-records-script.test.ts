import { chmod, mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import type { FirestoreRestFields } from "@/lib/operations/production-test-record-catalog";

import {
  buildProductionTestRetirementManifest,
  createProductionTestRecordSnapshot,
  formatProductionTestRetirementCounts,
  productionTestPitrBackupRef,
  productionTestRecordAggregateHash,
} from "@/lib/operations/production-test-retirement";

import {
  FirestoreRestClient,
  S56_DATABASE,
  S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES,
  S56_FIRESTORE_COMMIT_MAX_WRITES,
  S56_PROJECT,
  S56_RETIREMENT_COMMIT_MAX_WRITES,
  S56_SECURE_MANIFEST_ROOT,
  acquireManagedGcloudAccess,
  appendDeletionCommitEvidence,
  assertCloneReadback,
  assertPinnedEnvironment,
  batchFirestoreWritesForCommit,
  buildCasDeletePayload,
  buildCreateOnlyPayload,
  compareFirestoreTimestamps,
  formatCloneEligibility,
  hashFirestoreFields,
  parseS56Arguments,
  productionTestProjectionPaths,
  readIntakeFenceEvidence,
  rehearseProductionTestRestore,
  resolvePrivateManifestPath,
  runS56Phase,
  sealZeroDeletionEvidence,
  selectMissingRollbackDestinations,
  serializedFirestoreCommitBytes,
  verifyPreDeleteLiveEvidence,
  wholeMinuteBeforeTimestamp,
  writePrivateManifest,
  type ExecFileTransport,
  type BackupVerifiedRetirement,
  type RestoreDrillState,
  type S56OperatorManifest,
} from "@/scripts/retire-production-test-records";

const digest = "a".repeat(64);
const tokenSentinel = "access-token-private-sentinel";
const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    await unlink(cleanupPaths.pop()!).catch(() => undefined);
  }
});

describe("S56 argument and environment guards", () => {
  it("uses the socket-free tsx import path for every package entry", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Readonly<Record<string, string>>;
    };
    const names = [
      "count",
      "clone-backup",
      "verify-backup",
      "rehearse-restore",
      "delete",
      "verify-zero",
      "restore-deleted",
    ];
    for (const name of names) {
      expect(packageJson.scripts[`s56:test-records:${name}`]).toBe(
        `node --import tsx scripts/retire-production-test-records.ts ${name}`,
      );
    }
  });

  it("requires execute, the exact phrase, and an exact manifest digest for every mutation", () => {
    expect(() => parseS56Arguments(["delete"])).toThrow(/requires --execute/);
    expect(() =>
      parseS56Arguments(["delete", "--execute", "--confirm=DELETE_S56_TEST_RECORDS"]),
    ).toThrow(/manifest-digest/);
    expect(() =>
      parseS56Arguments([
        "delete",
        "--execute",
        "--confirm=DELETE_S56_TEST_RECORDS",
        `--manifest-digest=${"b".repeat(64)}`,
      ]),
    ).not.toThrow();
  });

  it("requires safe explicit names for clone and restore-drill databases", () => {
    expect(() =>
      parseS56Arguments([
        "clone-backup",
        "--execute",
        "--confirm=CLONE_S56_BACKUP",
        `--manifest-digest=${digest}`,
        "--backup-database=(default)",
      ]),
    ).toThrow(/s56-test-retirement/);
    expect(() =>
      parseS56Arguments([
        "rehearse-restore",
        "--execute",
        "--confirm=REHEARSE_S56_RESTORE",
        `--manifest-digest=${digest}`,
        "--restore-drill-database=s56-restore-drill-proof-20260802",
      ]),
    ).not.toThrow();
  });

  it("hard-pins project, database, location, and refuses emulator state", () => {
    expect(() => parseS56Arguments(["count", "--project=somewhere-else"])).toThrow(
      /hard-pinned to project/,
    );
    const args = parseS56Arguments(["count"]);
    expect(() =>
      assertPinnedEnvironment(args, testEnv({ FIRESTORE_EMULATOR_HOST: "127.0.0.1" })),
    ).toThrow(/refuses FIRESTORE_EMULATOR_HOST/);
    expect(() =>
      assertPinnedEnvironment(args, testEnv({ FIRESTORE_DATABASE_ID: "demo" })),
    ).toThrow(/different database/);
  });

  it("keeps read-only phases free of mutation flags", () => {
    expect(() => parseS56Arguments(["verify-zero", "--execute"])).toThrow(/read-only/);
    expect(() =>
      parseS56Arguments(["verify-zero", `--manifest-digest=${digest}`]),
    ).toThrow(/read-only/);
  });

  it("rechecks mutation authorization at the exported phase effect boundary", async () => {
    const parsed = parseS56Arguments([
      "delete",
      "--execute",
      "--confirm=DELETE_S56_TEST_RECORDS",
      `--manifest-digest=${digest}`,
    ]);
    let acquiredCredentials = false;
    await expect(
      runS56Phase({ ...parsed, execute: false }, testEnv(), {
        execFile: async () => {
          acquiredCredentials = true;
          return { stdout: "unexpected" };
        },
      }),
    ).rejects.toThrow(/requires --execute/);
    expect(acquiredCredentials).toBe(false);
  });

  it("refuses phase-specific options when their phase cannot use them", () => {
    expect(() => parseS56Arguments(["verify-zero", "--replace-manifest"])).toThrow(
      /only for the read-only count phase/,
    );
    expect(() =>
      parseS56Arguments(["count", "--backup-database=s56-test-retirement-20260802"]),
    ).toThrow(/only for clone-backup/);
    expect(() =>
      parseS56Arguments([
        "count",
        "--restore-drill-database=s56-restore-drill-proof-20260802",
      ]),
    ).toThrow(/only for rehearse-restore/);
  });
});

describe("managed gcloud token acquisition", () => {
  it("uses literal execFile arguments, GCLOUD_BIN, CLOUDSDK_CONFIG, and a bounded timeout", async () => {
    const calls: Array<{
      file: string;
      args: readonly string[];
      options: { readonly env: NodeJS.ProcessEnv; readonly timeout: number };
    }> = [];
    const transport: ExecFileTransport = async (file, args, options) => {
      calls.push({ file, args, options });
      if (args[0] === "config") return { stdout: `${S56_PROJECT}\n` };
      if (args[1] === "list") return { stdout: "operator@pmikcmetro.com\n" };
      return { stdout: `${tokenSentinel}\n` };
    };
    const result = await acquireManagedGcloudAccess(
      testEnv({ GCLOUD_BIN: "/safe/gcloud", CLOUDSDK_CONFIG: "/secure/config" }),
      transport,
    );
    expect(result.account).toBe("operator@pmikcmetro.com");
    expect(result.accessToken).toBe(tokenSentinel);
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.file === "/safe/gcloud")).toBe(true);
    expect(calls.every((call) => call.options.timeout === 30_000)).toBe(true);
    expect(
      calls.every((call) => call.options.env.CLOUDSDK_CONFIG === "/secure/config"),
    ).toBe(true);
    expect(calls[2].args).toContain("--account=operator@pmikcmetro.com");
  });

  it("refuses unmanaged identities and never reflects token-process errors", async () => {
    let call = 0;
    const unmanaged: ExecFileTransport = async () => {
      call += 1;
      return {
        stdout: call === 1 ? `${S56_PROJECT}\n` : "person@gmail.com\n",
      };
    };
    await expect(acquireManagedGcloudAccess(testEnv(), unmanaged)).rejects.toThrow(
      /not a managed PMI KC identity/,
    );

    call = 0;
    const tokenFailure: ExecFileTransport = async () => {
      call += 1;
      if (call === 1) return { stdout: `${S56_PROJECT}\n` };
      if (call === 2) return { stdout: "operator@pmikcmetro.com\n" };
      throw new Error(tokenSentinel);
    };
    await expect(acquireManagedGcloudAccess(testEnv(), tokenFailure)).rejects.not.toThrow(
      tokenSentinel,
    );
  });

  it("reads and binds both reachable services at exactly 100% traffic", async () => {
    const outputs = [
      {
        status: {
          traffic: [{ revisionName: "pmi-kc-app-rev-a", percent: 100 }],
        },
      },
      {
        metadata: {
          name: "pmi-kc-app-rev-a",
          creationTimestamp: "2026-08-02T19:07:07.123456Z",
        },
      },
      {
        status: {
          traffic: [{ revisionName: "pmi-kc-kb-demo-rev-b", percent: 100 }],
        },
      },
      {
        metadata: {
          name: "pmi-kc-kb-demo-rev-b",
          creationTimestamp: "2026-08-02T19:16:02.654321Z",
        },
      },
    ];
    const calls: string[][] = [];
    const transport: ExecFileTransport = async (_file, args) => {
      calls.push([...args]);
      return { stdout: JSON.stringify(outputs.shift()) };
    };
    const result = await readIntakeFenceEvidence(
      testEnv({ GCLOUD_BIN: "/safe/gcloud" }),
      "operator@pmikcmetro.com",
      transport,
    );
    expect(result.intakeFences).toEqual([
      {
        service: "pmi-kc-app",
        revision: "pmi-kc-app-rev-a",
        trafficPercent: 100,
        deployedAt: "2026-08-02T19:07:07.123456Z",
      },
      {
        service: "pmi-kc-kb-demo",
        revision: "pmi-kc-kb-demo-rev-b",
        trafficPercent: 100,
        deployedAt: "2026-08-02T19:16:02.654321Z",
      },
    ]);
    expect(result.deployedAt).toBe("2026-08-02T19:16:02.654321Z");
    expect(calls.filter((args) => args[1] === "services")).toHaveLength(2);
    expect(calls.filter((args) => args[1] === "revisions")).toHaveLength(2);
  });
});

describe("Firestore REST boundaries", () => {
  it("captures a server-owned readTime without reading a document", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = restClient(async (url, init) => {
      calls.push({ url, init });
      return jsonResponse([{ readTime: "2026-08-02T19:40:14.899733Z" }]);
    });
    await expect(client.captureServerReadTime()).resolves.toBe(
      "2026-08-02T19:40:14.899733Z",
    );
    const payload = JSON.parse(String(calls[0].init.body));
    expect(payload).toMatchObject({
      structuredQuery: {
        select: { fields: [{ fieldPath: "__name__" }] },
        limit: 0,
      },
    });
    expect(payload).not.toHaveProperty("readTime");
  });

  it("accepts equivalent Z/.000Z snapshots but detects a one-nanosecond drift", async () => {
    expect(
      compareFirestoreTimestamps("2026-08-02T19:40:00Z", "2026-08-02T19:40:00.000Z"),
    ).toBe(0);
    expect(
      compareFirestoreTimestamps(
        "2026-08-02T19:40:00.000000001Z",
        "2026-08-02T19:40:00Z",
      ),
    ).toBe(1);

    const client = restClient(async () =>
      jsonResponse([{ readTime: "2026-08-02T19:40:00Z" }]),
    );
    await expect(
      client.runProjectedCollectionQuery(
        "approval_queue_items",
        ["data_mode"],
        "2026-08-02T19:40:00.000Z",
      ),
    ).resolves.toEqual([]);
  });

  it("requires an exact found/missing union from batchGet", async () => {
    const first = documentName("approval_queue_items", "opaque-a");
    const second = documentName("maintenance_tickets", "opaque-b");
    const client = restClient(async () =>
      jsonResponse([
        { missing: first, readTime: "2026-08-02T19:40:00Z" },
        { missing: second, readTime: "2026-08-02T19:40:00.000Z" },
      ]),
    );
    await expect(
      client.batchLookupDocuments([first, second], {
        readTime: "2026-08-02T19:40:00Z",
      }),
    ).resolves.toEqual({ found: [], missing: [first, second] });

    const duplicate = restClient(async () =>
      jsonResponse([
        { missing: first, readTime: "2026-08-02T19:40:00Z" },
        { missing: first, readTime: "2026-08-02T19:40:00Z" },
      ]),
    );
    await expect(
      duplicate.batchLookupDocuments([first, second], {
        readTime: "2026-08-02T19:40:00Z",
      }),
    ).rejects.toThrow(/duplicated, omitted, or unexpected/);
  });

  it("builds the official PITR clone payload and never interpolates a shell", async () => {
    let body: unknown;
    const client = restClient(async (_url, init) => {
      body = JSON.parse(String(init.body));
      return jsonResponse({ name: `${documentName("x", "y")}/operations/clone` });
    });
    await client.cloneDatabase({
      destinationDatabase: "s56-test-retirement-20260802",
      snapshotTime: "2026-08-02T19:40:00Z",
    });
    expect(body).toEqual({
      databaseId: "s56-test-retirement-20260802",
      pitrSnapshot: {
        database: `projects/${S56_PROJECT}/databases/${S56_DATABASE}`,
        snapshotTime: "2026-08-02T19:40:00Z",
      },
    });
  });

  it("requires exact successful clone LRO, source UID, response UID, and GET identity", () => {
    const client = restClient(async () => jsonResponse({}));
    const destination = "s56-test-retirement-20260802";
    const destinationName = `projects/${S56_PROJECT}/databases/${destination}`;
    const snapshot = "2026-08-02T19:40:00.000Z";
    const completed = {
      name: `${destinationName}/operations/clone-proof`,
      done: true,
      metadata: {
        operationState: "SUCCESSFUL",
        database: destinationName,
        pitrSnapshot: {
          database: `projects/${S56_PROJECT}/databases/${S56_DATABASE}`,
          databaseUid: "source-uid",
          snapshotTime: "2026-08-02T19:40:00Z",
        },
      },
      response: { name: destinationName, uid: "clone-uid" },
    };
    const database = {
      name: destinationName,
      uid: "clone-uid",
      locationId: "us-central1",
      type: "FIRESTORE_NATIVE",
    };
    expect(
      assertCloneReadback({
        client,
        completed,
        database,
        destinationDatabase: destination,
        snapshotTime: snapshot,
        sourceDatabaseUid: "source-uid",
      }),
    ).toMatchObject({
      cloneDatabaseUid: "clone-uid",
      lroMetadata: { operationState: "SUCCESSFUL" },
    });
    expect(() =>
      assertCloneReadback({
        client,
        completed: {
          ...completed,
          metadata: { ...completed.metadata, operationState: "FAILED" },
        },
        database,
        destinationDatabase: destination,
        snapshotTime: snapshot,
        sourceDatabaseUid: "source-uid",
      }),
    ).toThrow(/exact source and snapshot/);
  });

  it("validates every commit result and preserves the exact nanosecond commitTime", async () => {
    const client = restClient(async () =>
      jsonResponse({
        writeResults: [{}],
        commitTime: "2026-08-02T19:40:14.899733123Z",
      }),
    );
    await expect(
      client.commitWrites([{ delete: documentName("x", "y") }]),
    ).resolves.toEqual({
      commitTime: "2026-08-02T19:40:14.899733123Z",
    });

    const malformed = restClient(async () =>
      jsonResponse({ writeResults: [], commitTime: "2026-08-02T19:40:14Z" }),
    );
    await expect(malformed.commitWrites([{}])).rejects.toThrow(
      /did not match every requested write/,
    );
  });

  it("keeps the API hard cap while batching every retirement write separately", async () => {
    const writes = Array.from(
      { length: S56_FIRESTORE_COMMIT_MAX_WRITES + 1 },
      (_, id) => ({
        delete: documentName("maintenance_test_action_receipts", `opaque-${id}`),
      }),
    );

    expect(S56_RETIREMENT_COMMIT_MAX_WRITES).toBe(1);
    expect(batchFirestoreWritesForCommit(writes).map((batch) => batch.length)).toEqual(
      Array.from({ length: writes.length }, () => 1),
    );

    let requested = false;
    const client = restClient(async () => {
      requested = true;
      return jsonResponse({});
    });
    await expect(client.commitWrites(writes)).rejects.toThrow(/between 1 and 100/);
    expect(requested).toBe(false);
  });

  it("splits rollback batches at the serialized-byte ceiling and refuses one oversized write", async () => {
    const makeWrite = (payloadLength: number) => ({
      update: {
        name: documentName("maintenance_test_action_receipts", "opaque-large"),
        fields: { payload: { stringValue: "x".repeat(payloadLength) } },
      },
      currentDocument: { exists: false },
    });
    const emptyWriteBytes = serializedFirestoreCommitBytes([makeWrite(0)]);
    const exactCeilingWrite = makeWrite(
      S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES - emptyWriteBytes,
    );
    expect(serializedFirestoreCommitBytes([exactCeilingWrite])).toBe(
      S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES,
    );
    expect(batchFirestoreWritesForCommit([exactCeilingWrite])).toHaveLength(1);

    const twoEmptyWriteBytes = serializedFirestoreCommitBytes([
      makeWrite(0),
      makeWrite(0),
    ]);
    const splitPayloadLength =
      Math.floor((S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES - twoEmptyWriteBytes) / 2) +
      1;
    const splitWrite = makeWrite(splitPayloadLength);
    expect(serializedFirestoreCommitBytes([splitWrite])).toBeLessThan(
      S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES,
    );
    expect(serializedFirestoreCommitBytes([splitWrite, splitWrite])).toBeGreaterThan(
      S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES,
    );
    expect(
      batchFirestoreWritesForCommit([splitWrite, splitWrite]).map(
        (batch) => batch.length,
      ),
    ).toEqual([1, 1]);

    const oversizedWrite = makeWrite(
      S56_FIRESTORE_COMMIT_MAX_SERIALIZED_BYTES - emptyWriteBytes + 1,
    );
    expect(() => batchFirestoreWritesForCommit([oversizedWrite])).toThrow(
      /single Firestore write exceeds/,
    );

    let requested = false;
    const client = restClient(async () => {
      requested = true;
      return jsonResponse({});
    });
    await expect(client.commitWrites([oversizedWrite])).rejects.toThrow(
      /commit exceeds the conservative serialized request ceiling/,
    );
    expect(requested).toBe(false);
  });

  it("pins low-level commits to Production or a named S56 restore drill", async () => {
    let requested = false;
    const client = restClient(async () => {
      requested = true;
      return jsonResponse({});
    });
    await expect(client.commitWrites([{}], "customer-copy")).rejects.toThrow(
      /escaped Production or an S56 restore-drill/,
    );
    expect(requested).toBe(false);
  });

  it("uses etag CAS for restore-drill deletion", async () => {
    let requestUrl = "";
    const client = restClient(async (url) => {
      requestUrl = url;
      return jsonResponse({
        name: "projects/pmi-kc-kb-prod/databases/drill/operations/delete",
      });
    });
    await client.deleteDrillDatabase("s56-restore-drill-proof-20260802", "etag/value");
    expect(requestUrl).toContain("etag=etag%2Fvalue");
  });

  it("redacts Firestore error bodies and does not include the bearer token in errors", async () => {
    const client = restClient(
      async () =>
        new Response(JSON.stringify({ error: { message: tokenSentinel } }), {
          status: 409,
        }),
    );
    await expect(client.captureServerReadTime()).rejects.toThrow(/HTTP 409/);
    await expect(client.captureServerReadTime()).rejects.not.toThrow(tokenSentinel);
  });

  it("revalidates clone identity, every full record hash, aggregate, and both fences before delete", async () => {
    const fixture = preDeleteFixture();
    const client = preDeleteClient(fixture, fixture.fields);
    await expect(
      verifyPreDeleteLiveEvidence({
        client,
        retirement: fixture.retirement,
        env: testEnv({ GCLOUD_BIN: "/safe/gcloud" }),
        account: "operator@pmikcmetro.com",
        execFile: fenceReadbackTransport(),
      }),
    ).resolves.toEqual({ cloneRecordCount: 1, fenceCount: 2 });
  });

  it("refuses before delete when a cloned record's full-field hash drifts", async () => {
    const fixture = preDeleteFixture();
    const client = preDeleteClient(fixture, {
      data_mode: { stringValue: "live" },
    });
    await expect(
      verifyPreDeleteLiveEvidence({
        client,
        retirement: fixture.retirement,
        env: testEnv({ GCLOUD_BIN: "/safe/gcloud" }),
        account: "operator@pmikcmetro.com",
        execFile: fenceReadbackTransport(),
      }),
    ).rejects.toThrow(/clone record hash drifted/);
  });

  it("refuses before delete when either 100% fence revision drifts", async () => {
    const fixture = preDeleteFixture();
    await expect(
      verifyPreDeleteLiveEvidence({
        client: preDeleteClient(fixture, fixture.fields),
        retirement: fixture.retirement,
        env: testEnv({ GCLOUD_BIN: "/safe/gcloud" }),
        account: "operator@pmikcmetro.com",
        execFile: fenceReadbackTransport("pmi-kc-app-drifted"),
      }),
    ).rejects.toThrow(/intake fence drifted/);
  });
});

describe("restore-drill crash recovery", () => {
  it("recovers an accepted create after its operation-state write is lost", async () => {
    const harness = restoreDrillCrashHarness();
    harness.failNext("CREATE_REQUESTED");

    await expect(harness.run()).rejects.toThrow(/simulated manifest write loss/);
    expect(harness.durable().restoreDrill?.state).toBe("INTENDED");
    expect(harness.metrics()).toMatchObject({ createRequests: 1, acceptedCreates: 1 });
    expect(harness.logs().join("\n")).toMatch(/recovery reference/);

    const completed = await harness.run();
    expect(completed.restoreDrill?.state).toBe("CLEANUP_VERIFIED");
    expect(completed.restoreProof?.cleanupVerified).toBe(true);
    expect(harness.metrics()).toMatchObject({ createRequests: 2, acceptedCreates: 1 });
  });

  it("recovers an accepted create-only write from the existing exact document", async () => {
    const harness = restoreDrillCrashHarness();
    harness.failNext("RESTORE_VERIFIED");

    await expect(harness.run()).rejects.toThrow(/simulated manifest write loss/);
    expect(harness.durable().restoreDrill?.state).toBe("READY");
    expect(harness.metrics().restoreCommits).toBe(1);

    const completed = await harness.run();
    expect(completed.restoreDrill?.state).toBe("CLEANUP_VERIFIED");
    expect(harness.metrics().restoreCommits).toBe(1);
  });

  it("recovers an accepted delete from the same owned UID until absence", async () => {
    const harness = restoreDrillCrashHarness();
    harness.failNext("CLEANUP_REQUESTED");

    await expect(harness.run()).rejects.toThrow(/simulated manifest write loss/);
    expect(harness.durable().restoreDrill?.state).toBe("RESTORE_VERIFIED");
    expect(harness.metrics()).toMatchObject({ deleteRequests: 1, deleting: true });

    const completed = await harness.run();
    expect(completed.restoreDrill?.state).toBe("CLEANUP_VERIFIED");
    expect(completed.restoreProof?.cleanupVerified).toBe(true);
    expect(harness.metrics()).toMatchObject({ deleteRequests: 1, databaseExists: false });
  });

  it("refuses cleanup recovery when the deleting database UID is not the owned UID", async () => {
    const harness = restoreDrillCrashHarness();
    harness.failNext("CLEANUP_REQUESTED");
    await expect(harness.run()).rejects.toThrow(/simulated manifest write loss/);
    harness.setReadbackUid("different-database-uid");

    await expect(harness.run()).rejects.toThrow(/did not match the owned UID/);
    expect(harness.metrics().deleteRequests).toBe(1);
    expect(harness.durable().restoreDrill?.state).toBe("RESTORE_VERIFIED");
  });
});

describe("payload and private-manifest helpers", () => {
  it("projects every root alias plus the collection's secondary and retention fields", () => {
    expect(productionTestProjectionPaths("workflow_runs")).toEqual(
      expect.arrayContaining([
        "data_mode",
        "dataMode",
        "is_test_run",
        "source_publication_pin.data_mode",
        "product_retention_policy",
        "product_retention_class",
        "legal_hold",
      ]),
    );
  });
  it("builds updateTime CAS deletes and exists:false creates only inside pinned databases", () => {
    const name = documentName("approval_queue_items", "opaque");
    expect(buildCasDeletePayload(name, "2026-08-02T19:40:14.899733Z")).toEqual({
      delete: name,
      currentDocument: { updateTime: "2026-08-02T19:40:14.899733Z" },
    });
    expect(
      buildCreateOnlyPayload(
        { name, fields: { data_mode: { stringValue: "test" } } },
        "s56-restore-drill-proof-20260802",
      ),
    ).toMatchObject({ currentDocument: { exists: false } });
    expect(() =>
      buildCasDeletePayload(
        "projects/other/databases/(default)/documents/x/y",
        "2026-08-02T19:40:14Z",
      ),
    ).toThrow(/escaped/);
  });

  it("hashes Firestore fields independently of object-key order", () => {
    expect(
      hashFirestoreFields({
        z: { stringValue: "last" },
        a: { integerValue: "1" },
      }),
    ).toBe(
      hashFirestoreFields({
        a: { integerValue: "1" },
        z: { stringValue: "last" },
      }),
    );
  });

  it("makes rollback resumable by leaving exact existing records and creating only missing ones", () => {
    const fields = { data_mode: { stringValue: "test" } };
    const name = documentName("maintenance_test_action_receipts", "opaque-proof");
    const record = createProductionTestRecordSnapshot({
      documentName: name,
      collection: "maintenance_test_action_receipts",
      id: "opaque-proof",
      updateTime: "2026-08-02T19:40:14.899733Z",
      fields,
    });
    expect(selectMissingRollbackDestinations([record], [{ name, fields }], [])).toEqual(
      [],
    );
    expect(selectMissingRollbackDestinations([record], [], [name])).toEqual([name]);
    expect(() =>
      selectMissingRollbackDestinations(
        [record],
        [{ name, fields: { data_mode: { stringValue: "live" } } }],
        [],
      ),
    ).toThrow(/content drift/);
  });

  it("journals each exact server commit before the next delete batch", () => {
    const initial = {
      completedAt: "2026-08-02T19:40:14.899733000Z",
      deletedCount: 0,
      commitTimes: [],
    };
    const first = appendDeletionCommitEvidence(
      initial,
      "2026-08-02T19:40:14.899733001Z",
      1,
    );
    const second = appendDeletionCommitEvidence(
      first,
      "2026-08-02T19:40:14.899733002Z",
      1,
    );
    expect(initial).toEqual({
      completedAt: "2026-08-02T19:40:14.899733000Z",
      deletedCount: 0,
      commitTimes: [],
    });
    expect(second).toEqual({
      completedAt: "2026-08-02T19:40:14.899733002Z",
      deletedCount: 2,
      commitTimes: ["2026-08-02T19:40:14.899733001Z", "2026-08-02T19:40:14.899733002Z"],
    });
    expect(() =>
      appendDeletionCommitEvidence(second, "2026-08-02T19:40:14.899733001Z", 1),
    ).toThrow(/regressed/);
    expect(() =>
      appendDeletionCommitEvidence(second, "2026-08-02T19:40:14.899733003Z", 2),
    ).toThrow(/exactly one committed record/);
  });

  it("reconciles a lost final journal write from the later server-owned zero snapshot", () => {
    const firstCommit = "2026-08-02T19:40:14.899733001Z";
    const secondCommit = "2026-08-02T19:40:14.899733002Z";
    const zeroSnapshot = "2026-08-02T19:41:01.100000001Z";
    const sealed = sealZeroDeletionEvidence(
      {
        completedAt: firstCommit,
        deletedCount: 1,
        commitTimes: [firstCommit],
      },
      2,
      zeroSnapshot,
    );
    expect(sealed).toEqual({
      completedAt: firstCommit,
      deletedCount: 2,
      commitTimes: [firstCommit],
      zeroVerifiedAt: zeroSnapshot,
      journalReconciliation: "zero_snapshot_proved_unjournaled_commits",
      journalReconciledAt: zeroSnapshot,
    });
    expect(sealed.commitTimes).not.toContain(zeroSnapshot);

    const normal = sealZeroDeletionEvidence(
      {
        completedAt: secondCommit,
        deletedCount: 2,
        commitTimes: [firstCommit, secondCommit],
      },
      2,
      zeroSnapshot,
    );
    expect(normal.deletedCount).toBe(2);
    expect(normal.zeroVerifiedAt).toBe(zeroSnapshot);
    expect(normal.journalReconciliation).toBeUndefined();
    expect(() =>
      sealZeroDeletionEvidence(
        {
          completedAt: secondCommit,
          deletedCount: 2,
          commitTimes: [firstCommit, secondCommit],
        },
        1,
        zeroSnapshot,
      ),
    ).toThrow(/exceeds the sealed manifest total/);
    expect(() =>
      sealZeroDeletionEvidence(
        { completedAt: firstCommit, deletedCount: 2, commitTimes: [firstCommit] },
        2,
        zeroSnapshot,
      ),
    ).toThrow(/timestamp count/);
    expect(() =>
      sealZeroDeletionEvidence(
        { completedAt: firstCommit, deletedCount: 1, commitTimes: [firstCommit] },
        3,
        zeroSnapshot,
      ),
    ).toThrow(/at most one accepted-but-unjournaled/);
  });

  it("renders only counts, never private identifiers or hashes", () => {
    const fields = { data_mode: { stringValue: "test" } };
    const record = createProductionTestRecordSnapshot({
      documentName: documentName(
        "maintenance_test_action_receipts",
        "private-id-sentinel",
      ),
      collection: "maintenance_test_action_receipts",
      id: "private-id-sentinel",
      updateTime: "2026-08-02T19:40:14.899733Z",
      fields,
    });
    const output = formatProductionTestRetirementCounts(
      buildProductionTestRetirementManifest({
        records: [record],
        countedAt: "2026-08-02T19:40:00Z",
      }),
    );
    expect(output).toContain("maintenance_test_action_receipts: 1");
    expect(output).not.toContain("private-id-sentinel");
    expect(output).not.toContain(record.recordHash);
    expect(output).not.toContain(record.documentName);
  });

  it("counts legal-hold Test rows but refuses clone eligibility without identifiers", () => {
    const fields = {
      data_mode: { stringValue: "test" },
      product_retention_policy: { stringValue: "product-record-retention:v1.0" },
      product_retention_class: { stringValue: "indefinite" },
      legal_hold: { booleanValue: true },
    };
    const record = createProductionTestRecordSnapshot({
      documentName: documentName("approval_queue_items", "held-private-id"),
      collection: "approval_queue_items",
      id: "held-private-id",
      updateTime: "2026-08-02T19:40:14Z",
      fields,
    });
    expect(() =>
      buildProductionTestRetirementManifest({
        records: [record],
        countedAt: "2026-08-02T19:40:00Z",
      }),
    ).not.toThrow();
    const result = formatCloneEligibility([record]);
    expect(result.eligible).toBe(false);
    expect(result.report).toContain("blocked_legal_hold=1");
    expect(result.report).not.toContain("held-private-id");
    expect(result.report).not.toContain(record.recordHash);
  });

  it("chooses a whole-minute PITR snapshot strictly before the exact server instant", () => {
    expect(wholeMinuteBeforeTimestamp("2026-08-02T19:40:00Z")).toBe(
      "2026-08-02T19:39:00.000Z",
    );
    expect(wholeMinuteBeforeTimestamp("2026-08-02T19:40:00.000Z")).toBe(
      "2026-08-02T19:39:00.000Z",
    );
    expect(wholeMinuteBeforeTimestamp("2026-08-02T19:40:00.000000001Z")).toBe(
      "2026-08-02T19:40:00.000Z",
    );
    expect(wholeMinuteBeforeTimestamp("2026-08-02T19:40:59.999999999Z")).toBe(
      "2026-08-02T19:40:00.000Z",
    );
  });

  it("restricts manifests to native secure temp and refuses symlink destinations", async () => {
    expect(() => resolvePrivateManifestPath("../escape.json")).toThrow(/native secure/);
    await mkdir(S56_SECURE_MANIFEST_ROOT, { mode: 0o700 }).catch(() => undefined);
    await chmod(S56_SECURE_MANIFEST_ROOT, 0o700);
    const target = resolvePrivateManifestPath(`symlink-${process.pid}.json`);
    cleanupPaths.push(target);
    await symlink("/tmp/should-not-be-written", target);
    await expect(writePrivateManifest(target, {} as S56OperatorManifest)).rejects.toThrow(
      /linked manifest destination/,
    );
  });

  it("refuses a permissive pre-existing manifest destination", async () => {
    await mkdir(S56_SECURE_MANIFEST_ROOT, { mode: 0o700 }).catch(() => undefined);
    await chmod(S56_SECURE_MANIFEST_ROOT, 0o700);
    const target = resolvePrivateManifestPath(`permissive-${process.pid}.json`);
    cleanupPaths.push(target);
    await writeFile(target, "{}", { mode: 0o644 });
    await chmod(target, 0o644);
    await expect(writePrivateManifest(target, {} as S56OperatorManifest)).rejects.toThrow(
      /non-private/,
    );
  });
});

function restoreDrillCrashHarness() {
  const fixture = preDeleteFixture();
  const drill = "s56-restore-drill-proof-20260802";
  const databaseResource = `projects/${S56_PROJECT}/databases/${drill}`;
  const createOperation = `${databaseResource}/operations/create-proof`;
  const deleteOperation = `${databaseResource}/operations/delete-proof`;
  let durableManifest: S56OperatorManifest = {
    operatorVersion: "s56-production-test-retirement-operator:v1",
    project: S56_PROJECT,
    database: S56_DATABASE,
    location: "us-central1",
    readTime: fixture.retirement.countedAt,
    sourceDatabase: {
      uid: "source-proof-uid",
      earliestVersionTime: "2026-08-01T00:00:00Z",
      pitrEnablement: "POINT_IN_TIME_RECOVERY_ENABLED",
      deleteProtectionState: "DELETE_PROTECTION_ENABLED",
      readAt: "2026-08-02T19:40:01Z",
    },
    inventoriedCollections: fixture.retirement.records.map((record) => record.collection),
    retirement: fixture.retirement,
  };
  let failureState: RestoreDrillState["state"] | undefined;
  let readbackUid = "restore-drill-owned-uid";
  let databaseExists = false;
  let deleting = false;
  let documentExists = false;
  let createRequests = 0;
  let acceptedCreates = 0;
  let restoreCommits = 0;
  let deleteRequests = 0;
  let timestampSecond = 0;
  const output: string[] = [];

  const databaseReadback = () => ({
    name: databaseResource,
    uid: readbackUid,
    createTime: "2026-08-02T20:00:01Z",
    locationId: "us-central1",
    type: "FIRESTORE_NATIVE",
    deleteProtectionState: "DELETE_PROTECTION_DISABLED",
    etag: deleting ? "etag-deleting" : "etag-ready",
    ...(deleting ? { deleteTime: "2026-08-02T20:00:04Z" } : {}),
  });

  const client = {
    databaseName: (database = S56_DATABASE) =>
      `projects/${S56_PROJECT}/databases/${database}`,
    batchGetDocuments: async (names: readonly string[]) =>
      names.map((name) => ({ name, fields: fixture.fields })),
    databaseIsAbsent: async () => !databaseExists,
    captureServerReadTime: async () => {
      const value = `2026-08-02T20:00:${String(timestampSecond).padStart(2, "0")}Z`;
      timestampSecond += 1;
      return value;
    },
    createDatabase: async () => {
      createRequests += 1;
      if (databaseExists) return { kind: "already_exists" as const };
      databaseExists = true;
      acceptedCreates += 1;
      return {
        kind: "accepted" as const,
        operation: { name: createOperation },
      };
    },
    getOperation: async (name: string) => {
      if (name !== createOperation) throw new Error("unexpected operation");
      return {
        name,
        done: true,
        response: { name: databaseResource },
      };
    },
    getDatabaseIfPresent: async () => (databaseExists ? databaseReadback() : null),
    getDocumentIfPresent: async (name: string) =>
      documentExists ? { name, fields: fixture.fields } : null,
    commitWrites: async (writes: readonly unknown[]) => {
      if (writes.length !== 1) throw new Error("restore commits must be one write");
      restoreCommits += 1;
      documentExists = true;
      return { commitTime: "2026-08-02T20:00:02Z" };
    },
    getDocument: async (name: string) => ({ name, fields: fixture.fields }),
    deleteDrillDatabase: async () => {
      deleteRequests += 1;
      deleting = true;
      return {
        kind: "accepted" as const,
        operation: { name: deleteOperation },
      };
    },
    getOperationIfPresent: async (name: string) => {
      if (name !== deleteOperation) throw new Error("unexpected cleanup operation");
      databaseExists = false;
      deleting = false;
      return { name, done: true, response: {} };
    },
  } as unknown as FirestoreRestClient;

  const persist = async (next: S56OperatorManifest) => {
    if (next.restoreDrill?.state === failureState) {
      failureState = undefined;
      throw new Error("simulated manifest write loss");
    }
    durableManifest = next;
  };

  return {
    run: () =>
      rehearseProductionTestRestore({
        client,
        retirement: fixture.retirement,
        manifest: durableManifest,
        drill,
        persist,
        sleep: async () => {
          if (deleting) {
            databaseExists = false;
            deleting = false;
          }
        },
        now: () => new Date("2026-08-02T20:00:00.500Z"),
        stdout: (line: string) => output.push(line),
      }),
    failNext: (state: RestoreDrillState["state"]) => {
      failureState = state;
    },
    setReadbackUid: (uid: string) => {
      readbackUid = uid;
    },
    durable: () => durableManifest,
    logs: () => output,
    metrics: () => ({
      createRequests,
      acceptedCreates,
      restoreCommits,
      deleteRequests,
      databaseExists,
      deleting,
    }),
  };
}

function restClient(
  fetchTransport: (url: string, init: RequestInit) => Promise<Response>,
) {
  return new FirestoreRestClient({
    project: S56_PROJECT,
    database: S56_DATABASE,
    accessToken: tokenSentinel,
    fetch: fetchTransport,
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function documentName(collection: string, id: string): string {
  return `projects/${S56_PROJECT}/databases/${S56_DATABASE}/documents/${collection}/${id}`;
}

function testEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

function preDeleteFixture() {
  const fields = { data_mode: { stringValue: "test" } };
  const snapshotTime = "2026-08-02T19:40:00Z";
  const sourceDatabase = `projects/${S56_PROJECT}/databases/${S56_DATABASE}`;
  const cloneDatabase = `projects/${S56_PROJECT}/databases/s56-test-retirement-proof`;
  const record = createProductionTestRecordSnapshot({
    documentName: documentName("maintenance_test_action_receipts", "private-proof-id"),
    collection: "maintenance_test_action_receipts",
    id: "private-proof-id",
    updateTime: "2026-08-02T19:39:30Z",
    fields,
  });
  const cloneUid = "clone-proof-uid";
  const sourceUid = "source-proof-uid";
  const retirement = buildProductionTestRetirementManifest({
    records: [record],
    countedAt: snapshotTime,
    backup: {
      backupRef: productionTestPitrBackupRef(cloneDatabase, snapshotTime),
      sourceDatabase,
      sourceDatabaseUid: sourceUid,
      sourcePitrEnablement: "POINT_IN_TIME_RECOVERY_ENABLED",
      sourceDeleteProtectionState: "DELETE_PROTECTION_ENABLED",
      sourceEarliestVersionTime: "2026-08-01T00:00:00Z",
      snapshotTime,
      verifiedAt: "2026-08-02T19:45:00Z",
      intakeFences: [
        {
          service: "pmi-kc-app",
          revision: "pmi-kc-app-fence-proof",
          trafficPercent: 100,
          deployedAt: "2026-08-02T19:07:07Z",
        },
        {
          service: "pmi-kc-kb-demo",
          revision: "pmi-kc-kb-demo-fence-proof",
          trafficPercent: 100,
          deployedAt: "2026-08-02T19:16:02Z",
        },
      ],
    },
    clone: {
      cloneDatabase,
      sourceDatabase,
      snapshotTime,
      state: "READY",
      operationRef: `${cloneDatabase}/operations/clone-proof`,
      lroDone: true,
      lroMetadata: {
        operationState: "SUCCESSFUL",
        destinationDatabase: cloneDatabase,
        pitrSnapshot: {
          database: sourceDatabase,
          databaseUid: sourceUid,
          snapshotTime,
        },
      },
      lroResponse: { database: cloneDatabase, databaseUid: cloneUid },
      databaseReadback: {
        database: cloneDatabase,
        databaseUid: cloneUid,
        locationId: "us-central1",
        type: "FIRESTORE_NATIVE",
        deleteTime: null,
      },
      verification: "manifest-record-hashes",
      verifiedRecordCount: 1,
      verifiedAggregateHash: productionTestRecordAggregateHash([record]),
      verifiedAt: "2026-08-02T19:45:00Z",
    },
  }) as BackupVerifiedRetirement;
  return { retirement, fields, cloneDatabase, cloneUid };
}

function preDeleteClient(
  fixture: ReturnType<typeof preDeleteFixture>,
  cloneFields: FirestoreRestFields,
): FirestoreRestClient {
  return restClient(async (url) => {
    if (url.includes(":batchGet")) {
      const record = fixture.retirement.records[0];
      const cloneId = fixture.cloneDatabase.split("/").at(-1)!;
      return jsonResponse([
        {
          found: {
            name: `projects/${S56_PROJECT}/databases/${cloneId}/documents/${record.collection}/${record.id}`,
            fields: cloneFields,
          },
        },
      ]);
    }
    return jsonResponse({
      name: fixture.cloneDatabase,
      uid: fixture.cloneUid,
      locationId: "us-central1",
      type: "FIRESTORE_NATIVE",
    });
  });
}

function fenceReadbackTransport(
  primaryRevision = "pmi-kc-app-fence-proof",
): ExecFileTransport {
  const outputs = [
    { status: { traffic: [{ revisionName: primaryRevision, percent: 100 }] } },
    {
      metadata: {
        name: primaryRevision,
        creationTimestamp: "2026-08-02T19:07:07Z",
      },
    },
    {
      status: {
        traffic: [{ revisionName: "pmi-kc-kb-demo-fence-proof", percent: 100 }],
      },
    },
    {
      metadata: {
        name: "pmi-kc-kb-demo-fence-proof",
        creationTimestamp: "2026-08-02T19:16:02Z",
      },
    },
  ];
  return async () => ({ stdout: JSON.stringify(outputs.shift()) });
}
