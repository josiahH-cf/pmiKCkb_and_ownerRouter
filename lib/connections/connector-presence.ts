// Server-side presence read for the Connection Center. Reads ONLY whether each connector env var is
// set (a boolean), never its value — values never leave the server or reach the UI. A blank or empty
// JSON-map ("{}") counts as not provided.

import { CONNECTORS } from "@/lib/connections/connector-catalog";

export function readConnectorPresence(
  env: Record<string, string | undefined> = process.env,
): Record<string, boolean> {
  const names = new Set<string>();
  for (const connector of CONNECTORS) {
    for (const name of connector.requiredConfig) names.add(name);
  }

  const presence: Record<string, boolean> = {};
  for (const name of names) {
    const value = env[name]?.trim();
    presence[name] = value !== undefined && value !== "" && value !== "{}";
  }
  return presence;
}
