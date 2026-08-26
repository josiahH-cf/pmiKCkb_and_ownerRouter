import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type EnvLike = Record<string, string | undefined>;

/** Bodyless deploy identity only: no config values, credentials, customer data, or build log. */
export function buildVersionPayload(env: EnvLike = process.env) {
  const commit = env.APP_COMMIT_SHA?.trim();
  const revision = env.K_REVISION?.trim();
  const service = env.K_SERVICE?.trim();
  const environment = env.ENVIRONMENT_KIND?.trim();
  return {
    commit: commit && /^[a-f0-9]{40}$/i.test(commit) ? commit.toLowerCase() : "unknown",
    revision: revision && /^[a-z][a-z0-9-]{0,62}$/.test(revision) ? revision : "unknown",
    service: service && /^[a-z][a-z0-9-]{0,62}$/.test(service) ? service : "unknown",
    environment:
      environment === "production" || environment === "demo" ? environment : "unknown",
  } as const;
}

export async function GET() {
  return NextResponse.json(buildVersionPayload(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
