import { z } from "zod";
import { ALLOWED_HD_DEFAULT, KB_APPROVAL_LABEL } from "@/lib/constants";

const JsonMapSchema = z
  .string()
  .trim()
  .default("{}")
  .transform((value, context) => {
    try {
      const parsed = JSON.parse(value || "{}") as unknown;

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.values(parsed).some((entry) => typeof entry !== "string")
      ) {
        context.addIssue({
          code: "custom",
          message: "Expected a JSON object with string values.",
        });
        return z.NEVER;
      }

      return parsed as Record<string, string>;
    } catch {
      context.addIssue({
        code: "custom",
        message: "Expected valid JSON.",
      });
      return z.NEVER;
    }
  });

const OptionalStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();
const OptionalCsvSchema = z
  .string()
  .trim()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const EnvSchema = z.object({
  ALLOWED_HD: z.string().trim().min(1).default(ALLOWED_HD_DEFAULT),
  APP_BASE_URL: OptionalStringSchema,
  ASK_DEMO_MODE: z
    .string()
    .trim()
    .toLowerCase()
    .default("true")
    .transform((value) => value !== "false" && value !== "0"),
  AUTH_SESSION_COOKIE: z.string().trim().min(1).default("__session"),
  FIREBASE_PROJECT_ID: OptionalStringSchema,
  FIRESTORE_DATABASE_ID: z.string().trim().min(1).default("(default)"),
  GCP_PROJECT_ID: OptionalStringSchema,
  GEMINI_MODEL_ANSWER: z.string().trim().min(1).default("gemini-2.5-pro"),
  GEMINI_MODEL_CLASSIFY: z.string().trim().min(1).default("gemini-2.5-flash"),
  GROUNDING_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65),
  KB_APPROVAL_LABEL: z.string().trim().min(1).default(KB_APPROVAL_LABEL),
  KB_APPROVAL_NOTIFICATIONS_ENABLED: z
    .string()
    .trim()
    .toLowerCase()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  KB_APPROVAL_RECIPIENTS: OptionalCsvSchema,
  KB_APPROVAL_SENDER: OptionalStringSchema,
  LOCAL_DEMO_AUTH: z
    .string()
    .trim()
    .toLowerCase()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  LOCAL_MODEL_BASE_URL: OptionalStringSchema,
  LOCAL_MODEL_NAME: z.string().trim().min(1).default("local-model"),
  MODEL_PROVIDER: z.enum(["gemini", "local"]).default("gemini"),
  NEXT_PUBLIC_FIREBASE_API_KEY: OptionalStringSchema,
  NEXT_PUBLIC_FIREBASE_APP_ID: OptionalStringSchema,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: OptionalStringSchema,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: OptionalStringSchema,
  // Speech-to-text for maintenance voice capture. "stub" is the free dev/test stand-in; prod is forced
  // to "google" (Google Cloud Speech-to-Text) below, mirroring MODEL_PROVIDER.
  SPEECH_PROVIDER: z.enum(["google", "stub"]).default("stub"),
  SPEECH_LANGUAGE_CODE: z.string().trim().min(2).default("en-US"),
  // Maintenance photo storage. "stub" is the free dev/test stand-in; prod is forced to "drive"
  // (Google Drive in-boundary) below.
  IMAGE_STORE: z.enum(["drive", "stub"]).default("stub"),
  // Drive folder the maintenance photo store uploads INTO (a write target — a real Drive folder id,
  // NOT a gs:// corpus prefix). Kept separate from SPACE_DRIVE_FOLDER_IDS, which is the per-Space
  // KB-source location cross-linked 1:1 with a Vertex data store; one Space key cannot hold both a
  // KB-source prefix and a photo folder. Falls back to the legacy
  // SPACE_DRIVE_FOLDER_IDS["maintenance-work-order-intake"] for back-compat.
  MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: OptionalStringSchema,
  SPACE_DRIVE_FOLDER_IDS: JsonMapSchema,
  SPACE_VERTEX_DATA_STORE_IDS: JsonMapSchema,
  VERTEX_AI_LOCATION: z.string().trim().min(1).default("us-central1"),
  VERTEX_SEARCH_LOCATION: z.enum(["global", "us", "eu"]).default("us"),
});

