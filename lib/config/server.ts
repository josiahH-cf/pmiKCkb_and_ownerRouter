import { z } from "zod";
import { ALLOWED_HD_DEFAULT, KB_APPROVAL_LABEL } from "@/lib/constants";
import { resolveConsoleDataMode } from "@/lib/console/environment";

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
  // Renewal comp-screenshot storage (S28a). Reuses the maintenance Drive image-store seam with its OWN
  // folder id so the comp screenshot lands in a distinct in-boundary folder; absent → the store fails
  // closed (no folder configured), same as the maintenance photo folder.
  RENEWAL_COMP_DRIVE_FOLDER_ID: OptionalStringSchema,
  // Market-comp provider (S28a). "manual" reproduces today's operator-typed behavior with no network
  // call (the default, works with no owner step); "rentcast" selects the licensed rental-listings-search
  // adapter, which the comps route additionally gates on rentcast.rental_listings.search until flipped.
  MARKET_COMP_PROVIDER: z.enum(["manual", "rentcast"]).default("manual"),
  // RentCast rental-listings-search API key (S28b). Read only from env/Secret Manager; absent → the
  // RentCast adapter fails closed. Never in git; .env.example names it with no value.
  RENTCAST_API_KEY: OptionalStringSchema,
  // Public tokenized maintenance intake (A5). The HMAC signing secret for intake links; ABSENT by
  // default so the public route fails CLOSED (503) until the owner provisions it in Secret Manager —
  // there is no dev fallback secret (a checked-in default would be a forgeable token). The salt hashes
  // reporter IPs so the rate-counter key is opaque; absent → no per-IP key (the per-property global cap
  // still applies). The daily cap is the per-property 503 kill-ceiling (owner budget safety).
  MAINTENANCE_INTAKE_TOKEN_SECRET: OptionalStringSchema,
  MAINTENANCE_INTAKE_IP_HASH_SALT: OptionalStringSchema,
  // F-MAINT-3 (owner ruling): 50/property/day, with a tighter cap for reusable signage links.
  MAINTENANCE_INTAKE_DAILY_CAP: z.coerce.number().int().positive().default(50),
  // The tighter per-property/day ceiling for reusable (signage) links, which do not burn a nonce, so one
  // posted signage link cannot flood a property's triage queue. Clamped to <= the daily cap at enforcement.
  MAINTENANCE_INTAKE_SIGNAGE_DAILY_CAP: z.coerce.number().int().positive().default(15),
  SPACE_DRIVE_FOLDER_IDS: JsonMapSchema,
  SPACE_VERTEX_DATA_STORE_IDS: JsonMapSchema,
  VERTEX_AI_LOCATION: z.string().trim().min(1).default("us-central1"),
  VERTEX_SEARCH_LOCATION: z.enum(["global", "us", "eu"]).default("us"),
});

export type ServerConfig = ReturnType<typeof readServerConfig>;
type Environment = Record<string, string | undefined>;

const FRIENDLY_MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-1.5-pro": "Gemini 1.5 Pro",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
};

/**
 * Map a raw model id (GEMINI_MODEL_ANSWER) to a client-facing label for the Ask transparency line.
 * Known ids map exactly; an unknown id is title-cased segment-by-segment ("gemini-3.0-ultra" →
 * "Gemini 3.0 Ultra") so a new model still reads cleanly. Pure + deterministic.
 */
/** True when the model id is in the known-good label map (S32 model-config transparency panel). */
export function isKnownGoodModel(modelId: string): boolean {
  return Boolean(FRIENDLY_MODEL_LABELS[modelId.trim()]);
}

export function friendlyModelLabel(modelId: string): string {
  const id = modelId.trim();
  if (FRIENDLY_MODEL_LABELS[id]) return FRIENDLY_MODEL_LABELS[id];
  return id
    .split(/[-_]/)
    .filter((seg) => seg !== "")
    .map((seg) =>
      seg === "gemini"
        ? "Gemini"
        : /^\d/.test(seg)
          ? seg
          : seg.charAt(0).toUpperCase() + seg.slice(1),
    )
    .join(" ");
}

export function readServerConfig(env: Environment = process.env) {
  const parsed = EnvSchema.parse(env);
  const isProduction = (env.NODE_ENV ?? process.env.NODE_ENV) === "production";
  const consoleDataMode = resolveConsoleDataMode(env);
  const localDemoAuth = parsed.LOCAL_DEMO_AUTH && !isProduction;

  return {
    allowedHostedDomain: parsed.ALLOWED_HD.toLowerCase(),
    appBaseUrl: parsed.APP_BASE_URL,
    askDemoMode: parsed.ASK_DEMO_MODE && consoleDataMode.kind === "test",
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
    localDemoAuth,
    localModelBaseUrl: parsed.LOCAL_MODEL_BASE_URL,
    localModelName: parsed.LOCAL_MODEL_NAME,
    // The local provider is dev/test-only; force Gemini in production (mirrors localDemoAuth).
    modelProvider: isProduction ? "gemini" : parsed.MODEL_PROVIDER,
    // The stub STT is dev/test-only (free); force Google Cloud Speech-to-Text in production.
    speechProvider: isProduction ? "google" : parsed.SPEECH_PROVIDER,
    speechLanguageCode: parsed.SPEECH_LANGUAGE_CODE,
    // The stub image store is dev/test-only (free); force Google Drive in-boundary in production.
    imageStore: isProduction ? "drive" : localDemoAuth ? "stub" : parsed.IMAGE_STORE,
    // Prefer the dedicated photo-folder var; fall back to the legacy SPACE_DRIVE_FOLDER_IDS key.
    // Absent → "" (the Drive store treats falsy as "no folder configured" and fails closed).
    maintenanceImageFolderId:
      parsed.MAINTENANCE_PHOTO_DRIVE_FOLDER_ID ??
      parsed.SPACE_DRIVE_FOLDER_IDS["maintenance-work-order-intake"] ??
      "",
    // The renewal comp-screenshot Drive folder (S28a). Absent → "" so the reused Drive store fails closed.
    renewalCompImageFolderId: parsed.RENEWAL_COMP_DRIVE_FOLDER_ID ?? "",
    // Market-comp provider selection (S28a). Default "manual"; "rentcast" is additionally gate-fenced in
    // the comps route (rentcast.rental_listings.search) so a config flip alone cannot make a live call.
    marketCompProvider: parsed.MARKET_COMP_PROVIDER,
    // RentCast API key (S28b); undefined until provisioned in Secret Manager. The adapter fails closed.
    rentcastApiKey: parsed.RENTCAST_API_KEY,
    // Public tokenized maintenance intake (A5). Secret undefined ⇒ the public route fails closed (503).
    maintenanceIntakeTokenSecret: parsed.MAINTENANCE_INTAKE_TOKEN_SECRET,
    maintenanceIntakeIpHashSalt: parsed.MAINTENANCE_INTAKE_IP_HASH_SALT,
    maintenanceIntakeDailyCap: parsed.MAINTENANCE_INTAKE_DAILY_CAP,
    maintenanceIntakeSignageDailyCap: parsed.MAINTENANCE_INTAKE_SIGNAGE_DAILY_CAP,
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
