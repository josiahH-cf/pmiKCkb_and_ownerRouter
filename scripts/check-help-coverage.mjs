// S242 R-S242-7 / ARCH-S242-3: the help coverage gate (backend proof). It enumerates every staff
// route under app/ (except api, sign-in and vendor), every primary navigation item, every Space in
// the directory and every renewal About panel id, and fails unless each is referenced by at least
// one guide or screen reference, and unless every route or id the help references exists (no
// orphan help). Exclusions need a one-line reason and are printed with every run.
//
//   npm run verify:help-coverage
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { HELP_MANUAL } from "@/lib/help";
import { HELP_COVERAGE_ALLOW_LIST } from "@/lib/help/coverage-allow-list";
import { SECTION_HELP_IDS } from "@/lib/lease-renewal/section-help";
import { PRIMARY_NAVIGATION_MANIFEST } from "@/lib/navigation/primary-navigation";
import { directorySpaces } from "@/lib/spaces";

const EXCLUDED_ROUTE_ROOTS = ["/api", "/sign-in", "/vendor"];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Every staff page route pattern, for example `/lease-renewal/live/desk/lease/[leaseId]`. */
export function enumerateStaffRoutes(root = process.cwd()) {
  return walk(join(root, "app"))
    .map((file) => relative(join(root, "app"), file).replaceAll("\\", "/"))
    .filter((file) => file === "page.tsx" || file.endsWith("/page.tsx"))
    .map((file) => `/${file.replace(/\/?page\.tsx$/, "")}`.replace(/\/$/, "") || "/")
    .map((route) => (route === "" ? "/" : route))
    .filter(
      (route) =>
        !EXCLUDED_ROUTE_ROOTS.some(
          (excluded) => route === excluded || route.startsWith(`${excluded}/`),
        ),
    )
    .sort();
}

/** The sets the content references. */
export function helpReferences(manual) {
  const routes = new Set();
  const navItems = new Set();
  const spaces = new Set();
  const aboutIds = new Set();
  for (const guide of manual.guides) {
    for (const step of guide.steps) {
      routes.add(step.route);
      if (step.control.aboutId) aboutIds.add(step.control.aboutId);
    }
    for (const id of guide.navItems ?? []) navItems.add(id);
    for (const id of guide.spaces ?? []) spaces.add(id);
  }
  for (const screen of manual.screens) {
    for (const route of screen.routes) routes.add(route);
    for (const id of screen.navItems ?? []) navItems.add(id);
    for (const id of screen.spaces ?? []) spaces.add(id);
    for (const control of screen.controls)
      if (control.aboutId) aboutIds.add(control.aboutId);
  }
  return { routes, navItems, spaces, aboutIds };
}

/** Pure evaluation over explicit inputs, so fixtures can prove each failure. */
export function evaluateHelpCoverage({
  routes,
  navItems,
  spaces,
  aboutIds,
  manual,
  allowList,
}) {
  const problems = [];
  const referenced = helpReferences(manual);
  const actual = {
    route: new Set(routes),
    navItem: new Set(navItems),
    space: new Set(spaces),
    aboutId: new Set(aboutIds),
  };
  const used = {
    // Pages own query and fragment destinations. Rendered Help checks the full destinations.
    route: new Set([...referenced.routes].map((target) => target.split(/[?#]/, 1)[0])),
    navItem: referenced.navItems,
    space: referenced.spaces,
    aboutId: referenced.aboutIds,
  };
  const allowed = {
    route: new Set(),
    navItem: new Set(),
    space: new Set(),
    aboutId: new Set(),
  };
  for (const entry of allowList) {
    if (!actual[entry.kind]) {
      problems.push(`Allow-list entry ${entry.id} has unknown kind ${entry.kind}.`);
      continue;
    }
    if (!entry.reason || entry.reason.trim().split(/\s+/).length < 4)
      problems.push(
        `Allow-listed ${entry.kind} ${entry.id} needs a one-line reason explaining why it is undocumented.`,
      );
    if (!actual[entry.kind].has(entry.id))
      problems.push(
        `Allow-listed ${entry.kind} ${entry.id} does not exist; remove the stale entry.`,
      );
    allowed[entry.kind].add(entry.id);
  }
  const unreferenced = {};
  for (const kind of Object.keys(actual)) {
    unreferenced[kind] = [...actual[kind]].filter(
      (id) => !used[kind].has(id) && !allowed[kind].has(id),
    );
    for (const id of unreferenced[kind])
      problems.push(
        `Unreferenced ${kind} ${id}: no guide or screen reference documents it.`,
      );
    for (const id of used[kind])
      if (!actual[kind].has(id))
        problems.push(`Orphan help reference: ${kind} ${id} does not exist in the app.`);
  }
  return { problems, unreferenced, referenced: used, allowList };
}

export function runHelpCoverage(root = process.cwd()) {
  return evaluateHelpCoverage({
    routes: enumerateStaffRoutes(root),
    navItems: PRIMARY_NAVIGATION_MANIFEST.flatMap((group) =>
      group.items.map((item) => item.id),
    ),
    spaces: directorySpaces.map((space) => space.id),
    aboutIds: [...SECTION_HELP_IDS],
    manual: HELP_MANUAL,
    allowList: HELP_COVERAGE_ALLOW_LIST,
  });
}

function main() {
  const result = runHelpCoverage();
  const counts = Object.fromEntries(
    Object.entries(result.referenced).map(([kind, set]) => [kind, set.size]),
  );
  console.log(
    `Help coverage: ${enumerateStaffRoutes().length} staff routes, ${counts.navItem} navigation items, ${counts.space} directory Spaces, ${counts.aboutId} About ids referenced.`,
  );
  console.log(
    `Allow-list (${result.allowList.length}):${result.allowList.length ? "" : " empty"}`,
  );
  for (const entry of result.allowList)
    console.log(`  ${entry.kind} ${entry.id}: ${entry.reason}`);
  if (result.problems.length) {
    console.error(`Help coverage gate FAILED with ${result.problems.length} problem(s):`);
    for (const problem of result.problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    "Help coverage gate passed: every route, navigation item, directory Space and About id is documented.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
