/**
 * S254 R-S254-4: the isolated rehearsal's stand-in origin, and the one fence that decides whether
 * a Demo-owned stand-in adapter may exist in this process.
 *
 * The rehearsal (`scripts/run-renewal-one-path-rehearsal.sh`) serves the app from a disposable
 * worktree with a Firestore emulator, local demo sign-in, a synthetic RentVine transport and
 * every other outbound connection refused. Its mail stand-in is a loopback process that accepts a
 * send and keeps what was sent readable, so a verification session can observe what the app does
 * after a send without any mailbox existing.
 *
 * A stand-in is resolved only when every condition below holds. Each is a server-owned fact; no
 * request, cookie, header or stored record takes part.
 *
 *   1. `REHEARSAL_STAND_IN_ORIGIN` names a plain HTTP origin on 127.0.0.1, localhost or [::1] with
 *      an explicit port and nothing else: no account, path, query or fragment.
 *   2. The environment descriptor is explicitly Demo with Demo data. Production, Live read-only
 *      and a descriptor derived from `NODE_ENV` never qualify.
 *   3. `NODE_ENV` is not production, so no deployed build qualifies, deployed Demo included.
 *   4. Local demo sign-in is on.
 *   5. The Firestore store is a loopback emulator.
 *
 * With the variable unset, or with any condition unmet, the answer is null and every caller
 * behaves exactly as it did before this module existed: the Live provider fence refuses outside
 * Production with Live data. The release refuses the variable by name
 * (`LOCAL_ONLY_DEPLOY_VARIABLES` in `scripts/release-candidate.mjs`), so it cannot deploy.
 */
import { parseEnvironmentDescriptor } from "@/lib/environment/descriptor";

export const REHEARSAL_STAND_IN_ORIGIN_VAR = "REHEARSAL_STAND_IN_ORIGIN";

export interface RehearsalStandIn {
  /** The loopback origin of the rehearsal's stand-in process, for example http://127.0.0.1:41234. */
  readonly origin: string;
}

type Environment = Record<string, string | undefined>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The origin when the value is a plain loopback HTTP origin with an explicit port; else null. */
export function loopbackStandInOrigin(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port === "" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search !== "" ||
    url.hash !== "" ||
    text.includes("?") ||
    text.includes("#")
  )
    return null;
  return url.origin;
}

const isLoopbackEmulator = (value: string | undefined) =>
  /^(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(value?.trim() ?? "");

const isProductionBuild = (value: string | undefined) =>
  value?.trim().toLowerCase() === "production";

/**
 * The rehearsal's stand-in for this process, or null. Only the record passed in is read for the
 * origin and the descriptor; the process's own `NODE_ENV` is checked as well, so a production
 * build is refused whatever record a caller supplies.
 */
export function resolveRehearsalStandIn(
  env: Environment = process.env,
): RehearsalStandIn | null {
  const origin = loopbackStandInOrigin(env[REHEARSAL_STAND_IN_ORIGIN_VAR]);
  if (!origin) return null;
  const parsed = parseEnvironmentDescriptor(env);
  if (
    !parsed.ok ||
    parsed.descriptor.environmentKind !== "demo" ||
    parsed.descriptor.dataContext !== "demo"
  )
    return null;
  if (isProductionBuild(env.NODE_ENV) || isProductionBuild(process.env.NODE_ENV))
    return null;
  if (env.LOCAL_DEMO_AUTH?.trim().toLowerCase() !== "true") return null;
  if (!isLoopbackEmulator(env.FIRESTORE_EMULATOR_HOST)) return null;
  return Object.freeze({ origin });
}
