// Connector catalog for the Connection Center (Phase-2 UI). Pure metadata — what each connector is,
// what process work it powers, how it connects, and which health-check contract verifies it. No I/O,
// no secret values. `requiredConfig` lists env var NAMES whose PRESENCE (never value) tells us the
// connection details have been provided; the names are never rendered to the user.

export type ConnectMethod = "oauth" | "api_key" | "google";

export interface ConnectorDef {
  id: string;
  name: string;
  /** One line: what this connection powers, in the operator's terms. */
  powers: string;
  method: ConnectMethod;
  /** Health-check contract id (lib/integrations/health-checks.ts) — what PMI verifies on connect. */
  healthCheckRef?: string;
  /** Env var NAMES checked for PRESENCE only (never value, never rendered). */
  requiredConfig: string[];
}

export const CONNECTORS: readonly ConnectorDef[] = [
  {
    id: "rentvine",
    name: "RentVine",
    powers: "Leases, tenants, and rent.",
    method: "api_key",
    healthCheckRef: "health.rentvine.api_key",
    requiredConfig: ["RENTVINE_API_BASE_URL", "RENTVINE_API_KEY", "RENTVINE_API_SECRET"],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    powers:
      "Your renewal tracking sheet. The app reads it and flags anything that doesn't match RentVine.",
    method: "google",
    healthCheckRef: "health.google_sheets.api",
    requiredConfig: ["RENEWAL_SHEET_ID"],
  },
  {
    id: "google_drive",
    name: "Google Drive",
    powers: "Approved templates and the documents the app cites in answers.",
    method: "google",
    requiredConfig: ["SPACE_DRIVE_FOLDER_IDS"],
  },
  {
    id: "dotloop",
    name: "Dotloop",
    powers: "Lease document build-out and e-signature.",
    method: "oauth",
    healthCheckRef: "health.dotloop.oauth_app",
    requiredConfig: [],
  },
  {
    id: "leadsimple",
    name: "LeadSimple",
    powers: "The renewal pipeline stages and follow-up tasks.",
    method: "api_key",
    healthCheckRef: "health.leadsimple.rest_api",
    requiredConfig: [],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    powers: "Owner statements and accounting.",
    method: "oauth",
    healthCheckRef: "health.quickbooks.oauth_app",
    requiredConfig: [],
  },
];

const METHOD_BADGE: Record<ConnectMethod, string> = {
  google: "Google",
  oauth: "OAuth",
  api_key: "API key",
};

/** Short badge for how a connector authenticates. */
export function connectorMethodBadge(method: ConnectMethod): string {
  return METHOD_BADGE[method];
}

/** The primary connect call-to-action label for a connector's method. */
export function connectorConnectLabel(def: ConnectorDef): string {
  if (def.method === "google") return "Sign in with Google";
  if (def.method === "oauth") return `Connect with ${def.name}`;
  return "Add your API key";
}
