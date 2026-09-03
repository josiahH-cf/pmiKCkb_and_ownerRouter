import { loadEnvConfig } from "@next/env";
import { GoogleAuth } from "google-auth-library";

import {
  ASSURANCE_RUN_TIMEOUT_MS,
  assuranceAbortSignal,
  remainingAssuranceTime,
  withAssuranceTimeout,
} from "../lib/production-assurance";

const PRODUCTION_PROJECT = "pmi-kc-kb-prod";
const VERIFIED_ASSURANCE_CONTEXT = Symbol("verified-production-assurance-context");

export type AuthenticatedAssuranceClient = Awaited<ReturnType<GoogleAuth["getClient"]>>;

export interface AssuranceAuth {
  getCredentials(): Promise<{ readonly client_email?: string | null }>;
  getClient(): Promise<AuthenticatedAssuranceClient>;
}

export interface VerifiedProductionAssuranceContext {
  readonly project: string;
  readonly client: AuthenticatedAssuranceClient;
  readonly [VERIFIED_ASSURANCE_CONTEXT]: true;
}

export interface ProductionAssurancePreflightInput {
  readonly project: string;
  readonly deadlineAtMs: number;
  readonly abortSignal?: AbortSignal;
}

export interface ProductionAssurancePreflightDependencies {
  readonly env?: NodeJS.ProcessEnv;
  readonly loadEnvironment?: () => void;
  readonly createAuth?: () => AssuranceAuth;
  /** Identity read transport (tests inject a fake); defaults to global fetch. */
  readonly fetch?: typeof fetch;
}

/**
 * Read the signed-in user's email from the OpenID userinfo endpoint with ONLY the bearer token.
 * google-auth-library adds `x-goog-user-project` from the ADC quota project to every
 * `client.request`, and the userinfo endpoint rejects that header with a serviceusage permission
 * error even for a project Owner. The bearer token alone is sufficient and value-free here; the
 * token never leaves this call and is never logged.
 */
async function readUserInfoEmail(
  client: AuthenticatedAssuranceClient,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const accessToken = await client.getAccessToken();
  const token = accessToken?.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("assurance_adc_identity_invalid");
  }
  const response = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error("assurance_adc_identity_invalid");
  const payload = (await response.json()) as { readonly email?: unknown };
  return typeof payload.email === "string" ? payload.email : undefined;
}

export function assertLiveAssuranceEnvironment(
  project: string,
  env: NodeJS.ProcessEnv,
): void {
  if (project !== PRODUCTION_PROJECT) throw new Error("assurance_project_mismatch");
  if (env.ENVIRONMENT_KIND !== "production" || env.DATA_CONTEXT !== "live") {
    throw new Error("assurance_live_environment_required");
  }
  if (
    typeof env.GOOGLE_APPLICATION_CREDENTIALS === "string" &&
    env.GOOGLE_APPLICATION_CREDENTIALS.trim() !== ""
  ) {
    throw new Error("assurance_key_file_forbidden");
  }
  if (
    Object.entries(env).some(
      ([name, value]) =>
        name.endsWith("_EMULATOR_HOST") &&
        typeof value === "string" &&
        value.trim() !== "",
    )
  ) {
    throw new Error("assurance_emulator_forbidden");
  }
  for (const name of [
    "GCLOUD_PROJECT",
    "GOOGLE_CLOUD_PROJECT",
    "GCP_PROJECT_ID",
    "FIREBASE_PROJECT_ID",
  ]) {
    const value = env[name]?.trim();
    if (value && value !== project) throw new Error("assurance_project_mismatch");
  }
  for (const name of [
    "FIRESTORE_DATABASE",
    "FIRESTORE_DATABASE_ID",
    "GOOGLE_CLOUD_FIRESTORE_DATABASE_ID",
  ]) {
    const value = env[name]?.trim();
    if (value && value !== "(default)") {
      throw new Error("assurance_database_mismatch");
    }
  }
  const firebaseConfig = env.FIREBASE_CONFIG?.trim();
  if (firebaseConfig) {
    try {
      const parsed = JSON.parse(firebaseConfig) as { projectId?: unknown };
      if (parsed.projectId !== project) {
        throw new Error("assurance_project_mismatch");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "assurance_project_mismatch") {
        throw error;
      }
      throw new Error("assurance_project_mismatch");
    }
  }
}

