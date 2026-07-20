import { describe, expect, it } from "vitest";
import {
  CHEAP_LIVE_MODEL,
  validateLiveCostConfig,
} from "../../scripts/check-live-cost.mjs";
import {
  buildDemoDeployCommand,
  buildRevisionTrafficCommand,
  createDeployRevisionSuffix,
  executeDemoDeployPlan,
} from "../../scripts/deploy-demo-cloud-run.mjs";
import {
  buildSourceMetaRecord,
  cloudStorageContentDocumentId,
  normalizeDriveFileId,
  parseSourceMetaArgs,
} from "../../scripts/seed-source-meta.mjs";
import {
  buildCreateDataStoreRequest,
  buildImportDocumentsRequest,
} from "../../scripts/import-agent-search-documents.mjs";
import {
  buildDeleteDataStorePlan,
  parseDeleteDataStoreArgs,
} from "../../scripts/delete-agent-search-data-store.mjs";
import {
  buildSourceCorpusReadiness,
  buildSourceCorpusPlan,
  readSourceManifest,
  validateSourceManifest,
} from "../../scripts/source-corpus-manifest.mjs";
import {
  buildLaunchSkeletonRecords,
  launchSkeletonDeleteFieldsFor,
} from "../../scripts/seed-launch-skeletons.mjs";
import { validateProductionCutoverConfig } from "../../scripts/preflight-production-cutover.mjs";
import { buildDemoResetRecords, demoRecords } from "../../scripts/demo-firestore.mjs";

const oneSpaceMap = JSON.stringify({ "lease-renewals": "configured-id" });
const multiSpaceMap = JSON.stringify({
  "lease-renewals": "lease-renewals-value",
  "maintenance-work-order-intake": "maintenance-value",
  "move-out-deposit-disposition": "move-out-value",
  "owner-onboarding": "owner-onboarding-value",
});
const gmailCutoverEnv = (project, appBaseUrl) => ({
  GMAIL_DWD_SA: `gmail-dwd@${project}.iam.gserviceaccount.com`,
  GMAIL_PUBSUB_AUDIENCE: `${appBaseUrl}/api/gmail-hub/pubsub`,
  GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT: `gmail-pubsub-push@${project}.iam.gserviceaccount.com`,
  GMAIL_PUBSUB_TOPIC: `projects/${project}/topics/gmail-workflow-events`,
});
const revisionSuffix = "rm123456789-abcdef123456";
const revision = `pmi-kc-kb-demo-${revisionSuffix}`;

