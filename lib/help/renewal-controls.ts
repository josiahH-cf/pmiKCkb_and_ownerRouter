// S243 R-S243-7: the renewal step-to-control map, consolidated from the retired operator guide into
// the hub. The rehearsal guide-control smoke (scripts/smoke-renewal-guide-controls-browser.mjs), the
// S132 walkthrough checks and the S115/S120 tests read these rows, so the semantic guide steps keep
// their exact roles, scopes and availability. The renewal screen references list the same rows.
import controlMap from "@/lib/help/content/renewal-control-map.json";
import type { HelpControlRole, HelpScreenControl } from "@/lib/help/types";
import type { SectionHelpId } from "@/lib/lease-renewal/section-help";

export interface RenewalControlMapRow {
  readonly step: string;
  /** `/lease-renewal`, `/connections`, `/` or `workspace:<renewal step>`. */
  readonly page: string;
  readonly control: string;
  readonly role: HelpControlRole;
  readonly scope: string;
  readonly availability: "required" | "conditional";
  readonly expectation: string;
  readonly source: readonly string[];
  readonly sourceText?: string;
  readonly aboutId?: SectionHelpId;
  /** A control only an Admin sees; the screen reference and the browser check read it as Admin. */
  readonly who?: "Admin";
}

export const RENEWAL_CONTROL_MAP = controlMap as readonly RenewalControlMapRow[];

const WORKSPACE_ROUTE = "/lease-renewal/live/desk/lease/[leaseId]";

/** The route a map row's page lives on. */
export function renewalControlRoute(row: RenewalControlMapRow): string {
  if (row.page.startsWith("workspace:")) return WORKSPACE_ROUTE;
  if (row.page === "/lease-renewal") return "/lease-renewal/live/desk";
  return row.page;
}

/** Map rows as screen reference controls, for the screens whose route the rows live on. */
export function renewalControlMapScreenControls(route: string): HelpScreenControl[] {
  return RENEWAL_CONTROL_MAP.filter((row) => renewalControlRoute(row) === route).map(
    (row) => ({
      label: row.control,
      role: row.role,
      ...(row.scope ? { region: row.scope } : {}),
      availability: row.availability,
      source: row.source,
      ...(row.sourceText ? { sourceText: row.sourceText } : {}),
      ...(row.aboutId ? { aboutId: row.aboutId } : {}),
      does: row.expectation,
      who: row.who ?? (row.page === "/connections" ? "Admin" : "Renewal staff"),
      route,
      ...(route === WORKSPACE_ROUTE && row.page.startsWith("workspace:")
        ? { actions: ["click-button:Full view"] }
        : {}),
    }),
  );
}