export function assertAssuranceAdcIdentity(
  email: unknown,
  project: string,
): asserts email is string {
  if (typeof email !== "string") throw new Error("assurance_adc_identity_invalid");
  const normalized = email.trim().toLowerCase();
  const managedUser = /^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i.test(normalized);
  const projectServiceIdentity = new RegExp(
    `^[a-z][a-z0-9-]{0,62}@${project.replaceAll("-", "\\-")}\\.iam\\.gserviceaccount\\.com$`,
  ).test(normalized);
  if (!managedUser && !projectServiceIdentity) {
    throw new Error("assurance_adc_identity_invalid");
  }
}

/**
 * Refuse the process environment and actual ADC principal before an aggregate assurance run may
 * make a version, control-plane, browser, Firestore, Sheet, or RentVine read. The returned client
 * is the same verified ADC client used by every nested control-plane gate.
 */
export async function preflightProductionAssurance(
  input: ProductionAssurancePreflightInput,
  dependencies: ProductionAssurancePreflightDependencies = {},
): Promise<VerifiedProductionAssuranceContext> {
  (dependencies.loadEnvironment ?? (() => loadEnvConfig(process.cwd())))();
  const env = dependencies.env ?? process.env;
  assertLiveAssuranceEnvironment(input.project, env);

  const auth =
    dependencies.createAuth?.() ??
    (new GoogleAuth({
      projectId: input.project,
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform.read-only",
        "https://www.googleapis.com/auth/monitoring.read",
        "https://www.googleapis.com/auth/logging.read",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    }) as unknown as AssuranceAuth);
  const credentials = await withAssuranceTimeout(
    () => auth.getCredentials(),
    "assurance_identity_deadline_exceeded",
    remainingAssuranceTime(input.deadlineAtMs, ASSURANCE_RUN_TIMEOUT_MS),
  );
  let email = credentials.client_email;

  // A service-account credential declares its identity before a client is created. Reject a
  // foreign key here so even a control-plane client cannot be constructed from that principal.
  if (email) assertAssuranceAdcIdentity(email, input.project);

  const client = await withAssuranceTimeout(
    () => auth.getClient(),
    "assurance_identity_deadline_exceeded",
    remainingAssuranceTime(input.deadlineAtMs, ASSURANCE_RUN_TIMEOUT_MS),
  );
  if (!email) {
    const signal = assuranceAbortSignal(
      remainingAssuranceTime(input.deadlineAtMs),
      input.abortSignal,
    );
    email = await withAssuranceTimeout(
      () =>
        typeof (client as { getAccessToken?: unknown }).getAccessToken === "function"
          ? readUserInfoEmail(client, dependencies.fetch ?? fetch, signal)
          : client
              .request<{ readonly email?: unknown }>({
                method: "GET",
                url: "https://openidconnect.googleapis.com/v1/userinfo",
                signal,
              })
              .then((response) =>
                typeof response.data.email === "string" ? response.data.email : undefined,
              ),
      "assurance_identity_deadline_exceeded",
      remainingAssuranceTime(input.deadlineAtMs, ASSURANCE_RUN_TIMEOUT_MS),
    );
    assertAssuranceAdcIdentity(email, input.project);
  }

  return {
    project: input.project,
    client,
    [VERIFIED_ASSURANCE_CONTEXT]: true,
  };
}

export function verifiedAssuranceClient(
  context: VerifiedProductionAssuranceContext,
  project: string,
): AuthenticatedAssuranceClient {
  if (context?.[VERIFIED_ASSURANCE_CONTEXT] !== true || context.project !== project) {
    throw new Error("assurance_preflight_context_invalid");
  }
  return context.client;
}
