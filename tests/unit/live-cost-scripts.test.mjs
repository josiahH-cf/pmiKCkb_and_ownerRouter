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

const oneSpaceMap = JSON.stringify({ "lease-renewals": "configured-id" });

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
    expect(command.args).toContain("--memory=512Mi");
    expect(command.args.join(" ")).toContain("ASK_DEMO_MODE=false");
    expect(command.args.join(" ")).toContain(`GEMINI_MODEL_ANSWER=${CHEAP_LIVE_MODEL}`);
    expect(command.args.join(" ")).toContain("VERTEX_SEARCH_LOCATION=us");
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
});