export type ServerConfig = ReturnType<typeof readServerConfig>;
type Environment = Record<string, string | undefined>;

export function readServerConfig(env: Environment = process.env) {
  const parsed = EnvSchema.parse(env);

  return {
    allowedHostedDomain: parsed.ALLOWED_HD.toLowerCase(),
    appBaseUrl: parsed.APP_BASE_URL,
    askDemoMode: parsed.ASK_DEMO_MODE,
    authSessionCookie: parsed.AUTH_SESSION_COOKIE,
    firebaseProjectId: parsed.FIREBASE_PROJECT_ID,
    firestoreDatabaseId: parsed.FIRESTORE_DATABASE_ID,
    gcpProjectId: parsed.GCP_PROJECT_ID,
    geminiAnswerModel: parsed.GEMINI_MODEL_ANSWER,
    geminiClassifyModel: parsed.GEMINI_MODEL_CLASSIFY,
    groundingConfidenceThreshold: parsed.GROUNDING_CONFIDENCE_THRESHOLD,
    kbApprovalLabel: parsed.KB_APPROVAL_LABEL,
    kbApprovalNotificationsEnabled: parsed.KB_APPROVAL_NOTIFICATIONS_ENABLED,
    kbApprovalRecipients: parsed.KB_APPROVAL_RECIPIENTS,
    kbApprovalSender: parsed.KB_APPROVAL_SENDER,
    localDemoAuth: parsed.LOCAL_DEMO_AUTH && process.env.NODE_ENV !== "production",
    localModelBaseUrl: parsed.LOCAL_MODEL_BASE_URL,
    localModelName: parsed.LOCAL_MODEL_NAME,
    // The local provider is dev/test-only; force Gemini in production (mirrors localDemoAuth).
    modelProvider:
      process.env.NODE_ENV === "production" ? "gemini" : parsed.MODEL_PROVIDER,
    // The stub STT is dev/test-only (free); force Google Cloud Speech-to-Text in production.
    speechProvider:
      process.env.NODE_ENV === "production" ? "google" : parsed.SPEECH_PROVIDER,
    speechLanguageCode: parsed.SPEECH_LANGUAGE_CODE,
    // The stub image store is dev/test-only (free); force Google Drive in-boundary in production.
    imageStore: process.env.NODE_ENV === "production" ? "drive" : parsed.IMAGE_STORE,
    // Prefer the dedicated photo-folder var; fall back to the legacy SPACE_DRIVE_FOLDER_IDS key.
    // Absent → "" (the Drive store treats falsy as "no folder configured" and fails closed).
    maintenanceImageFolderId:
      parsed.MAINTENANCE_PHOTO_DRIVE_FOLDER_ID ??
      parsed.SPACE_DRIVE_FOLDER_IDS["maintenance-work-order-intake"] ??
      "",
    spaceDriveFolderIds: parsed.SPACE_DRIVE_FOLDER_IDS,
    spaceVertexDataStoreIds: parsed.SPACE_VERTEX_DATA_STORE_IDS,
    vertexAiLocation: parsed.VERTEX_AI_LOCATION,
    vertexSearchLocation: parsed.VERTEX_SEARCH_LOCATION,
    firebaseBrowserConfig: {
      apiKey: parsed.NEXT_PUBLIC_FIREBASE_API_KEY,
      appId: parsed.NEXT_PUBLIC_FIREBASE_APP_ID,
      authDomain: parsed.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: parsed.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
  };
}

export function readRequiredGoogleConfig(env: Environment = process.env) {
  const config = readServerConfig(env);
  const missing = [
    ["GCP_PROJECT_ID", config.gcpProjectId],
    ["FIREBASE_PROJECT_ID", config.firebaseProjectId],
    ["NEXT_PUBLIC_FIREBASE_API_KEY", config.firebaseBrowserConfig.apiKey],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", config.firebaseBrowserConfig.authDomain],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", config.firebaseBrowserConfig.projectId],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", config.firebaseBrowserConfig.appId],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required Google setup values: ${missing.map(([name]) => name).join(", ")}`,
    );
  }

  return config;
}
