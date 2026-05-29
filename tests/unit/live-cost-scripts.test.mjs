import { describe, expect, it } from "vitest";
import {
  CHEAP_LIVE_MODEL,
  validateLiveCostConfig,
} from "../../scripts/check-live-cost.mjs";
import { buildDemoDeployCommand } from "../../scripts/deploy-demo-cloud-run.mjs";
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
import { demoRecords } from "../../scripts/demo-firestore.mjs";

const oneSpaceMap = JSON.stringify({ "lease-renewals": "configured-id" });
const multiSpaceMap = JSON.stringify({
  "lease-renewals": "lease-renewals-value",
  "maintenance-work-order-intake": "maintenance-value",
  "move-out-deposit-disposition": "move-out-value",
  "owner-onboarding": "owner-onboarding-value",
});

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
    });

    expect(command.ok).toBe(true);
    expect(command.args).toContain("--min-instances=0");
    expect(command.args).toContain("--max-instances=1");
    expect(command.args).toContain("--allow-unauthenticated");
    expect(command.args).toContain("--memory=512Mi");
    expect(command.args.join(" ")).toContain("ASK_DEMO_MODE=false");
    expect(command.args.join(" ")).toContain(`GEMINI_MODEL_ANSWER=${CHEAP_LIVE_MODEL}`);
    expect(command.args.join(" ")).toContain("VERTEX_SEARCH_LOCATION=us");
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

  it("can skip unauthenticated invoker binding when org policy blocks allUsers", () => {
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
  });
});
