import { buildVersionPayload } from "@/app/api/version/route";

/**
 * S242 R-S242-4: the serving application commit a guide describes, read from the same deploy
 * identity `/api/version` reports (APP_COMMIT_SHA). Null when this server does not report one.
 */
export function helpServingCommit(env: Record<string, string | undefined> = process.env) {
  const { commit } = buildVersionPayload(env);
  return commit === "unknown" ? null : commit;
}

export function shortCommit(commit: string) {
  return commit.slice(0, 12);
}
