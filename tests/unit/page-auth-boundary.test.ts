import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Governance invariant (env LR-05, page half): the service runs with --no-invoker-iam-check and has no
// middleware.ts, so auth is enforced per-page. The sibling route-auth-boundary test proves EVERY
// app/api/**/route.ts is guarded; this test proves the same for EVERY app/**/page.tsx — so a future page
// cannot silently ship without a throwing/redirecting auth guard. A staff page must call one of the
// requirePage* guards (which redirect to /sign-in on AuthError); a vendor page must resolve the vendor
// session and redirect when it is absent. Checks run on comment-stripped code so a doc-comment that merely
// NAMES a guard cannot satisfy the invariant.

const REPO_ROOT = process.cwd();
const APP_ROOT = join(REPO_ROOT, "app");

function walkPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkPages(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

function relApp(full: string): string {
  return relative(APP_ROOT, full).split(sep).join("/");
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line comments (leave http:// alone)
}

// A staff page redirects unauthenticated/forbidden callers via a requirePage* guard. A vendor page has no
// staff session; it resolves the vendor session and redirects to /vendor/sign-in when it is absent, so the
// presence of getVendorSession is its guard marker.
const PAGE_GUARD =
  /require(?:PageCapability|PageRole|PageSpaceAccess)\b|getVendorSession\b/;

// Only the staff sign-in shell can render unguarded. Fully retired bookmarks may only perform
// the exact inert redirect below; matching a retired pathname alone never exempts page code.
const ALLOW_UNAUTHENTICATED = new Set(["sign-in/page.tsx"]);
const RETIRED_REDIRECTS = new Set([
  "maintenance/page.tsx",
  "maintenance/vendors/page.tsx",
  "maintenance/history/page.tsx",
  "maintenance/report/page.tsx",
  "maintenance/retired/page.tsx",
  "maintenance/policies/page.tsx",
  "vendor/page.tsx",
  "vendor/sign-in/page.tsx",
  "vendor/setup/page.tsx",
  "vendor/tickets/[ticketId]/page.tsx",
  "admin/vendors/page.tsx",
]);
const RETIRED_REDIRECT_CODE =
  'import { redirect } from "next/navigation"; export default function RetiredMaintenancePage() { redirect("/lease-renewal"); }';
function isInertRetiredRedirect(relPath: string, source: string) {
  return (
    RETIRED_REDIRECTS.has(relPath) &&
    stripComments(source).replace(/\s+/g, " ").trim() === RETIRED_REDIRECT_CODE
  );
}

describe("App page auth-boundary invariant", () => {
  const pages = walkPages(APP_ROOT);

  it("enumerates the page tree (walker sanity)", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it("every page is guarded by a throwing/redirecting auth guard unless explicitly allow-listed", () => {
    const offenders = pages
      .map(relApp)
      .filter((relPath) => !ALLOW_UNAUTHENTICATED.has(relPath))
      .filter(
        (relPath) =>
          !PAGE_GUARD.test(
            stripComments(readFileSync(join(APP_ROOT, relPath), "utf8")),
          ) &&
          !isInertRetiredRedirect(relPath, readFileSync(join(APP_ROOT, relPath), "utf8")),
      );
    expect(offenders).toEqual([]);
  });

  it("retired bookmarks contain only the exact redirect and no record, provider or rendering code", () => {
    for (const retired of RETIRED_REDIRECTS)
      expect(
        isInertRetiredRedirect(retired, readFileSync(join(APP_ROOT, retired), "utf8")),
      ).toBe(true);
    expect(
      isInertRetiredRedirect(
        "admin/vendors/page.tsx",
        RETIRED_REDIRECT_CODE + " readProvider();",
      ),
    ).toBe(false);
    expect(isInertRetiredRedirect("new-public/page.tsx", RETIRED_REDIRECT_CODE)).toBe(
      false,
    );
  });

  it("the allow-list contains no stale entries (each file still exists and is a page)", () => {
    const present = new Set(pages.map(relApp));
    for (const allowed of ALLOW_UNAUTHENTICATED) {
      expect(present.has(allowed)).toBe(true);
    }
  });
});
