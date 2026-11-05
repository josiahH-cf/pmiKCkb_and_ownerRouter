// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import type { Page } from "playwright-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import type { RenewalDeskView } from "@/lib/lease-renewal/desk-model";
import { resolveRenewalDeskEntry } from "@/lib/lease-renewal/desk-preferences";
import {
  RENEWAL_DESK_ALL_LEASES_HREF,
  RENEWAL_DESK_ROUTE,
} from "@/lib/lease-renewal/desk-view-continuation";
import { projectRenewalBatchRows } from "@/lib/lease-renewal/renewal-batch-row";
import {
  ASSURANCE_RENEWAL_DESK_PATH,
  AUTHENTICATED_CANARY_MANIFEST,
  routesForRole,
} from "@/lib/production-assurance/manifest";
import {
  PRODUCTION_RECONCILIATION_DESK_VIEW,
  validPrimaryWorkspaceDestination,
} from "@/lib/production-assurance/renewal-source-projection";
import { S246_READ_TS, S246_TODAY, loadS246Desk } from "@/tests/helpers/s246-portfolio";
import {
  resolveWorkspacePath,
  workspaceSelectorsForPhase,
} from "../../scripts/run-production-canary";

// S246: the bare Renewals route now opens the working batch. Release assurance (the canary
// landmarks and the source reconciliation) keeps reading the table over every loaded lease, by
// one explicit path, so a rendered row still exists for every loaded record. These checks run the
// canary's own selector and the reconciliation's own destination rule against the rendered desk.
// Values are synthetic; nothing here contacts a deployment.

const ORIGIN = "https://app.example.invalid";
const RECONCILED_ROWS =
  'section[aria-label="Renewal worklist"] table.renewal-table tbody > tr[data-lease-id]';
const DESK_ROOT =
  "div.ui-stack[data-source-currency-state][data-source-read-complete][data-source-refresh-failed][data-source-refreshing]";

let view: RenewalDeskView;

beforeAll(async () => {
  view = await loadS246Desk();
});

afterEach(cleanup);

/** The rendered document behind the two locator calls the canary's workspace resolution makes. */
function renderedPage(): Page {
  return {
    locator: (selector: string) => ({
      first: () => {
        const element = document.querySelector(selector);
        return {
          count: async () => (element ? 1 : 0),
          getAttribute: async (name: string) => element?.getAttribute(name) ?? null,
        };
      },
    }),
  } as unknown as Page;
}

