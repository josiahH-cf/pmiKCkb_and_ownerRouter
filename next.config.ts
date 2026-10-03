import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The HTTP e2e runner may execute while the owner's normal dev server is open. Give that
  // runner an isolated build directory so Next's single-writer .next/dev lock is not shared.
  ...(process.env.NEXT_E2E_ISOLATED_BUILD === "true"
    ? { distDir: "temp/e2e/.next" }
    : {}),
  poweredByHeader: false,
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
