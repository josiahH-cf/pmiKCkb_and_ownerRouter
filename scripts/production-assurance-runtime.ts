import { existsSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import {
  ASSURANCE_ROLES,
  serializeProductionAssuranceEvidence,
  type AssuranceRole,
  type ProductionAssuranceEvidence,
} from "../lib/production-assurance";

const CLOUD_RUN_HOST = /(?:^|\.)a\.run\.app$/;

export interface ProductionTarget {
  readonly origin: string;
  readonly expectedCommit: string;
  readonly expectedRevision: string;
  readonly service: string;
}

export interface ProductionVersionIdentity {
  readonly commit: string;
  readonly revision: string;
  readonly service: string;
  readonly environment: "production";
}

export function readArg(argv: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

export function hasArg(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

export function requireExplicitLive(argv: readonly string[]): void {
  if (!hasArg(argv, "--live")) {
    throw new Error("explicit_live_required");
  }
}

export function resolveProductionTarget(argv: readonly string[]): ProductionTarget {
  const rawUrl = readArg(argv, "--base-url");
  const expectedCommit = readArg(argv, "--expected-commit")?.toLowerCase();
  const expectedRevision = readArg(argv, "--expected-revision");
  const service = readArg(argv, "--service");
  if (!rawUrl || !expectedCommit || !expectedRevision || !service) {
    throw new Error("target_fields_required");
  }
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !CLOUD_RUN_HOST.test(url.hostname)
  ) {
    throw new Error("production_origin_invalid");
  }
  if (!/^[a-f0-9]{40}$/.test(expectedCommit)) {
    throw new Error("expected_commit_invalid");
  }
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(expectedRevision)) {
    throw new Error("expected_revision_invalid");
  }
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(service)) {
    throw new Error("service_invalid");
  }
  if (!expectedRevision.startsWith(`${service}-`)) {
    throw new Error("version_service_mismatch");
  }
  return { origin: url.origin, expectedCommit, expectedRevision, service };
}

export function resolveRole(argv: readonly string[]): AssuranceRole {
  const role = readArg(argv, "--role");
  if (!ASSURANCE_ROLES.includes(role as AssuranceRole)) {
    throw new Error("managed_role_required");
  }
  return role as AssuranceRole;
}

export function resolveManagedProfile(
  argv: readonly string[],
  repositoryRoot = process.cwd(),
): string {
  const profileArg = readArg(argv, "--profile");
  if (!profileArg || !isAbsolute(profileArg) || !existsSync(profileArg)) {
    throw new Error("managed_profile_required");
  }
  const profile = realpathSync(profileArg);
  if (!statSync(profile).isDirectory()) throw new Error("managed_profile_invalid");
  const root = realpathSync(repositoryRoot);
  const fromRoot = relative(root, profile);
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    throw new Error("managed_profile_must_be_outside_repository");
  }
  return profile;
}

export function resolveNamedManagedProfile(
  argv: readonly string[],
  flag: "--admin-profile" | "--editor-profile",
  repositoryRoot = process.cwd(),
): string {
  const profileArg = readArg(argv, flag);
  if (!profileArg) throw new Error("managed_profile_required");
  return resolveManagedProfile([`--profile=${profileArg}`], repositoryRoot);
}

export function findBrowserExecutable(env = process.env): string {
  const candidates = [
    env.PLAYWRIGHT_CHROME_PATH,
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/c/Program Files/Google/Chrome/Application/chrome.exe",
    "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const executable = candidates.find((candidate): candidate is string =>
    Boolean(candidate && existsSync(candidate)),
  );
  if (!executable) throw new Error("managed_browser_unavailable");
  return executable;
}

export function safeSameOrigin(value: string, origin: string): boolean {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

export async function readProductionVersionIdentity(
  origin: string,
  service: string,
  sharedSignal?: AbortSignal,
): Promise<ProductionVersionIdentity> {
  let response: Response;
  try {
    response = await fetch(`${origin}/api/version`, {
      method: "GET",
      redirect: "manual",
      signal: sharedSignal
        ? AbortSignal.any([sharedSignal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("version_read_failed");
  }
  if (!response.ok) throw new Error("version_read_failed");
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !body ||
    typeof body.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(body.commit) ||
    typeof body.revision !== "string" ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(body.revision) ||
    body.service !== service ||
    !body.revision.startsWith(`${service}-`) ||
    body.environment !== "production"
  ) {
    throw new Error("version_identity_mismatch");
  }
  return {
    commit: body.commit,
    revision: body.revision,
    service,
    environment: "production",
  };
}

export async function verifyExactVersion(
  target: ProductionTarget,
  sharedSignal?: AbortSignal,
): Promise<void> {
  const body = await readProductionVersionIdentity(
    target.origin,
    target.service,
    sharedSignal,
  );
  if (
    body.commit !== target.expectedCommit ||
    body.revision !== target.expectedRevision
  ) {
    throw new Error("version_identity_mismatch");
  }
}

export function writeAssuranceReport(
  argv: readonly string[],
  report: ProductionAssuranceEvidence,
): void {
  const serialized = serializeProductionAssuranceEvidence(report);
  const output = readArg(argv, "--report");
  if (output) {
    const resolved = resolve(output);
    writeFileSync(resolved, serialized, { encoding: "utf8", flag: "wx" });
  }
  process.stdout.write(serialized);
}

export function safeCliFailure(error: unknown): string {
  const code = error instanceof Error ? error.message : "assurance_failed";
  return /^[a-z0-9_]+$/.test(code) ? code : "assurance_failed";
}