describe("S246 release assurance reads the table over every loaded lease (ARCH-S246-3)", () => {
  it("the canary route and the reconciliation share one explicit path, and it is never the bare route", () => {
    expect(ASSURANCE_RENEWAL_DESK_PATH).toBe(RENEWAL_DESK_ALL_LEASES_HREF);
    expect(ASSURANCE_RENEWAL_DESK_PATH).not.toBe(RENEWAL_DESK_ROUTE);
    expect(ASSURANCE_RENEWAL_DESK_PATH).toBe(
      `${RENEWAL_DESK_ROUTE}?${PRODUCTION_RECONCILIATION_DESK_VIEW}`,
    );
    for (const role of ["Admin", "Editor"] as const) {
      const routes = [
        AUTHENTICATED_CANARY_MANIFEST[role],
        routesForRole(role),
        // A captured predecessor is read at the same path; it renders the same table there.
        routesForRole(role, "e106a88a50d541b4a012111019b09c2183f6ce20"),
      ];
      for (const manifest of routes) {
        const desk = manifest.filter((route) => route.key === "renewal_desk");
        expect(desk).toHaveLength(1);
        expect(desk[0]).toMatchObject({
          path: ASSURANCE_RENEWAL_DESK_PATH,
          expectedOutcome: "rendered",
          heading: "Renewals",
        });
        // The lease the canary opens is still chosen from that table.
        expect(
          manifest.find((route) => route.key === "renewal_workspace")?.dynamicFrom,
        ).toBe("renewal_desk");
      }
    }
    const reconciliation = readFileSync(
      "scripts/run-production-reconciliation.ts",
      "utf8",
    );
    expect(reconciliation).toContain(
      "page.goto(`${options.origin}${ASSURANCE_RENEWAL_DESK_PATH}`",
    );
    // It is the script's only navigation, and it reads the table's rows.
    expect(reconciliation.match(/\.goto\(/g)).toHaveLength(1);
    expect(reconciliation).toContain("table.renewal-table tbody > tr[data-lease-id]");
  });

  it("that path opens the table, with one row per loaded lease and the landmarks both readers require", async () => {
    const entry = resolveRenewalDeskEntry({
      searchParams: new URLSearchParams(ASSURANCE_RENEWAL_DESK_PATH.split("?")[1]),
      // An account's remembered view never changes what this path shows.
      storedView: "v=2&overallStatus=blocked",
    });
    expect(entry.surface).toBe("table");
    expect(entry.state.scope).toBe("all");
    render(<RenewalDesk query={entry.state} view={view} />);

    // The reconciliation counts these rows against the source and projected records.
    const rendered = [...document.querySelectorAll(RECONCILED_ROWS)].map((row) =>
      row.getAttribute("data-lease-id"),
    );
    expect(rendered).toHaveLength(view.items.length);
    expect(new Set(rendered)).toEqual(new Set(view.items.map((row) => row.id)));
    // Both readers require exactly one desk root and exactly one "Renewals" heading.
    expect(document.querySelectorAll(DESK_ROOT)).toHaveLength(1);
    expect(document.querySelector(DESK_ROOT)).not.toHaveAttribute("data-desk-surface");
    expect(screen.getAllByRole("heading", { name: "Renewals" })).toHaveLength(1);

    // The canary's own strict selector finds its lease, and the link returns to this same table.
    const path = await resolveWorkspacePath(renderedPage(), ORIGIN, "candidate");
    expect(path).toMatch(/^\/lease-renewal\/live\/desk\/lease\/\d+\?/);
    const leaseId = path!.split("/lease/")[1].split("?")[0];
    expect(rendered).toContain(leaseId);
    expect(validPrimaryWorkspaceDestination(path, ORIGIN, leaseId)).toBe(true);
    expect(new URL(path!, ORIGIN).searchParams.get("deskView")).toBe(
      PRODUCTION_RECONCILIATION_DESK_VIEW,
    );
  });

  it("the working batch is a different surface: it holds no table row, so neither reader may be pointed at the bare route", async () => {
    const entry = resolveRenewalDeskEntry({ searchParams: {}, storedView: null });
    expect(entry.surface).toBe("batch");
    render(
      <RenewalDesk
        batch={{
          rows: projectRenewalBatchRows(view.items, {
            sourceReadAtIso: S246_READ_TS,
            todayIso: S246_TODAY,
          }),
          todayIso: S246_TODAY,
          initial: entry.batch,
        }}
        query={entry.state}
        view={view}
      />,
    );
    expect(document.querySelector(DESK_ROOT)).toHaveAttribute(
      "data-desk-surface",
      "batch",
    );
    expect(document.querySelectorAll(DESK_ROOT)).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Renewals" })).toHaveLength(1);
    expect(document.querySelectorAll(RECONCILED_ROWS)).toHaveLength(0);
    expect(document.querySelector("table.renewal-table")).toBeNull();
    for (const selector of workspaceSelectorsForPhase("rollback"))
      expect(document.querySelector(selector)).toBeNull();
    expect(await resolveWorkspacePath(renderedPage(), ORIGIN, "candidate")).toBeNull();
    // The batch still accounts for every loaded lease, and the table is one link away.
    expect(document.querySelector('[aria-label="Working batch"]')).toHaveAttribute(
      "data-batch-total",
      String(view.items.length),
    );
    expect(screen.getByRole("link", { name: "All leases and filters" })).toHaveAttribute(
      "href",
      ASSURANCE_RENEWAL_DESK_PATH,
    );
  });
});
