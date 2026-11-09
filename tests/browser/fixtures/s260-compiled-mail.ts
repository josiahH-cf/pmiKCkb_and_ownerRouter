import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { timingSafeEqual } from "node:crypto";
import {
  loopbackStandInOrigin,
  type RehearsalStandIn,
} from "@/lib/environment/rehearsal-stand-in";

const PROJECT = "pmi-kc-kb-one-path-rehearsal-test";
const LOCAL_PORT = /^127\.0\.0\.1:[1-9]\d{0,4}$/;
const DISPOSABLE_ROOT = /^\/tmp\/pmi-kc-one-path-rehearsal-[A-Za-z0-9]+\/worktree$/;
const SYNTHETIC_CLOCK =
  /^\/home\/[^/]+\/\.local\/state\/pmi-kc-one-path-rehearsal\/[^/]+\/s260-mail-clock\.json$/;
const GUARD = Symbol.for("pmi-kc.rehearsal-network-guard");

function isCompiledMailFixture(env: NodeJS.ProcessEnv) {
  return (
    process.env.NODE_ENV === "production" &&
    process.env === env &&
    env.NEXT_E2E_ISOLATED_BUILD === "true" &&
    env.ENVIRONMENT_KIND === "demo" &&
    env.DATA_CONTEXT === "demo" &&
    env.LOCAL_DEMO_AUTH === "true" &&
    env.FIREBASE_PROJECT_ID === PROJECT &&
    env.GOOGLE_CLOUD_PROJECT === PROJECT &&
    LOCAL_PORT.test(env.FIRESTORE_EMULATOR_HOST ?? "") &&
    LOCAL_PORT.test(env.FIREBASE_AUTH_EMULATOR_HOST ?? "") &&
    DISPOSABLE_ROOT.test(process.cwd()) &&
    Object.getOwnPropertyDescriptor(globalThis, GUARD)?.value ===
      Socket.prototype.connect &&
    /^[a-f0-9]{64}$/.test(env.S260_SYNTHETIC_WORKER_TOKEN ?? "") &&
    SYNTHETIC_CLOCK.test(env.S260_SYNTHETIC_MAIL_CLOCK ?? "") &&
    Boolean(env.REHEARSAL_STAND_IN_ORIGIN) &&
    env.REHEARSAL_STAND_IN_ORIGIN === env.ONE_PATH_REHEARSAL_STAND_IN_ORIGIN
  );
}

export function resolveRehearsalMail(
  env: NodeJS.ProcessEnv = process.env,
): RehearsalStandIn | null {
  if (!isCompiledMailFixture(env)) return null;
  const origin = loopbackStandInOrigin(env.REHEARSAL_STAND_IN_ORIGIN);
  return origin && new URL(origin).hostname === "127.0.0.1"
    ? Object.freeze({ origin })
    : null;
}

export function readRehearsalMailTime() {
  if (!resolveRehearsalMail()) return Date.now();
  const value = JSON.parse(readFileSync(process.env.S260_SYNTHETIC_MAIL_CLOCK!, "utf8"));
  if (value === null) return Date.now();
  if (!Number.isSafeInteger(value) || Math.abs(value - Date.now()) > 45 * 86_400_000)
    throw new Error("Synthetic mail clock is outside the rehearsal bound.");
  return value as number;
}

export function hasCompiledRehearsalCapability(authorization: string | null) {
  if (!resolveRehearsalMail()) return false;
  const token = /^Bearer ([a-f0-9]{64})$/.exec(authorization ?? "")?.[1];
  return Boolean(
    token &&
    timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(process.env.S260_SYNTHETIC_WORKER_TOKEN!, "hex"),
    ),
  );
}

export function isCompiledMailWorkerRequest(request: Request) {
  return hasCompiledRehearsalCapability(request.headers.get("authorization"));
}
