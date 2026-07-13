import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_REACHABILITY_TIMEOUT_MS = 1_500;

export class DemoFirestoreTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = "DemoFirestoreTargetError";
  }
}

export function parseDemoEmulatorHost(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new DemoFirestoreTargetError(
      "Demo Firestore refused: set FIRESTORE_EMULATOR_HOST to a reachable loopback emulator such as 127.0.0.1:8080.",
    );
  }
  if (raw.includes("://") || raw.includes("/") || raw.includes("@")) {
    throw new DemoFirestoreTargetError(
      "Demo Firestore refused: FIRESTORE_EMULATOR_HOST must be a bare loopback host and port.",
    );
  }

  const bracketed = /^\[([^\]]+)\]:(\d+)$/.exec(raw);
  const hostPort = /^([^:]+):(\d+)$/.exec(raw);
  const match = bracketed ?? hostPort;
  if (!match) {
    throw new DemoFirestoreTargetError(
      "Demo Firestore refused: FIRESTORE_EMULATOR_HOST must include a loopback host and port.",
    );
  }

  const host = match[1].toLowerCase();
  const port = Number(match[2]);
  const loopback =
    host === "localhost" ||
    host === "::1" ||
    (isIP(host) === 4 && host.startsWith("127."));
  if (!loopback) {
    throw new DemoFirestoreTargetError(
      "Demo Firestore refused: only localhost, 127.0.0.0/8, or [::1] emulator targets are allowed.",
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new DemoFirestoreTargetError(
      "Demo Firestore refused: FIRESTORE_EMULATOR_HOST contains an invalid port.",
    );
  }

  return {
    host,
    port,
    normalizedHost: host === "::1" ? `[::1]:${port}` : `${host}:${port}`,
  };
}

export async function verifyDemoFirestoreTarget(options = {}) {
  const env = options.env ?? process.env;
  const localEnv = options.localEnv ?? readLocalEnv(options.envFile);
  const rawHost = env.FIRESTORE_EMULATOR_HOST || localEnv.FIRESTORE_EMULATOR_HOST;
  const parsedHost = parseDemoEmulatorHost(rawHost);
  const projectId = firstValue(env, localEnv, [
    "FIREBASE_PROJECT_ID",
    "GCP_PROJECT_ID",
    "GOOGLE_CLOUD_PROJECT",
    "GCLOUD_PROJECT",
  ]);
  if (!projectId) {
    throw new DemoFirestoreTargetError(
      "Demo Firestore refused: set FIREBASE_PROJECT_ID, GCP_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or GCLOUD_PROJECT for the emulator namespace.",
    );
  }

  const reachable = await (options.probe ?? probeLoopback)(parsedHost, {
    timeoutMs: options.timeoutMs ?? DEFAULT_REACHABILITY_TIMEOUT_MS,
  });
  if (!reachable) {
    throw new DemoFirestoreTargetError(
      `Demo Firestore refused: no emulator is reachable at ${parsedHost.normalizedHost}. Start the emulator before seed/reset/operator commands.`,
    );
  }

  // Firebase Admin reads this process-level variable. Propagate a safe value loaded from .env.local so
  // later imports and every child process inherit the verified target instead of falling back to live.
  env.FIRESTORE_EMULATOR_HOST = parsedHost.normalizedHost;
  env.FIREBASE_PROJECT_ID = projectId;
  env.GOOGLE_CLOUD_PROJECT = projectId;

  const target = { ...parsedHost, projectId };
  if (options.log !== false) {
    (options.logger ?? console.log)(
      `Demo Firestore target verified: host=${target.host} port=${target.port} project=${target.projectId}`,
    );
  }
  return target;
}

export function readLocalEnv(envFile = join(root, ".env.local")) {
  try {
    return Object.fromEntries(
      readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");
          if (separator === -1) return null;
          return [
            line.slice(0, separator).trim(),
            line
              .slice(separator + 1)
              .trim()
              .replace(/^"|"$/g, ""),
          ];
        })
        .filter(Boolean),
    );
  } catch {
    return {};
  }
}

function firstValue(env, localEnv, names) {
  for (const name of names) {
    const value = String(env[name] || localEnv[name] || "").trim();
    if (value) return value;
  }
  return "";
}

async function probeLoopback(target, { timeoutMs }) {
  return new Promise((resolve) => {
    const socket = connect({ host: target.host, port: target.port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
