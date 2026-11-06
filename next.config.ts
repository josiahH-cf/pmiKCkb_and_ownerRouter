import type { NextConfig } from "next";
import { HELP_CHANGELOG } from "./lib/help/content/changelog";
import { HELP_VERSION } from "./lib/help/version";

const nextConfig: NextConfig = {
  // The HTTP e2e runner may execute while the owner's normal dev server is open. Give that
  // runner an isolated build directory so Next's single-writer .next/dev lock is not shared.
  ...(process.env.NEXT_E2E_ISOLATED_BUILD === "true"
    ? {
        distDir: "temp/e2e/.next",
        // Persist compiled dev tasks, then evict them after each cache snapshot. The HTTP
        // suite visits many routes in one bounded server; production keeps Next's defaults.
        experimental: { turbopackMemoryEviction: "full" as const },
      }
    : {}),
  poweredByHeader: false,
  // Versioned help pictures keep their existing URLs when the current capture folder moves.
  // Temporary redirects always resolve through the current version, including later updates.
  async redirects() {
    return HELP_CHANGELOG.filter((entry) => entry.version !== HELP_VERSION).map(
      (entry) => ({
        source: `/help/${entry.version}/:image([a-z0-9-]+\\.png)`,
        destination: `/help/${HELP_VERSION}/:image`,
        permanent: false,
      }),
    );
  },
  // S165: Firebase's Google sign-in helper asks for these fixed paths on whichever host is the
  // sign-in helper domain. Route them to the app's own relay (app/api/auth/helper), which answers
  // 404 until the explicit same-origin key is set. A rewrite, never a redirect: the browser must
  // stay on this origin for the sign-in to return to the app.
  async rewrites() {
    return [
      { source: "/__/auth/:path*", destination: "/api/auth/helper/auth/:path*" },
      {
        source: "/__/firebase/init.json",
        destination: "/api/auth/helper/firebase/init.json",
      },
    ];
  },
};

export default nextConfig;
