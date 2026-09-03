import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S82 deterministic copy acceptance: the named pre-change desk/workspace blocks are absent and the
// preserved source-trust/blocker/disabled-action/unsent-draft/error/label/status/assistive roles
// remain. Word, paragraph, and DOM-node percentages cannot pass or fail this suite.

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const desk = source("components/lease-renewal/RenewalDesk.tsx");
const table = source("components/lease-renewal/RenewalDeskTable.tsx");
const workspace = source("components/lease-renewal/RenewalWorkspace.tsx");
const deskPage = source("app/lease-renewal/live/desk/page.tsx");
const workspacePage = source("app/lease-renewal/live/desk/lease/[leaseId]/page.tsx");
const globalStyles = source("app/globals.css");

describe("S82 retired desk surfaces are absent", () => {
  it("removes the attention duplicate, metric grid, card worklist, and global controls", () => {
    for (const retired of [
      "Needs your attention",
      "renewal-worklist-card",
      "renewal-fact-grid",
      "Apply view",
      "Clear search",
      "Reset all controls",
      "Search renewals",
      "Data diagnostics",
      "ui-metric-grid",
    ]) {
      expect(desk, `Retired desk block still present: ${retired}`).not.toContain(retired);
      expect(table, `Retired desk block still present: ${retired}`).not.toContain(
        retired,
      );
    }
    expect(desk).not.toMatch(/from "@\/lib\/lease-renewal\/attention"/);
    expect(desk).not.toMatch(/\bStepper\b/);
    expect(desk).not.toMatch(/\bMetric\b/);
  });

  it("removes the per-row stepper, process-version panel, and training prose from the workspace", () => {
    expect(workspace).not.toMatch(/\bStepper\b/);
    expect(workspace).not.toContain("RenewalProcessPanel");
    expect(workspace).not.toContain("renewal-authority");
    expect(workspace).not.toContain("completionRule}");
    expect(workspace).not.toContain("responsibleRole}");
  });
});

describe("S82 preserved copy roles remain", () => {
  it("keeps source trust, honest read state, and refresh on the desk", () => {
    expect(desk).toContain("Live data");
    expect(desk).toContain("Live read incomplete");
    expect(desk).toContain("Data too old to act on");
    expect(desk).toContain("RenewalDeskRefresh");
    expect(table).toContain("Matching: {rows.length}");
    expect(table).toContain("Selected scope: {scopeCount}");
    expect(table).toContain("Total loaded:");
    expect(table).toContain("Worklist scope:");
  });

  it("keeps blocker, disabled-action, unsent-draft, and assistive copy in the workspace", () => {
    expect(workspace).toContain("Current blockers");
    expect(workspace).toContain("Recording is paused while the lease data is past");
    expect(workspace).toContain("DRAFT_BANNER");
    expect(workspace).toContain("Do this next");
    expect(workspace).toContain("Go to current phase");
    expect(table).toContain("sr-only");
    expect(table).toContain("<caption");
  });

  it("keeps every workspace text/source destination on the 44-pixel target contract", () => {
    expect(globalStyles).toMatch(
      /\.renewal-workspace-link\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/s,
    );
    expect(workspace.match(/renewal-workspace-link/g)?.length).toBe(5);
    expect(workspacePage).toContain('className="back-link renewal-workspace-link"');
    expect(workspacePage).toContain(
      'className="secondary-button renewal-workspace-link"',
    );
  });
});

describe("S82 static effect boundary", () => {
  it("keeps the table and desk free of store, provider, and mutation imports", () => {
    for (const [name, text] of [
      ["RenewalDeskTable", table],
      ["RenewalDesk", desk],
    ] as const) {
      expect(text, `${name} imports a store module`).not.toMatch(
        /from "@\/lib\/firestore\//,
      );
      expect(text, `${name} imports a provider module`).not.toMatch(
        /from "@\/lib\/integrations\//,
      );
      expect(text, `${name} declares a server action or route call`).not.toMatch(
        /"use server"|fetch\(/,
      );
    }
  });

  it("keeps the desk page's added reads bounded to the reviewed bulk resolution read", () => {
    expect(deskPage).toContain('listResolutionsForRun(user, "live-review")');
    expect(deskPage).not.toContain("writeBatch");
    expect(deskPage).not.toContain(".set(");
    expect(deskPage).not.toContain(".update(");
  });
});
