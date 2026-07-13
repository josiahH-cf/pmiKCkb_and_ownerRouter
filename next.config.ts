import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The HTTP e2e runner may execute while the owner's normal dev server is open. Give that
  // runner an isolated build directory so Next's single-writer .next/dev lock is not shared.
  ...(process.env.NEXT_E2E_ISOLATED_BUILD === "true"
    ? { distDir: "temp/e2e/.next" }
    : {}),
  poweredByHeader: false,
};

export default nextConfig;
