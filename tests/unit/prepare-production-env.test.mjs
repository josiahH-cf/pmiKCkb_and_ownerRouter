import { describe, expect, it } from "vitest";
import {
  buildProductionEnv,
  parseEnvText,
  serializeProductionEnv,
} from "../../scripts/prepare-production-env.mjs";

const completeSourceEnv = () => ({
  ALLOWED_HD: "pmikcmetro.com",
  ASK_DEMO_MODE: "true",
  FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
  FIRESTORE_DATABASE_ID: "(default)",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  GCP_PROJECT_ID: "pmi-kc-kb-prod",
  GEMINI_MODEL_ANSWER: "gemini-2.5-flash",
  GEMINI_MODEL_CLASSIFY: "gemini-2.5-flash",
  GMAIL_DWD_SA: "gmail-dwd@pmi-kc-kb-prod.iam.gserviceaccount.com",
  GMAIL_PUBSUB_AUDIENCE: "https://kb.pmikcmetro.example/api/gmail-hub/pubsub",
  GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT: "gmail-push@pmi-kc-kb-prod.iam.gserviceaccount.com",
  GMAIL_PUBSUB_TOPIC: "projects/pmi-kc-kb-prod/topics/gmail-inbox",
  LOCAL_DEMO_AUTH: "true",
  LOCAL_MODEL_BASE_URL: "http://127.0.0.1:1234",
  LOCAL_MODEL_NAME: "local-test-model",
  MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "maintenance-drive-folder",
  MODEL_PROVIDER: "local",
  NEXT_PUBLIC_FIREBASE_API_KEY: "public-firebase-key",
  NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "pmi-kc-kb-prod.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
  RENEWAL_SHEET_ID: "renewal-sheet-id",
  RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
  RENTVINE_API_KEY: "must-not-copy",
  RENTVINE_API_SECRET: "must-not-copy",
  SHEETS_DWD_SUBJECT: "josiah@pmikcmetro.com",
  SHEETS_IMPERSONATE_SA: "lease-renewal-reader@pmi-kc-kb-prod.iam.gserviceaccount.com",
  SPACE_DRIVE_FOLDER_IDS: '{"lease-renewals":"gs://prod/lease-renewals/"}',
  SPACE_VERTEX_DATA_STORE_IDS: '{"lease-renewals":"kb-lease-renewals-txt"}',
  VERTEX_AI_LOCATION: "us-central1",
  VERTEX_SEARCH_LOCATION: "us",
});

describe("prepare production env", () => {
  it("copies only production-safe variables and forces production fences", () => {
    const result = buildProductionEnv({
      appBaseUrl: "https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app",
      notificationsEnabled: false,
      serviceAccount: "pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com",
      sourceEnv: completeSourceEnv(),
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.output).toMatchObject({
      APP_BASE_URL: "https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app",
      ASK_DEMO_MODE: "false",
      CLOUD_RUN_SERVICE_ACCOUNT:
        "pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com",
      IMAGE_STORE: "drive",
      GMAIL_DWD_SA: "gmail-dwd@pmi-kc-kb-prod.iam.gserviceaccount.com",
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "false",
      LOCAL_DEMO_AUTH: "false",
      MODEL_PROVIDER: "gemini",
    });
    expect(result.output).not.toHaveProperty("FIRESTORE_EMULATOR_HOST");
    expect(result.output).not.toHaveProperty("LOCAL_MODEL_BASE_URL");
    expect(result.output).not.toHaveProperty("LOCAL_MODEL_NAME");
    expect(result.output).not.toHaveProperty("RENTVINE_API_KEY");
    expect(result.output).not.toHaveProperty("RENTVINE_API_SECRET");
    expect(result.output).not.toHaveProperty("KB_APPROVAL_SENDER");
    expect(result.output).not.toHaveProperty("KB_APPROVAL_RECIPIENTS");
  });

  it("requires sender and recipients only when notifications are explicitly enabled", () => {
    const missing = buildProductionEnv({
      appBaseUrl: "https://kb.pmikcmetro.example",
      notificationsEnabled: true,
      sourceEnv: completeSourceEnv(),
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors).toContain(
      "--approval-sender is required with --notifications-enabled.",
    );
    expect(missing.errors).toContain(
      "--approval-recipients is required with --notifications-enabled.",
    );

    const configured = buildProductionEnv({
      appBaseUrl: "https://kb.pmikcmetro.example",
      approvalRecipients: "dan@pmikcmetro.com,josiah@pmikcmetro.com",
      approvalSender: "kb-automation@pmikcmetro.com",
      notificationsEnabled: true,
      sourceEnv: completeSourceEnv(),
    });
    expect(configured.ok).toBe(true);
    expect(configured.output.KB_APPROVAL_NOTIFICATIONS_ENABLED).toBe("true");
    expect(configured.output.KB_APPROVAL_SENDER).toBe("kb-automation@pmikcmetro.com");
  });

  it("fails closed when the source is missing a required production identifier", () => {
    const sourceEnv = completeSourceEnv();
    delete sourceEnv.RENEWAL_SHEET_ID;
    const result = buildProductionEnv({
      appBaseUrl: "https://kb.pmikcmetro.example",
      sourceEnv,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("RENEWAL_SHEET_ID must be set in the source env.");
  });

  it("parses quoted env values and serializes deterministically", () => {
    const parsed = parseEnvText('A="one two"\nB=three\n# comment\n');
    expect(parsed).toEqual({ A: "one two", B: "three" });
    expect(serializeProductionEnv({ B: "three", A: "one two" })).toContain(
      "A=one two\nB=three\n",
    );
  });
});
