import { GoogleAuth } from "google-auth-library";
import { safeProviderFailure } from "./provider-errors.mjs";
export { safeProviderFailure } from "./provider-errors.mjs";

const PROJECT = "pmi-kc-kb-prod";
const SERVICE = `projects/${PROJECT}/locations/us-central1/services/pmi-kc-app`;
const INTEGRATION_ACCOUNT = "integrations@pmikcmetro.com";

export function canonicalRevisionName(service) {
  if (!Array.isArray(service.trafficStatuses))
    throw new Error("canonical_revision_unresolved");
  const serving = service.trafficStatuses.filter((row) => row.percent > 0);
  if (serving.length !== 1 || serving[0].percent !== 100)
    throw new Error("canonical_revision_unresolved");
  const revision = serving[0].revision;
  if (typeof revision !== "string") throw new Error("canonical_revision_unresolved");
  if (
    revision.startsWith(`${SERVICE}/revisions/`) &&
    /^[a-z0-9-]+$/.test(revision.slice(`${SERVICE}/revisions/`.length))
  )
    return revision;
  if (/^pmi-kc-app-[a-z0-9-]+$/.test(revision)) return `${SERVICE}/revisions/${revision}`;
  throw new Error("canonical_revision_unresolved");
}

/** Existing provider grants only. No paid lookup, generation, customer record, document or message write. */
export async function verifyProviderHealth({
  checkOnly = false,
  emit = () => {},
  configRoot,
  localRentvineProbe,
} = {}) {
  const checks = [];
  const probe = async (service, fn) => {
    emit(`provider ${service}: checking`);
    try {
      const value = await fn();
      checks.push({ service, ...value });
    } catch (error) {
      checks.push({ service, ...safeProviderFailure(error) });
    }
    const item = checks.at(-1);
    emit(
      `provider ${service}: ${item.state}${item.code ? ` (${item.code})` : ""} — ${item.detail}`,
    );
  };
  await probe("local_rentvine", async () => {
    const { checkLocalRentVine } = await import("./local-rentvine-health.mjs");
    return (localRentvineProbe ?? checkLocalRentVine)({ configRoot });
  });
  const source = await new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  }).getClient();
  const get = async (url) =>
    (await source.request({ url, method: "GET", timeout: 30_000, retry: false })).data;
  let env, secret, descriptor;
  let configuredNames = new Set();
  await probe("serving_configuration", async () => {
    const service = await get(`https://run.googleapis.com/v2/${SERVICE}`);
    const revision = await get(
      `https://run.googleapis.com/v2/${canonicalRevisionName(service)}`,
    );
    const entries = revision.containers?.[0]?.env ?? [];
    configuredNames = new Set(
      entries
        .filter((entry) =>
          typeof entry.value === "string"
            ? entry.value.trim() !== ""
            : Boolean(
                entry.valueSource?.secretKeyRef?.secret &&
                entry.valueSource?.secretKeyRef?.version,
              ),
        )
        .map((entry) => entry.name),
    );
    env = Object.fromEntries(
      entries
        .filter((entry) => typeof entry.value === "string")
        .map((entry) => [entry.name, entry.value]),
    );
    const { requireEnvironmentDescriptor } =
      await import("../../lib/environment/descriptor.ts");
    descriptor = requireEnvironmentDescriptor(env);
    if (
      descriptor.environmentKind !== "production" ||
      descriptor.dataContext !== "live" ||
      descriptor.source !== "explicit"
    )
      throw new Error("serving_environment_not_production_live");
    secret = async (name) => {
      const entry = entries.find((item) => item.name === name);
      if (typeof entry?.value === "string") return entry.value;
      const ref = entry?.valueSource?.secretKeyRef;
      if (!ref?.secret || !ref.version)
        throw new Error("configured_secret_reference_missing");
      const nameOfSecret = ref.secret.startsWith("projects/")
        ? ref.secret
        : `projects/${PROJECT}/secrets/${encodeURIComponent(ref.secret)}`;
      if (!nameOfSecret.startsWith(`projects/${PROJECT}/secrets/`))
        throw new Error("secret_project_mismatch");
      const value = await get(
        `https://secretmanager.googleapis.com/v1/${nameOfSecret}/versions/${encodeURIComponent(ref.version)}:access`,
      );
      return Buffer.from(value.payload.data, "base64").toString("utf8");
    };
    return {
      state: "ok",
      detail:
        "Current canonical serving revision and its configured credential references were read. No configuration was changed.",
    };
  });
  if (!env || !secret)
    return {
      state: "blocked",
      checks,
      detail:
        "Provider readiness cannot be established without the current serving configuration.",
    };

  await probe("rentvine", async () => {
    const { RentVineClient, createFetchTransport, assertRentVineAccount } =
      await import("../../lib/integrations/rentvine/client.ts");
    assertRentVineAccount(env.RENTVINE_API_BASE_URL, "pmikcmetro");
    const client = new RentVineClient(
      {
        baseUrl: env.RENTVINE_API_BASE_URL,
        apiKey: await secret("RENTVINE_API_KEY"),
        apiSecret: await secret("RENTVINE_API_SECRET"),
      },
      createFetchTransport({ timeoutMs: 15_000 }),
    );
    const rows = await client.listLeaseStatuses();
    return {
      state: "ok",
      detail: `Authenticated read of the existing account's lease-status metadata passed (${rows.length} statuses). No lease values or writes were used.`,
    };
  });
  const approvedDwd = () => {
    if (env.SHEETS_DWD_SUBJECT?.toLowerCase() !== INTEGRATION_ACCOUNT)
      throw new Error("unexpected_delegated_identity");
    return { serviceAccount: env.SHEETS_IMPERSONATE_SA, subject: INTEGRATION_ACCOUNT };
  };
  await probe("sheets", async () => {
    const { GoogleSheetsApiReader } =
      await import("../../lib/google-sheets/read-client.ts");
    const identity = approvedDwd();
    const tabs = await new GoogleSheetsApiReader(
      identity.serviceAccount,
      identity.subject,
      AbortSignal.timeout(45_000),
    ).listTabTitles(env.RENEWAL_SHEET_ID);
    return {
      state: "ok",
      detail: `Existing delegated operating Sheet metadata read passed (${tabs.length} tabs); no cell values were changed.`,
    };
  });
  await probe("drive", async () => {
    const { GoogleDriveClient } = await import("../../lib/google-drive/drive-dwd.ts");
    await new GoogleDriveClient({
      ...approvedDwd(),
      fetchImpl: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }),
    }).findFolder("PMI KC");
    return {
      state: "ok",
      detail:
        "Existing delegated drive.file grant passed a read-only folder lookup. This does not prove every source file is accessible.",
    };
  });
  await probe("gmail", async () => {
    const { checkGmailHealth } = await import("./gmail-health.mjs");
    approvedDwd();
    return checkGmailHealth({
      source,
      serviceAccount: env.GMAIL_DWD_SA || env.SHEETS_IMPERSONATE_SA,
      subject: INTEGRATION_ACCOUNT,
      emit,
    });
  });
  await probe("vertex_search", async () => {
    const map = JSON.parse(env.SPACE_VERTEX_DATA_STORE_IDS ?? "{}");
    const ids = [...new Set(Object.values(map))];
    if (
      !ids.length ||
      ids.length > 20 ||
      ids.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id))
    )
      throw new Error("invalid_configured_store_map");
    const { v1beta } = await import("@google-cloud/discoveryengine");
    const location = env.VERTEX_SEARCH_LOCATION ?? "us";
    if (!["us", "eu", "global"].includes(location))
      throw new Error("unsupported_search_location");
    const client = new v1beta.DataStoreServiceClient({
      apiEndpoint:
        location === "global"
          ? "discoveryengine.googleapis.com"
          : `${location}-discoveryengine.googleapis.com`,
    });
    try {
      for (const id of ids)
        await client.getDataStore(
          {
            name: `projects/${PROJECT}/locations/${location}/collections/default_collection/dataStores/${id}`,
          },
          { timeout: 15_000 },
        );
    } finally {
      await client.close();
    }
    return {
      state: "ok",
      detail: `Read access to ${ids.length} configured search-store metadata resources passed. No paid search or model generation was run.`,
    };
  });
  await probe("dotloop", async () => {
    const { initializeApp, applicationDefault, deleteApp } =
      await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const { FirestoreConnectorConnectionStore } =
      await import("../../lib/firestore/connector-connections.ts");
    const { SecretManagerConnectorSecretVault } =
      await import("../../lib/connections/secret-manager-connector-vault.ts");
    const { DotloopRuntimeTokenProvider, dotloopRuntimeTransport } =
      await import("../../lib/connections/dotloop-runtime.ts");
    const { DotloopClient } = await import("../../lib/integrations/dotloop/client.ts");
    const { readDotloopOAuthConfig } =
      await import("../../lib/connections/dotloop-oauth.ts");
    const app = initializeApp(
      { credential: applicationDefault(), projectId: PROJECT },
      `pmi-auth-provider-${process.pid}`,
    );
    try {
      const store = new FirestoreConnectorConnectionStore(
        getFirestore(app, env.FIRESTORE_DATABASE_ID || "(default)"),
      );
      emit("provider dotloop: reading existing connection metadata");
      const connection = await store.getConnection("dotloop");
      if (connection?.refreshOutcomeUncertain)
        return {
          state: "blocked",
          code: "dotloop_refresh_outcome_uncertain",
          detail:
            "A previous credential refresh has an uncertain outcome. Reconcile its existing operation before reconnecting or retrying; this command requested neither.",
        };
      if (
        connection?.status !== "connected" ||
        connection.oauthState === "refresh_needed"
      )
        return {
          state: "blocked",
          code: "dotloop_reconnect_required",
          detail:
            "The existing Dotloop connection needs its attended Admin reconnect flow. No new authorization was started.",
        };
      if (
        checkOnly &&
        (!connection.tokenExpiresAt ||
          Date.parse(connection.tokenExpiresAt) <= Date.now() ||
          connection.oauthState === "refreshing")
      )
        return {
          state: "conditional",
          code: "dotloop_refresh_required",
          detail:
            "Stored access metadata is expired or another refresh is in progress. Run this command without --check for its normal existing-grant refresh; metadata alone does not prove revocation.",
        };
      if (env.CONNECTOR_SECRET_VAULT_PROJECT_ID !== PROJECT)
        throw new Error("dotloop_vault_binding_mismatch");
      const configEnv = {
        ...env,
        DOTLOOP_OAUTH_CLIENT_SECRET: await secret("DOTLOOP_OAUTH_CLIENT_SECRET"),
      };
      const config = readDotloopOAuthConfig(configEnv);
      if (!config.configured) throw new Error("dotloop_configuration_incomplete");
      const vault = new SecretManagerConnectorSecretVault({
        projectId: PROJECT,
        descriptor,
        // Reuse the already verified client, including its in-memory access-token cache. Creating
        // a new GoogleAuth client for every vault read/cleanup unnecessarily re-mints ADC tokens.
        request: async (input) => {
          const response = await source.request({
            ...input,
            timeout: 10_000,
            retry: false,
            validateStatus: () => true,
          });
          return { status: response.status, data: response.data };
        },
      });
      const tokens = new DotloopRuntimeTokenProvider({
        store,
        vault,
        config: config.config,
        descriptor,
        transport: dotloopRuntimeTransport,
      });
      // --check never refreshes or rewrites existing credential metadata, even after provider 401.
      const readTokens = checkOnly
        ? {
            accessToken: async () => {
              const result = await vault.readSecret({ secretRef: connection.secretRef });
              if (!result.ok) throw new Error("secure_storage_unavailable");
              return result.secret;
            },
            refresh: async () => null,
          }
        : tokens;
      emit(
        "provider dotloop: validating the approved provider account with its existing grant",
      );
      const account = await new DotloopClient({
        tokens: readTokens,
        transport: dotloopRuntimeTransport,
      }).getAccount();
      if (account.email?.toLowerCase() !== INTEGRATION_ACCOUNT)
        return {
          state: "blocked",
          code: "wrong_provider_identity",
          detail:
            "Dotloop does not report the approved integration account. No grant or account was changed.",
        };
      return {
        state: "ok",
        detail:
          "Existing Dotloop OAuth grant passed the exact account read; default mode may refresh and persist only that existing grant. This command does not change business-write gates or request business writes.",
      };
    } finally {
      await deleteApp(app);
    }
  });
  const rentcastConfigured = configuredNames.has("RENTCAST_API_KEY");
  const rentcastSelected = env.MARKET_COMP_PROVIDER === "rentcast";
  checks.push({
    service: "rentcast",
    state: rentcastConfigured
      ? "not_tested"
      : rentcastSelected
        ? "blocked"
        : "not_required",
    configured: rentcastConfigured,
    ...(!rentcastConfigured && rentcastSelected ? { code: "rentcast_key_missing" } : {}),
    detail: rentcastConfigured
      ? "Configured binding only; no paid lookup or new grant was used as an authentication test."
      : rentcastSelected
        ? "RentCast is selected but its credential binding is missing. No lookup or credential creation was attempted."
        : "Manual comps is selected and no RentCast binding is configured; no paid lookup was made.",
  });
  const state = checks.some((item) => item.state === "blocked")
    ? "blocked"
    : checks.some((item) => item.state === "conditional")
      ? "conditional"
      : "verified_with_exceptions";
  return {
    state,
    checks,
    detail:
      "Provider states reflect the stated safe reads. RentCast and AI generation remain untested; ordinary auth cannot guarantee every resource or business capability.",
  };
}
