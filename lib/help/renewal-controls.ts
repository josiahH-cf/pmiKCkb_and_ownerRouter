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
  /**
   * S252: browser-check preparation on the page before the control is located, in the scene
   * action form (for example `click-link:All leases and filters` for a desk row that lives in the
   * full lease table rather than the working batch).
   */
  readonly actions?: readonly string[];
  /**
   * S252 L54, the one rename field: the exact role and accessible name this row had in an earlier
   * control map, when the interface renamed the control. A row keeps its step id across a rename.
   */
  readonly formerly?: { readonly control: string; readonly role: HelpControlRole };
}

export const RENEWAL_CONTROL_MAP = controlMap as readonly RenewalControlMapRow[];

/** A starting-commit control map row as the S252 continuity check reads it (names only). */
export interface RenewalControlMapStartingRow {
  readonly step: string;
  readonly page: string;
  readonly control: string;
  readonly role: string;
}

export interface RenewalControlMapContinuityRow {
  readonly step: string;
  readonly page: string;
  readonly was: string;
  readonly now: string | null;
  readonly state: "kept" | "renamed" | "gone" | "unrecorded";
}

/**
 * S252 L54: every row of an earlier control map is still in the current map under its step id,
 * with the same role and accessible name or with a `formerly` record naming exactly that earlier
 * role and name. A missing step, or a different name with no record, is a problem.
 */
export function renewalControlMapContinuity(
  earlier: readonly RenewalControlMapStartingRow[],
  current: readonly RenewalControlMapRow[],
): { rows: RenewalControlMapContinuityRow[]; problems: string[] } {
  const byStep = new Map(current.map((row) => [row.step, row]));
  const rows: RenewalControlMapContinuityRow[] = [];
  const problems: string[] = [];
  for (const old of earlier) {
    const row = byStep.get(old.step);
    const was = `${old.role} "${old.control}" on ${old.page}`;
    if (!row) {
      rows.push({ step: old.step, page: old.page, was: old.control, now: null, state: "gone" });
      problems.push(
        `Starting control map row ${old.step} (${was}) is gone from the current map.`,
      );
      continue;
    }
    if (row.control === old.control && row.role === old.role) {
      rows.push({
        step: old.step,
        page: row.page,
        was: old.control,
        now: row.control,
        state: "kept",
      });
      continue;
    }
    if (row.formerly?.control === old.control && row.formerly.role === old.role) {
      rows.push({
        step: old.step,
        page: row.page,
        was: old.control,
        now: row.control,
        state: "renamed",
      });
      continue;
    }
    rows.push({
      step: old.step,
      page: row.page,
      was: old.control,
      now: row.control,
      state: "unrecorded",
    });
    problems.push(
      `Starting control map row ${old.step} (${was}) is now ${row.role} "${row.control}" with no recorded former name.`,
    );
  }
  return { rows, problems };
}

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
      ...(row.actions
        ? { actions: row.actions }
        : route === WORKSPACE_ROUTE && row.page.startsWith("workspace:")
          ? { actions: ["click-button:Full view"] }
          : {}),
    }),
  );
}
