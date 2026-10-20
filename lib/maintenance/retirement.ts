/** October 20 owner direction: retire the complete component; do not purge retained evidence. */
export const MAINTENANCE_RETIREMENT_MESSAGE =
  "Custom maintenance is retired. Manage maintenance in standalone Vendoroo.";
export const MAINTENANCE_RETIREMENT_PATH = "/lease-renewal";

/** Exact current and legacy identifiers, independent of labels or stored lifecycle status. */
export function isRetiredMaintenanceWorkflow(spaceId?: string, definitionId?: string) {
  return (
    [
      "maintenance",
      "maintenance-work-order-intake",
      "vendor-assignment-handoff",
    ].includes(spaceId ?? "") || definitionId === "maintenance-work-order-intake"
  );
}
function under(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}
/** Runs before page/server-action/API dispatch; even historical reads cannot initialize providers. */
export function maintenanceRequestDisposition(method: string, pathname: string) {
  let path: string;
  try {
    path = decodeURIComponent(pathname).replace(/\/+$/, "") || "/";
  } catch {
    return "refuse" as const;
  }
  if (
    under(path, "/maintenance") ||
    under(path, "/vendor") ||
    under(path, "/admin/vendors")
  )
    return method === "GET" || method === "HEAD"
      ? ("notice" as const)
      : ("refuse" as const);
  // A genuine existing-session logout remains possible; it grants no vendor access.
  if (path === "/api/vendor/auth/session" && method === "DELETE") return "allow" as const;
  if (
    under(path, "/api/maintenance") ||
    under(path, "/api/vendor") ||
    under(path, "/api/admin/vendors")
  )
    return "refuse" as const;
  return "allow" as const;
}
export function isRetiredMaintenanceOperation(actionKey: string) {
  return (
    actionKey.startsWith("vendor.") ||
    actionKey.startsWith("gmail.maintenance_") ||
    actionKey.startsWith("google_drive.maintenance_") ||
    actionKey.startsWith("rentvine.work_order.") ||
    actionKey.startsWith("leadsimple.maintenance.")
  );
}
