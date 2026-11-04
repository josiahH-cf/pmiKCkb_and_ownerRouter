import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// S242 AC-S242-8 / S244 AC-S244-5 (Safety): opening, navigating and printing help performs no
// write, provider call, send or action-key read, and the /help route family has no POST handler.
// Help is repository-managed content rendered by server pages; the only client code is the table
// of contents (session storage), the print button (window.print) and the moved-step notice.

const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .sort()
    .flatMap((entry) => {
      const path = `${dir}/${entry}`;
      return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path];
    });
}

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const ROUTE_FILES = walk("app/help");
const COMPONENT_FILES = walk("components/help");
const LIB_FILES = walk("lib/help").filter((path) => /\.(ts|tsx|mjs)$/.test(path));
const HELP_FILES = [...ROUTE_FILES, ...COMPONENT_FILES, ...LIB_FILES];

const FORBIDDEN: readonly [string, RegExp][] = [
  ["network request", /\bfetch\s*\(|XMLHttpRequest|sendBeacon|EventSource|WebSocket/],
  [
    "Firestore or Admin SDK",
    /firebase-admin|firebase\/firestore|@\/lib\/firestore|getFirestore\s*\(/,
  ],
  [
    "provider client",
    /@\/lib\/(rentvine|sheets|google|dotloop|gmail|gmail-hub|integrations)\//,
  ],
  ["action registry or gate", /action-registry|action-gate|actionGate|isActionAvailable/],
  ["server action", /["']use server["']/],
  [
    "file write",
    /writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|createWriteStream/,
  ],
];

describe("S242 AC-S242-8: the /help route family is read-only", () => {
  it("has pages only: no route handler and no POST, PUT, PATCH or DELETE export", () => {
    expect(ROUTE_FILES.filter((path) => /\/route\.[cm]?[jt]sx?$/.test(path))).toEqual([]);
    for (const path of ROUTE_FILES)
      expect(read(path), path).not.toMatch(
        /export\s+(?:async\s+)?(?:function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/,
      );
  });

  it("every help page renders inside AppShell behind the read capability", () => {
    const pages = ROUTE_FILES.filter((path) => path.endsWith("/page.tsx"));
    expect(pages.length).toBeGreaterThanOrEqual(8);
    for (const path of pages) {
      const text = read(path);
      expect(text, path).toMatch(/await requirePageCapability\("read"\)/);
      expect(text, path).toMatch(/<AppShell user=\{user\}>/);
    }
  });

  it("help pages, components and content make no request, write, send or action-key read", () => {
    const hits = HELP_FILES.flatMap((path) => {
      const text = read(path);
      return FORBIDDEN.filter(([, pattern]) => pattern.test(text)).map(
        ([kind]) => `${relative(ROOT, join(ROOT, path))}: ${kind}`,
      );
    });
    expect(hits).toEqual([]);
  });

  it("the only browser-side effects are session storage for the sidebar and window.print", () => {
    const client = COMPONENT_FILES.filter((path) =>
      read(path).startsWith('"use client"'),
    );
    expect(client.sort()).toEqual(
      [
        "components/help/HelpPrintButton.tsx",
        "components/help/HelpStepTarget.tsx",
        "components/help/HelpTableOfContents.tsx",
      ].sort(),
    );
    expect(read("components/help/HelpTableOfContents.tsx")).not.toMatch(/localStorage/);
    expect(read("components/help/HelpPrintButton.tsx")).toMatch(/window\.print\(\)/);
  });
});