describe("cheap live setup scripts", () => {
  it("accepts the one-Space Flash live config", () => {
    const result = validateLiveCostConfig({
      askDemoMode: false,
      gcpProjectId: "pmikckb-test",
      geminiAnswerModel: CHEAP_LIVE_MODEL,
      spaceDriveFolderIds: { "lease-renewals": "folder-1" },
      spaceVertexDataStoreIds: { "lease-renewals": "data-store-1" },
    });

    expect(result).toEqual({
      errors: [],
      ok: true,
      warnings: [],
    });
  });

  it("rejects demo mode, Pro, and multi-Space live configs by default", () => {
    const result = validateLiveCostConfig({
      askDemoMode: true,
      gcpProjectId: "pmikckb-test",
      geminiAnswerModel: "gemini-2.5-pro",
      spaceDriveFolderIds: {
        "lease-renewals": "folder-1",
        "move-in": "folder-2",
      },
      spaceVertexDataStoreIds: {
        "lease-renewals": "data-store-1",
        "move-in": "data-store-2",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "ASK_DEMO_MODE must be false for live Ask smoke and demo deploy.",
    );
    expect(result.errors).toContain(
      "GEMINI_MODEL_ANSWER must be gemini-2.5-flash; current value is gemini-2.5-pro.",
    );
    expect(result.errors).toContain(
      'SPACE_DRIVE_FOLDER_IDS must contain exactly one entry for "lease-renewals" unless --allow-multiple-spaces is provided.',
    );
  });

  it("normalizes Drive file URLs into source metadata records", () => {
    expect(
      normalizeDriveFileId(
        "https://docs.google.com/document/d/drive-file-1/edit?tab=t.0",
      ),
    ).toBe("drive-file-1");

    expect(
      buildSourceMetaRecord(
        {
          driveFileUrl: "https://drive.google.com/file/d/drive-file-2/view?usp=sharing",
          reviewerUid: "admin-uid",
        },
        "2026-05-28T00:00:00.000Z",
      ),
    ).toEqual({
      approval_status: "Approved",
      drive_file_id: "drive-file-2",
      last_reviewed_at: "2026-05-28T00:00:00.000Z",
      reviewer_uid: "admin-uid",
      sensitivity: "Low",
      space_id: "lease-renewals",
    });
  });

  it("normalizes Cloud Storage object URIs into Agent Search content document IDs", () => {
    const gcsUri =
      "gs://pmikckb-test-lease-renewals-123/lease-renewals/01-lease-renewals-demo-sop-source.txt";

    expect(normalizeDriveFileId(gcsUri)).toBe(cloudStorageContentDocumentId(gcsUri));
    expect(normalizeDriveFileId(gcsUri)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("accepts source IDs as the preferred source metadata CLI argument", () => {
    expect(parseSourceMetaArgs(["--source-id=source-1"])).toMatchObject({
      sourceId: "source-1",
    });
  });

  it("builds a scale-to-zero Cloud Run deploy command after preflight", () => {
    const command = buildDemoDeployCommand({
      argv: ["--budget-confirmed", "--dry-run"],
      env: {
        ASK_DEMO_MODE: "false",
        GCP_PROJECT_ID: "pmikckb-test",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
        NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikckb-test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikckb-test",
        SPACE_DRIVE_FOLDER_IDS: oneSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: oneSpaceMap,
      },
      localEnv: {},
      revisionSuffix,
    });

    expect(command.ok).toBe(true);
    expect(command.args).toContain("--min-instances=0");
    expect(command.args).toContain("--max-instances=1");
    expect(command.args).toContain("--no-invoker-iam-check");
    expect(command.args).toContain(`--revision-suffix=${revisionSuffix}`);
    expect(command.revision).toBe(revision);
    expect(command.args).not.toContain("--allow-unauthenticated");
    expect(command.args).toContain("--memory=512Mi");
    expect(command.args.join(" ")).toContain("ASK_DEMO_MODE=false");
    expect(command.args.join(" ")).toContain("CONSOLE_TEST_DEPLOYMENT_NAME=");
    expect(command.args.join(" ")).toContain(`GEMINI_MODEL_ANSWER=${CHEAP_LIVE_MODEL}`);
    expect(command.args.join(" ")).toContain("VERTEX_SEARCH_LOCATION=us");
    expect(command.args.join(" ")).toContain("LOCAL_DEMO_AUTH=false");
    expect(command.args.join(" ")).toContain("NODE_ENV=production");
    // With no RentVine base URL configured, the deploy does not wire the Secret Manager secrets, so
    // the demo-only deploy path is unchanged (the live-connection secrets are opt-in via RentVine config).
    expect(command.args.some((arg) => arg.startsWith("--set-secrets"))).toBe(false);
  });

  it("allows an explicit gcloud binary override for deploy commands", () => {
    const command = buildDemoDeployCommand({
      argv: ["--budget-confirmed", "--dry-run"],
      env: {
        ASK_DEMO_MODE: "false",
        GCLOUD_BIN: "custom-gcloud",
        GCP_PROJECT_ID: "pmikckb-test",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
        NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikckb-test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikckb-test",
        SPACE_DRIVE_FOLDER_IDS: oneSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: oneSpaceMap,
      },
      localEnv: {},
    });

    expect(command.command).toBe("custom-gcloud");
  });

  it("can preserve an existing invoker configuration when explicitly requested", () => {
    const command = buildDemoDeployCommand({
      argv: ["--budget-confirmed", "--dry-run", "--skip-allow-unauthenticated"],
      env: {
        ASK_DEMO_MODE: "false",
        GCP_PROJECT_ID: "pmikckb-test",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
        NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikckb-test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikckb-test",
        SPACE_DRIVE_FOLDER_IDS: oneSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: oneSpaceMap,
      },
      localEnv: {},
    });

    expect(command.ok).toBe(true);
    expect(command.args).not.toContain("--allow-unauthenticated");
    expect(command.args).not.toContain("--no-invoker-iam-check");
  });

  it("promotes only the exact Cloud Run revision created by the deploy invocation", () => {
    const command = buildRevisionTrafficCommand({
      argv: [
        "--project=pmi-kc-kb-prod",
        "--region=us-central1",
        "--service=pmi-kc-kb-demo",
        "--skip-allow-unauthenticated",
      ],
      env: { GCLOUD_BIN: "custom-gcloud" },
      localEnv: {},
      revision,
    });

    expect(command).toEqual({
      command: "custom-gcloud",
      args: [
        "run",
        "services",
        "update-traffic",
        "pmi-kc-kb-demo",
        "--project=pmi-kc-kb-prod",
        "--region=us-central1",
        `--to-revisions=${revision}=100`,
        "--quiet",
      ],
    });
    expect(command.args.join(" ")).not.toContain("--to-latest");
    expect(command.args).not.toContain("--allow-unauthenticated");
    expect(command.args).not.toContain("--no-invoker-iam-check");
  });

  it("promotes the matching exact revision only after the deploy command succeeds", async () => {
    const calls = [];
    const deploy = {
      command: "gcloud",
      args: ["run", "deploy", "service", `--revision-suffix=${revisionSuffix}`],
    };
    const promote = {
      command: "gcloud",
      args: [
        "run",
        "services",
        "update-traffic",
        "service",
        `--to-revisions=service-${revisionSuffix}=100`,
      ],
    };

    await executeDemoDeployPlan(deploy, promote, async (command, args) => {
      calls.push([command, ...args]);
    });

    expect(calls).toEqual([
      ["gcloud", "run", "deploy", "service", `--revision-suffix=${revisionSuffix}`],
      [
        "gcloud",
        "run",
        "services",
        "update-traffic",
        "service",
        `--to-revisions=service-${revisionSuffix}=100`,
      ],
    ]);
    expect(calls.flat().join(" ")).not.toContain("--to-latest");

    const failedCalls = [];
    await expect(
      executeDemoDeployPlan(deploy, promote, async (command, args) => {
        failedCalls.push([command, ...args]);
        throw new Error("deploy failed");
      }),
    ).rejects.toThrow("deploy failed");
    expect(failedCalls).toEqual([
      ["gcloud", "run", "deploy", "service", `--revision-suffix=${revisionSuffix}`],
    ]);
  });

  it("creates deterministic collision-resistant Cloud Run-valid revision suffixes", () => {
    const first = createDeployRevisionSuffix({
      nowMs: 1_752_595_200_000,
      entropy: "abcdef123456",
    });
    const repeated = createDeployRevisionSuffix({
      nowMs: 1_752_595_200_000,
      entropy: "abcdef123456",
    });
    const concurrent = createDeployRevisionSuffix({
      nowMs: 1_752_595_200_000,
      entropy: "abcdef123457",
    });

    expect(first).toBe(repeated);
    expect(concurrent).not.toBe(first);
    expect(first).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
    expect(`pmi-kc-kb-demo-${first}`.length).toBeLessThanOrEqual(63);
  });

  it("fails preflight when service plus exact revision suffix exceeds Cloud Run's limit", () => {
    const command = buildDemoDeployCommand({
      argv: [
        "--budget-confirmed",
        "--dry-run",
        "--service=this-service-name-is-far-too-long-for-the-required-revision-suffix",
      ],
      env: {
        ASK_DEMO_MODE: "false",
        GCP_PROJECT_ID: "pmikckb-test",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
        NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikckb-test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikckb-test",
        SPACE_DRIVE_FOLDER_IDS: oneSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: oneSpaceMap,
      },
      localEnv: {},
      revisionSuffix,
    });

    expect(command.ok).toBe(false);
    expect(
      command.errors.some((error) =>
        error.includes("Cloud Run revision name must be at most 63 characters"),
      ),
    ).toBe(true);
  });

  it("allows explicit multi-Space Cloud Run deploy commands", () => {
    const command = buildDemoDeployCommand({
      argv: ["--budget-confirmed", "--dry-run", "--allow-multiple-spaces"],
      env: {
        ASK_DEMO_MODE: "false",
        GCP_PROJECT_ID: "pmikckb-test",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
        NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikckb-test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikckb-test",
        SPACE_DRIVE_FOLDER_IDS: multiSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: multiSpaceMap,
      },
      localEnv: {},
    });

    expect(command.ok).toBe(true);
    expect(command.args.join(" ")).toContain("maintenance-work-order-intake");
    expect(command.args.join(" ")).toContain("owner-onboarding");
  });

  it("still requires configured source and data-store maps for multi-Space deploys", () => {
    const result = validateLiveCostConfig(
      {
        askDemoMode: false,
        gcpProjectId: "pmikckb-test",
        geminiAnswerModel: CHEAP_LIVE_MODEL,
        spaceDriveFolderIds: {},
        spaceVertexDataStoreIds: {},
      },
      { allowMultipleSpaces: true },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "SPACE_DRIVE_FOLDER_IDS and SPACE_VERTEX_DATA_STORE_IDS must both contain at least one configured entry.",
    );
  });

  it("blocks deploy commands missing Firebase browser build config", () => {
    const command = buildDemoDeployCommand({
      argv: ["--budget-confirmed", "--dry-run"],
      env: {
        ASK_DEMO_MODE: "false",
        GCP_PROJECT_ID: "pmikckb-test",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        SPACE_DRIVE_FOLDER_IDS: oneSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: oneSpaceMap,
      },
      localEnv: {},
    });

    expect(command.ok).toBe(false);
    expect(command.errors).toContain(
      "NEXT_PUBLIC_FIREBASE_API_KEY must be set for the Cloud Run build.",
    );
  });

  it("fails the deploy when an ambient NEXT_PUBLIC_FIREBASE value differs from .env.local", () => {
    const command = buildDemoDeployCommand({
      argv: ["--budget-confirmed", "--dry-run"],
      env: {
        ASK_DEMO_MODE: "false",
        GCP_PROJECT_ID: "pmi-kc-kb-prod",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "stale-host-project",
        SPACE_DRIVE_FOLDER_IDS: oneSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: oneSpaceMap,
      },
      localEnv: {
        NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
        NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmi-kc-kb-prod.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
      },
    });

    expect(command.ok).toBe(false);
    expect(
      command.errors.some((error) =>
        error.startsWith("NEXT_PUBLIC_FIREBASE_PROJECT_ID mismatch:"),
      ),
    ).toBe(true);
  });

  it("uses .env.local for NEXT_PUBLIC build config over ambient defaults", () => {
    const command = buildDemoDeployCommand({
      argv: ["--budget-confirmed", "--dry-run"],
      env: {
        ASK_DEMO_MODE: "false",
        GCP_PROJECT_ID: "pmi-kc-kb-prod",
        GEMINI_MODEL_ANSWER: CHEAP_LIVE_MODEL,
        SPACE_DRIVE_FOLDER_IDS: oneSpaceMap,
        SPACE_VERTEX_DATA_STORE_IDS: oneSpaceMap,
      },
      localEnv: {
        NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
        NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmi-kc-kb-prod.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
      },
    });

    expect(command.ok).toBe(true);
    const buildFlag = command.args.find((arg) => arg.startsWith("--set-build-env-vars"));
    expect(buildFlag).toContain("NEXT_PUBLIC_FIREBASE_PROJECT_ID=pmi-kc-kb-prod");
  });

  it("builds Agent Search data-store creation and import requests", () => {
    expect(
      buildCreateDataStoreRequest({
        dataStore: "kb-maintenance-work-order-intake-txt",
        displayName: "KB / Maintenance Work Order Intake",
        location: "us",
        project: "pmikckb-test",
      }),
    ).toMatchObject({
      dataStore: {
        contentConfig: "CONTENT_REQUIRED",
        displayName: "KB / Maintenance Work Order Intake",
        industryVertical: "GENERIC",
        solutionTypes: ["SOLUTION_TYPE_SEARCH"],
      },
      dataStoreId: "kb-maintenance-work-order-intake-txt",
      parent: "projects/pmikckb-test/locations/us/collections/default_collection",
    });

    expect(
      buildImportDocumentsRequest({
        dataStore: "kb-maintenance-work-order-intake-txt",
        gcsUris: [
          "gs://pmikckb-test-lease-renewals-686407/maintenance-work-order-intake/01-source.txt",
        ],
        location: "us",
        project: "pmikckb-test",
      }),
    ).toMatchObject({
      forceRefreshContent: true,
      gcsSource: {
        dataSchema: "content",
        inputUris: [
          "gs://pmikckb-test-lease-renewals-686407/maintenance-work-order-intake/01-source.txt",
        ],
      },
      parent:
        "projects/pmikckb-test/locations/us/collections/default_collection/dataStores/kb-maintenance-work-order-intake-txt/branches/default_branch",
      reconciliationMode: "INCREMENTAL",
    });
  });

  it("withholds every source corpus command until all entries are production-ready", () => {
    const entries = validateSourceManifest([
      {
        approval_status: "Transcript-derived",
        data_store_id: "kb-lease-renewals-txt",
        gcs_uri: "gs://bucket/lease-renewals/source-a.txt",
        sensitivity: "Low",
        source_path: "docs/demo-source-templates/lease-renewals-sanitized-call-notes.md",
        space_id: "lease-renewals",
      },
      {
        approval_status: "Approved",
        data_store_id: "kb-lease-renewals-txt",
        gcs_uri: "gs://bucket/lease-renewals/source-b.txt",
        sensitivity: "Low",
        source_path: "docs/demo-source-templates/lease-renewals-demo-sop-source.md",
        space_id: "lease-renewals",
      },
    ]);
    const plan = buildSourceCorpusPlan(entries, "temp/source-corpus");

    expect(plan.entries[0].document_id).toMatch(/^[0-9a-f]{32}$/);
    expect(plan.readiness.ok).toBe(false);
    expect(plan.readiness.blockers).toContain(
      "Manifest entry 0 (lease-renewals) approval_status is Transcript-derived; production import requires Approved source metadata.",
    );
    expect(plan.readiness.counts.approvalStatus).toEqual({
      Approved: 1,
      "Transcript-derived": 1,
    });
    expect(plan.uploadCommands).toEqual([]);
    expect(plan.seedCommands).toEqual([]);
    expect(plan.importCommands).toEqual([]);
  });

  it("parameterizes source corpus import commands for client production", () => {
    const entries = validateSourceManifest([
      {
        approval_status: "Approved",
        data_store_id: "kb-lease-renewals-txt",
        gcs_uri: "gs://pmikc-kb-production-sources/lease-renewals/source-a.txt",
        sensitivity: "Low",
        source_path: "temp/client-production-sources/lease-renewals/source-a.md",
        space_id: "lease-renewals",
      },
    ]);
    const plan = buildSourceCorpusPlan(entries, {
      location: "us",
      project: "pmikc-kb-production",
      tempDir: "temp/source-corpus",
    });

    expect(plan.importCommands[0]).toContain("--project=pmikc-kb-production");
    expect(plan.importCommands[0]).toContain("--location=us");
    expect(plan.importCommands[0]).not.toContain("pmikckb-test");
    expect(plan.readiness.ok).toBe(true);
    expect(plan.readiness.blockers).toEqual([]);
  });

  it("validates the client-production source manifest template shape", () => {
    const entries = readSourceManifest(
      "docs/source-corpus/client-production-source-manifest.template.json",
    );

    expect(entries).toHaveLength(11);
    expect(entries.map((entry) => entry.space_id)).toContain("move-in");
    expect(entries.map((entry) => entry.space_id)).not.toContain("owner-email");
    expect(entries.every((entry) => entry.approval_status === "Unreviewed")).toBe(true);
    expect(entries.every((entry) => entry.gcs_uri.startsWith("gs://"))).toBe(true);

    const plan = buildSourceCorpusPlan(entries, {
      location: "us",
      project: "pmikc-kb-production",
      tempDir: "temp/source-corpus",
    });

    expect(plan.readiness.ok).toBe(false);
    expect(plan.readiness.counts.entries).toBe(11);
    expect(plan.readiness.blockers).toContain(
      "Manifest entry 0 (lease-renewals) gcs_uri must be replaced with a real production value.",
    );
    expect(plan.readiness.blockers).toContain(
      "Manifest entry 0 (lease-renewals) approval_status is Unreviewed; production import requires Approved source metadata.",
    );
    expect(plan.uploadCommands).toEqual([]);
    expect(plan.importCommands).toEqual([]);
    expect(plan.seedCommands).toEqual([]);
  });

  it.each([
    ["space_id", "lease-renewals;Write-Output-INJECTED"],
    ["data_store_id", "kb-renewals;Write-Output-INJECTED"],
    ["source_path", 'docs/source.md";Write-Output-INJECTED'],
    ["gcs_uri", "gs://safe-bucket/source.txt;Write-Output-INJECTED"],
  ])("rejects shell-unsafe source manifest field %s", (fieldName, value) => {
    const entry = {
      approval_status: "Approved",
      data_store_id: "kb-lease-renewals-txt",
      gcs_uri: "gs://safe-bucket/lease-renewals/source.txt",
      sensitivity: "Low",
      source_path: "docs/source.md",
      space_id: "lease-renewals",
      [fieldName]: value,
    };

    expect(() => validateSourceManifest([entry])).toThrow(
      `Manifest entry 0 ${fieldName}`,
    );
  });

  it.each([
    ["project", "safe-project;Write-Output-INJECTED"],
    ["location", "us;Write-Output-INJECTED"],
    ["tempDir", 'temp/source";Write-Output-INJECTED'],
  ])("rejects shell-unsafe source corpus option %s", (fieldName, value) => {
    const entries = validateSourceManifest([
      {
        approval_status: "Approved",
        data_store_id: "kb-lease-renewals-txt",
        gcs_uri: "gs://safe-bucket/lease-renewals/source.txt",
        sensitivity: "Low",
        source_path: "docs/source.md",
        space_id: "lease-renewals",
      },
    ]);
    const options = {
      location: "us",
      project: "safe-project",
      tempDir: "temp/source-corpus",
      [fieldName]: value,
    };

    expect(() => buildSourceCorpusPlan(entries, options)).toThrow(
      fieldName === "tempDir" ? "tempDir" : fieldName,
    );
  });

  it("flags unsafe source corpus manifest entries before import", () => {
    const entries = validateSourceManifest([
      {
        approval_status: "Approved",
        data_store_id: "kb-lease-renewals-txt",
        gcs_uri: "gs://pmikc-kb-production-sources/lease-renewals/source-a.txt",
        sensitivity: "High",
        source_path: "docs/context_and_calls/raw-call-notes.md",
        space_id: "lease-renewals",
      },
      {
        approval_status: "Approved",
        data_store_id: "kb-lease-renewals-txt",
        gcs_uri: "gs://pmikc-kb-production-sources/lease-renewals/source-a.txt",
        sensitivity: "Low",
        source_path: "temp/client-production-sources/lease-renewals/source-b.md",
        space_id: "lease-renewals",
      },
    ]);
    const readiness = buildSourceCorpusReadiness(entries);

    expect(readiness.ok).toBe(false);
    expect(readiness.blockers).toContain(
      "Manifest entry 0 (lease-renewals) is High sensitivity and must not be imported for retrieval.",
    );
    expect(readiness.blockers).toContain(
      "Manifest entry 0 (lease-renewals) source_path points at raw context/call material; use an approved client-safe summary instead.",
    );
    expect(readiness.blockers).toContain(
      "Duplicate gcs_uri in manifest: gs://pmikc-kb-production-sources/lease-renewals/source-a.txt.",
    );
    expect(
      readiness.blockers.some((blocker) =>
        blocker.startsWith("Duplicate derived document_id"),
      ),
    ).toBe(true);
  });

  it("rejects demo-shaped production cutover configuration", () => {
    const result = validateProductionCutoverConfig({
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "http://localhost:3000",
      ASK_DEMO_MODE: "true",
      CONSOLE_TEST_DEPLOYMENT_NAME: "test-staging-1",
      FIREBASE_PROJECT_ID: "pmikckb-test",
      GCP_PROJECT_ID: "pmikckb-test",
      LOCAL_DEMO_AUTH: "true",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikckb-test.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikckb-test",
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://pmikckb-test-lease-renewals-686407/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "kb-lease-renewals-txt",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "GCP_PROJECT_ID must not point at demo project pmikckb-test.",
    );
    expect(result.errors).toContain("ASK_DEMO_MODE must be false for client-production.");
    expect(result.errors).toContain(
      "CONSOLE_TEST_DEPLOYMENT_NAME must be empty for client-production.",
    );
    expect(result.errors).toContain(
      "LOCAL_DEMO_AUTH must be false for client-production.",
    );
    expect(result.errors).toContain(
      "APP_BASE_URL must be the deployed production URL, not localhost.",
    );
    expect(result.errors).toContain(
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must not reference demo resource pmikckb-test.firebaseapp.com.",
    );
    expect(result.errors).toContain(
      "SPACE_DRIVE_FOLDER_IDS.lease-renewals must not reference demo resource gs://pmikckb-test-lease-renewals-686407/lease-renewals/.",
    );
  });

  it("rejects mismatched production Firebase project IDs", () => {
    const result = validateProductionCutoverConfig({
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "https://kb.pmikcmetro.example",
      ASK_DEMO_MODE: "false",
      FIREBASE_PROJECT_ID: "pmikc-kb-firebase",
      GCP_PROJECT_ID: "pmikc-kb-production",
      LOCAL_DEMO_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikc-kb-firebase.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikc-kb-public",
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://pmikc-kb-production-sources/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "kb-lease-renewals-txt",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "GCP_PROJECT_ID and FIREBASE_PROJECT_ID must match for cutover.",
    );
    expect(result.errors).toContain(
      "FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID must match for cutover.",
    );
  });

  it("rejects unreplaced production cutover placeholders", () => {
    const result = validateProductionCutoverConfig({
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "<deployed-production-url>",
      ASK_DEMO_MODE: "false",
      FIREBASE_PROJECT_ID: "pmikc-kb-production",
      GCP_PROJECT_ID: "pmikc-kb-production",
      LOCAL_DEMO_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "<from-client-firebase-web-app>",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "<client-project-id>.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikc-kb-production",
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://<client-source-bucket>/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "<kb-lease-renewals-data-store>",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("APP_BASE_URL must be a valid URL.");
    expect(result.errors).toContain(
      "APP_BASE_URL must be replaced with a real production value.",
    );
    expect(result.errors).toContain(
      "NEXT_PUBLIC_FIREBASE_APP_ID must be replaced with a real production value.",
    );
    expect(result.errors).toContain(
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be replaced with a real production value.",
    );
    expect(result.errors).toContain(
      "SPACE_DRIVE_FOLDER_IDS.lease-renewals must be replaced with a real production value.",
    );
    expect(result.errors).toContain(
      "SPACE_VERTEX_DATA_STORE_IDS.lease-renewals must be replaced with a real production value.",
    );
  });

  it("accepts a complete client-production preflight configuration", () => {
    const result = validateProductionCutoverConfig({
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "https://kb.pmikcmetro.example",
      ASK_DEMO_MODE: "false",
      FIREBASE_PROJECT_ID: "pmikc-kb-production",
      GCP_PROJECT_ID: "pmikc-kb-production",
      LOCAL_DEMO_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikc-kb-production.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikc-kb-production",
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "true",
      KB_APPROVAL_RECIPIENTS: "dan@pmikcmetro.com,josiah-pmi-kc-account@pmikcmetro.com",
      KB_APPROVAL_SENDER: "kb-automation@pmikcmetro.com",
      MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "drive-folder-maintenance-photos",
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENEWAL_SHEET_ID: "prod-renewal-sheet-id",
      SHEETS_IMPERSONATE_SA:
        "kb-sheets-reader@pmikc-kb-production.iam.gserviceaccount.com",
      SHEETS_DWD_SUBJECT: "kb-reader@pmikcmetro.com",
      ...gmailCutoverEnv("pmikc-kb-production", "https://kb.pmikcmetro.example"),
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://pmikc-kb-production-sources/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "kb-lease-renewals-txt",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts the verified production service's historical demo name", () => {
    const result = validateProductionCutoverConfig({
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app",
      ASK_DEMO_MODE: "false",
      FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
      GCP_PROJECT_ID: "pmi-kc-kb-prod",
      LOCAL_DEMO_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmi-kc-kb-prod.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "false",
      MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "drive-folder-maintenance-photos",
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENEWAL_SHEET_ID: "prod-renewal-sheet-id",
      SHEETS_IMPERSONATE_SA:
        "lease-renewal-reader@pmi-kc-kb-prod.iam.gserviceaccount.com",
      SHEETS_DWD_SUBJECT: "josiah@pmikcmetro.com",
      ...gmailCutoverEnv(
        "pmi-kc-kb-prod",
        "https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app",
      ),
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://pmi-kc-kb-prod-sources/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "kb-lease-renewals-txt",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      "KB approval email notifications remain disabled. App-plane production deployment is allowed, but notification delivery is not part of this cutover.",
    );
  });

  it("rejects legacy cherrybridge.ai references in production config", () => {
    const result = validateProductionCutoverConfig({
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "https://kb.cherrybridge.ai",
      ASK_DEMO_MODE: "false",
      FIREBASE_PROJECT_ID: "pmikc-kb-production",
      GCP_PROJECT_ID: "pmikc-kb-production",
      LOCAL_DEMO_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikc-kb-production.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikc-kb-production",
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "true",
      KB_APPROVAL_RECIPIENTS: "dan@pmikcmetro.com",
      KB_APPROVAL_SENDER: "kb-automation@pmikcmetro.com",
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://pmikc-kb-production-sources/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "kb-lease-renewals-txt",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "APP_BASE_URL must not reference demo resource https://kb.cherrybridge.ai.",
    );
  });

  it("rejects a non-service-account or cross-project runtime identity", () => {
    const base = {
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "https://kb.pmikcmetro.example",
      ASK_DEMO_MODE: "false",
      MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "drive-folder-maintenance-photos",
      FIREBASE_PROJECT_ID: "pmikc-kb-production",
      GCP_PROJECT_ID: "pmikc-kb-production",
      LOCAL_DEMO_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikc-kb-production.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikc-kb-production",
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "true",
      KB_APPROVAL_RECIPIENTS: "dan@pmikcmetro.com",
      KB_APPROVAL_SENDER: "kb-automation@pmikcmetro.com",
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENEWAL_SHEET_ID: "prod-renewal-sheet-id",
      SHEETS_IMPERSONATE_SA:
        "kb-sheets-reader@pmikc-kb-production.iam.gserviceaccount.com",
      SHEETS_DWD_SUBJECT: "kb-reader@pmikcmetro.com",
      ...gmailCutoverEnv("pmikc-kb-production", "https://kb.pmikcmetro.example"),
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://pmikc-kb-production-sources/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "kb-lease-renewals-txt",
      }),
    };

    const userAccount = validateProductionCutoverConfig({
      ...base,
      CLOUD_RUN_SERVICE_ACCOUNT: "josiah.abernathy@gmail.com",
    });
    expect(userAccount.ok).toBe(false);
    expect(userAccount.errors).toContain(
      "CLOUD_RUN_SERVICE_ACCOUNT must be a GCP service account, not a user account.",
    );

    const crossProject = validateProductionCutoverConfig({
      ...base,
      CLOUD_RUN_SERVICE_ACCOUNT:
        "pmi-kc-kb-runtime@other-project.iam.gserviceaccount.com",
    });
    expect(crossProject.ok).toBe(false);
    expect(crossProject.errors).toContain(
      "CLOUD_RUN_SERVICE_ACCOUNT must belong to pmikc-kb-production; got project other-project.",
    );

    const validSa = validateProductionCutoverConfig({
      ...base,
      CLOUD_RUN_SERVICE_ACCOUNT:
        "pmi-kc-kb-runtime@pmikc-kb-production.iam.gserviceaccount.com",
    });
    expect(validSa.ok).toBe(true);
    expect(validSa.errors).toEqual([]);
  });

  it("requires pmikcmetro.com sender and recipients when notifications are enabled", () => {
    const result = validateProductionCutoverConfig({
      ALLOWED_HD: "pmikcmetro.com",
      APP_BASE_URL: "https://kb.pmikcmetro.example",
      ASK_DEMO_MODE: "false",
      FIREBASE_PROJECT_ID: "pmikc-kb-production",
      GCP_PROJECT_ID: "pmikc-kb-production",
      LOCAL_DEMO_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmikc-kb-production.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmikc-kb-production",
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "true",
      KB_APPROVAL_RECIPIENTS: "outside-user@example.com",
      KB_APPROVAL_SENDER: "kb-automation@example.com",
      MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "drive-folder-maintenance-photos",
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENEWAL_SHEET_ID: "prod-renewal-sheet-id",
      SHEETS_IMPERSONATE_SA:
        "kb-sheets-reader@pmikc-kb-production.iam.gserviceaccount.com",
      SHEETS_DWD_SUBJECT: "kb-reader@pmikcmetro.com",
      SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
        "lease-renewals": "gs://pmikc-kb-production-sources/lease-renewals/",
      }),
      SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
        "lease-renewals": "kb-lease-renewals-txt",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "KB_APPROVAL_SENDER must use only pmikcmetro.com email addresses.",
    );
    expect(result.errors).toContain(
      "KB_APPROVAL_RECIPIENTS must use only pmikcmetro.com email addresses.",
    );
  });

  it("guards Agent Search data-store deletion against active Space maps", () => {
    const args = parseDeleteDataStoreArgs(
      ["--project=pmikckb-test", "--location=us", "--data-store=kb-unused-store"],
      {},
      {
        SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
          "lease-renewals": "kb-lease-renewals-txt",
        }),
      },
    );

    expect(buildDeleteDataStorePlan(args)).toMatchObject({
      name: "projects/pmikckb-test/locations/us/collections/default_collection/dataStores/kb-unused-store",
    });
    expect(() =>
      buildDeleteDataStorePlan({
        ...args,
        dataStore: "kb-lease-renewals-txt",
      }),
    ).toThrow(/Refusing to delete active data store/);
  });

  it("builds source-backed launch skeleton records for the remaining launch Spaces", () => {
    const records = buildLaunchSkeletonRecords("2026-05-29T00:00:00.000Z");

    // 7 launch definitions × (sop + template + placeholder) = 21, plus the 4 F-TMPL-2/F-TMPL-6 process
    // copy seeds (3 reply patterns + 1 welcome email).
    expect(records).toHaveLength(25);
    expect(records.map((record) => record.data.space_id)).toContain("move-in");
    expect(records.find((record) => record.id === "launch-move-in-sop")).toMatchObject({
      collection: "sops",
      data: {
        source_state_hint: "Open Placeholder",
        status: "Placeholder",
      },
    });
    expect(records.find((record) => record.id === "tpl-vendor-ack")).toMatchObject({
      collection: "templates",
      data: { space_id: "daily-inbox-triage", status: "Approved" },
    });
    expect(launchSkeletonDeleteFieldsFor("sops")).toContain("last_reviewed_at");
    expect(launchSkeletonDeleteFieldsFor("templates")).toContain("approved_by_uid");
    expect(launchSkeletonDeleteFieldsFor("placeholders")).toContain("resolution");
  });

  it("defines resettable demo records for all four approved workflow Spaces", () => {
    const spaceIds = new Set(
      demoRecords.flatMap((record) =>
        record.data.space_id ? [record.data.space_id] : [],
      ),
    );

    expect(spaceIds).toEqual(
      new Set([
        "lease-renewals",
        "maintenance-work-order-intake",
        "move-out-deposit-disposition",
        "owner-onboarding",
      ]),
    );
    expect(demoRecords.filter((record) => record.collection === "sops")).toHaveLength(4);
    expect(
      demoRecords.filter((record) => record.collection === "placeholders"),
    ).toHaveLength(4);
    expect(
      demoRecords.filter((record) => record.collection === "approval_queue_items"),
    ).toHaveLength(4);
    expect(
      demoRecords.filter((record) => record.collection === "approval_queue_activity"),
    ).toHaveLength(4);
  });

  it("keeps queue demo Activity append-style and out of generic change logs", () => {
    const queueRecords = demoRecords.filter((record) =>
      record.collection.startsWith("approval_queue_"),
    );
    const activityRecords = demoRecords.filter(
      (record) => record.collection === "approval_queue_activity",
    );

    expect(queueRecords).toHaveLength(8);
    expect(queueRecords.every((record) => record.writeChangeLog === false)).toBe(true);
    expect(activityRecords.every((record) => record.includeUpdatedAt === false)).toBe(
      true,
    );
    expect(
      activityRecords.every((record) => record.deleteFields.includes("updated_at")),
    ).toBe(true);
  });

  it("keeps launch skeleton records out of default demo resets", () => {
    const defaultReset = buildDemoResetRecords("2026-06-02T00:00:00.000Z");
    const resetWithSkeletons = buildDemoResetRecords("2026-06-02T00:00:00.000Z", {
      includeLaunchSkeletons: true,
    });

    expect(defaultReset).toHaveLength(demoRecords.length);
    expect(defaultReset.map((record) => record.id)).not.toContain("launch-move-in-sop");
    expect(resetWithSkeletons.map((record) => record.id)).toContain("launch-move-in-sop");
  });
});
