/** October 15 owner direction: operational maintenance is retired; stored evidence is retained. */
export const MAINTENANCE_RETIREMENT_MESSAGE =
  "Custom maintenance is retired. Manage current maintenance in Vendoroo. Existing records remain available as read-only history to authorized staff.";
export const MAINTENANCE_HISTORY_PATH = "/maintenance/history";
export const MAINTENANCE_RETIREMENT_PATH = "/maintenance/retired";

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

/** The proxy applies this before dispatch, including RSC requests and page/server actions. */
export function maintenanceRequestDisposition(method: string, pathname: string) {
  let path: string;
  try {
    path = decodeURIComponent(pathname).replace(/\/+$/, "") || "/";
  } catch {
    return "refuse" as const;
  }
  const read = method === "GET" || method === "HEAD";
  if (
    under(path, "/maintenance") ||
    under(path, "/vendor") ||
    under(path, "/admin/vendors")
  ) {
    if (
      read &&
      (path === MAINTENANCE_HISTORY_PATH || path === MAINTENANCE_RETIREMENT_PATH)
    )
      return "allow" as const;
    return read ? ("notice" as const) : ("refuse" as const);
  }
  if (path === "/api/vendor/auth/session" && method === "DELETE") return "allow" as const;
  if (under(path, "/api/maintenance")) {
    // Exact historical reads only. In particular work-order-chat can mark provider messages read.
    if (
      read &&
      (/^\/api\/maintenance\/tickets(?:\/[^/]+(?:\/(?:history|activity|artifacts|review-context))?)?$/.test(
        path,
      ) ||
        [
          "/api/maintenance/reports",
          "/api/maintenance/intake",
          "/api/maintenance/vendors",
          "/api/maintenance/operating-policies",
          "/api/maintenance/property-preapprovals",
        ].includes(path))
    )
      return "allow" as const;
    return "refuse" as const;
  }
  if (under(path, "/api/vendor") || under(path, "/api/admin/vendors")) {
    if (
      read &&
      /^\/api\/vendor\/tickets(?:\/[^/]+(?:\/(?:work|artifacts))?)?$/.test(path)
    )
      return "allow" as const;
    return "refuse" as const;
  }
  return "allow" as const;
}

export function isRetiredMaintenanceOperation(actionKey: string) {
  return (
    actionKey.startsWith("vendor.") ||
    actionKey.startsWith("gmail.maintenance_") ||
    actionKey.startsWith("google_drive.maintenance_") ||
    (actionKey.startsWith("rentvine.work_order.") &&
      actionKey !== "rentvine.work_order.read") ||
    actionKey.startsWith("leadsimple.maintenance.")
  );
}
