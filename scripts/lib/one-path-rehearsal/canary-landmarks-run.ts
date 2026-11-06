// S252 R-S252-7, harness only: evaluate the release canary's own landmark predicates against the
// one-path rehearsal, read only, so the journey shows nothing about a default view or a status
// rule is still pending in assurance. It imports the canary's exported functions
// (scripts/run-production-canary.ts) and the assurance manifest unchanged, signs in to the
// rehearsal as the local demo Editor, and reads:
//   - the desk table at ASSURANCE_RENEWAL_DESK_PATH, as the canary's renewal_desk route does
//     (heading, then resolveWorkspacePath for the candidate phase);
//   - the lease that path names and the prepared, covered and assisted leases, each with
//     hasRenewalWorkspaceLandmarks;
//   - which routes the canary visits, to show it never opens the bare batch route, where the
//     automatic comparison start lives.
// Every request other than GET, HEAD or OPTIONS is aborted before it leaves the browser and counted,
// as the canary's guarded browser does. The rehearsal's network boundary must be loaded in THIS
// process (NODE_OPTIONS); it refuses to run otherwise. One JSON line is printed.
import net from "node:net";

function assertNetworkBoundary() {
  const fetchGuarded =
    (globalThis.fetch as { name?: string } | undefined)?.name === "guardedFetch";
  const socketGuarded = net.Socket.prototype.connect.name === "guardedConnect";
  if (!fetchGuarded || !socketGuarded)
    throw new Error(
      "The rehearsal network boundary is not loaded in the canary check; nothing was run.",
    );
}

async function main() {
  assertNetworkBoundary();
  const origin = process.env.ONE_PATH_REHEARSAL_ORIGIN ?? "";
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(origin))
    throw new Error("The canary check reads a loopback rehearsal origin only.");
  const leases = (process.env.ONE_PATH_CANARY_LEASES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
  const { chromium } = await import("playwright-core");
  const { resolveBrowserExecutable } = await import("../browser-executable.mjs");
  const { hasRenewalWorkspaceLandmarks, resolveWorkspacePath } =
    await import("../../run-production-canary");
  const { ASSURANCE_RENEWAL_DESK_PATH, AUTHENTICATED_CANARY_MANIFEST } =
    await import("@/lib/production-assurance/manifest");

  const browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const blocked: string[] = [];
  const result: Record<string, unknown> = {};
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      timezoneId: "America/Chicago",
    });
    // Sign-in first, with its own POST; the guard below is installed after it.
    const signIn = await context.newPage();
    await signIn.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
    const signedIn = await signIn.evaluate(() =>
      fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "Editor" }),
      }).then((response) => response.ok),
    );
    await signIn.close();
    if (!signedIn) throw new Error("Local demo Editor sign-in failed.");
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blocked.push(`${request.method()} ${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(180_000);
    page.setDefaultNavigationTimeout(180_000);

    await page.goto(`${origin}${ASSURANCE_RENEWAL_DESK_PATH}`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("table.renewal-table tbody tr").first().waitFor();
    await page.waitForTimeout(3000);
    const workspacePath = await resolveWorkspacePath(page, origin, "candidate");
    result.desk = {
      path: ASSURANCE_RENEWAL_DESK_PATH,
      heading: await page.getByRole("heading", { name: "Renewals", exact: true }).count(),
      rows: await page.locator("table.renewal-table tbody tr[data-lease-id]").count(),
      workspacePath,
    };

    const readLease = async (path: string) => {
      await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("group", { name: "Lease view", exact: true })
        .waitFor({ state: "visible" });
      await page
        .locator("[data-renewal-now-primary]")
        .first()
        .waitFor({ state: "visible", timeout: 60_000 })
        .catch(() => undefined);
      await page.waitForTimeout(2500);
      return {
        path,
        landmarks: await hasRenewalWorkspaceLandmarks(page),
        stage:
          (await page
            .locator('[data-renewal-field="stage-line"]')
            .first()
            .textContent()
            .catch(() => null)) ?? null,
      };
    };
    const pages = [];
    if (workspacePath)
      pages.push({ lease: "canary", ...(await readLease(workspacePath)) });
    for (const lease of leases)
      pages.push({
        lease,
        ...(await readLease(`/lease-renewal/live/desk/lease/${lease}`)),
      });
    result.leases = pages;
    const paths = new Set(
      Object.values(AUTHENTICATED_CANARY_MANIFEST).flatMap((routes) =>
        routes.map((route: { path: string }) => route.path),
      ),
    );
    result.canaryPaths = [...paths].sort();
    result.visitsBareBatch = ["/lease-renewal", "/lease-renewal/live/desk"].some((path) =>
      paths.has(path),
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
  result.blockedMutations = blocked;
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String((error as Error)?.stack ?? error).slice(0, 1500)}\n`);
  process.exit(1);
});
