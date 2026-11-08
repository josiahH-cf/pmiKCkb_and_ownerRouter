// S254 R-S254-4: the control hooks of a running one-path rehearsal, as functions. A driver file
// imports them; scripts/one-path-rehearsal-control.mjs is the command-line form. Every hook acts
// on the rehearsal's own loopback processes or on files in its private run directory: the
// stand-in process, the Firestore emulator and the provider boundary's control files. Each URL is
// checked to be 127.0.0.1 before it is called, so a hook cannot reach anything else.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REHEARSAL_STATE_DIR = join(
  process.env.HOME ?? "/tmp",
  ".local/state/pmi-kc-one-path-rehearsal",
);
export const REHEARSAL_FILE = "rehearsal.json";
/** The monthly comparison allowance the rehearsal's server runs with. */
export const REHEARSAL_COMPARISON_ALLOWANCE = 50;

const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;
const LOOPBACK_HOST = /^127\.0\.0\.1:\d{1,5}$/;

function loopback(origin) {
  if (!LOOPBACK_ORIGIN.test(String(origin)))
    throw new Error(`Refused ${origin}: rehearsal controls call 127.0.0.1 only.`);
  return origin;
}

/** The description a running rehearsal wrote into its run directory. */
export function readRehearsal(runDir) {
  const file = join(runDir, REHEARSAL_FILE);
  if (!existsSync(file))
    throw new Error(
      `No rehearsal is described in ${runDir} (missing ${REHEARSAL_FILE}).`,
    );
  const rehearsal = JSON.parse(readFileSync(file, "utf8"));
  loopback(rehearsal.standInOrigin);
  if (!LOOPBACK_HOST.test(rehearsal.firestoreEmulatorHost))
    throw new Error("The rehearsal's Firestore emulator is not on 127.0.0.1.");
  return { ...rehearsal, runDir };
}

/** The newest run directory that describes a rehearsal, or null. */
export function latestRunDir(stateDir = REHEARSAL_STATE_DIR) {
  if (!existsSync(stateDir)) return null;
  const runs = readdirSync(stateDir)
    .filter((name) => existsSync(join(stateDir, name, REHEARSAL_FILE)))
    .sort();
  return runs.length ? join(stateDir, runs.at(-1)) : null;
}

async function call(origin, path, { method = "GET", body, headers } = {}) {
  const response = await fetch(`${loopback(origin)}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { text };
  }
  if (!response.ok)
    throw new Error(
      `${method} ${path} answered ${response.status}: ${parsed?.error?.message ?? text.slice(0, 200)}`,
    );
  return parsed;
}

/** Everything the stand-ins hold: comparison requests by lease, model requests, kept mail. */
export const standInState = (rehearsal) =>
  call(rehearsal.standInOrigin, "/control/state");

const standInControl = (rehearsal, name, body = {}) =>
  call(rehearsal.standInOrigin, `/control/${name}`, { method: "POST", body });

/** L36: deliver an owner reply on a thread (the latest sent, or narrowed by `to` or `threadId`). */
export const deliverOwnerReply = (rehearsal, options = {}) =>
  standInControl(rehearsal, "deliver-reply", options);
/** L37 and L38: "unconfirmed", "unconfirmed-lost", "bounce" or "normal", for the next send only. */
export const setNextSend = (rehearsal, mode) =>
  standInControl(rehearsal, "next-send", { mode });
/** L38: return a failed delivery for a message already sent. */
export const bounceSentMessage = (rehearsal, options = {}) =>
  standInControl(rehearsal, "bounce", options);
/** L40: staff sent the held draft from Gmail. */
export const sendHeldDraft = (rehearsal, options = {}) =>
  standInControl(rehearsal, "send-draft", options);
/** L44: "accept" or "echo"; with `once`, for the next rewording only. */
export const setRewording = (rehearsal, mode, once = false) =>
  standInControl(rehearsal, "rewording", { mode, once });
export const resetComparisonLog = (rehearsal) =>
  standInControl(rehearsal, "reset-comparison-log");

function readFlags(rehearsal) {
  const file = rehearsal.files.rentvineControl;
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
function writeFlags(rehearsal, flags) {
  writeFileSync(rehearsal.files.rentvineControl, `${JSON.stringify(flags, null, 2)}\n`);
  return flags;
}

/**
 * L09: make one lease's RentVine status unreadable ("missing": the lease carries no status;
 * "unresolved": a status the status table does not hold), or readable again ("clear"). The app
 * shows the change after its next RentVine read: choose "Refresh data" on the desk, or call
 * forceSourceRefresh from seeds.mjs in a driver.
 */
export function setStatusUnreadable(rehearsal, leaseId, mode) {
  if (!["missing", "unresolved", "clear"].includes(mode))
    throw new Error("Choose missing, unresolved or clear.");
  const flags = readFlags(rehearsal);
  const statusUnreadable = { ...(flags.statusUnreadable ?? {}) };
  if (mode === "clear") delete statusUnreadable[String(leaseId)];
  else statusUnreadable[String(leaseId)] = mode;
  return writeFlags(rehearsal, { ...flags, statusUnreadable });
}

/** Hide one fixture lease from the current inventory and detail response. */
export function setUnavailableSourceLease(rehearsal, leaseId) {
  if (
    leaseId !== null &&
    !Object.values(rehearsal.groups).flat().includes(Number(leaseId))
  )
    throw new Error("Choose an existing fixture lease.");
  return writeFlags(rehearsal, { ...readFlags(rehearsal), unavailableLeaseId: leaseId });
}

/** Serve a different verified source end date for one existing fixture lease. */
export function setSourceCycleDate(rehearsal, leaseId, endDate) {
  if (!Object.values(rehearsal.groups).flat().includes(Number(leaseId)))
    throw new Error("Choose an existing fixture lease.");
  if (endDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))
    throw new Error("Choose a synthetic lease end date.");
  return writeFlags(rehearsal, {
    ...readFlags(rehearsal),
    sourceCycleDate: endDate ? { leaseId: String(leaseId), endDate } : null,
  });
}

/** S252: every RentVine control flag off, as the rehearsal starts (reset.mjs). */
export function clearRentvineFlags(rehearsal) {
  return writeFlags(rehearsal, {});
}

/** S252: everything the stand-ins hold back to how they start (reset.mjs). */
export const resetStandIns = (rehearsal) => standInControl(rehearsal, "reset");

/**
 * S252: remove every document from the rehearsal's own Firestore emulator (reset.mjs). The
 * emulator's owner token is a fixed word, not a credential; the host is checked to be 127.0.0.1.
 */
export async function clearEmulatorDocuments(rehearsal) {
  if (!LOOPBACK_HOST.test(rehearsal.firestoreEmulatorHost))
    throw new Error("The rehearsal's Firestore emulator is not on 127.0.0.1.");
  if (!/^pmi-kc-kb-[a-z0-9-]+-test$/.test(String(rehearsal.projectId)))
    throw new Error("The rehearsal's emulator project is not a rehearsal test project.");
  await call(
    `http://${rehearsal.firestoreEmulatorHost}`,
    `/emulator/v1/projects/${rehearsal.projectId}/databases/(default)/documents`,
    { method: "DELETE", headers: { authorization: "Bearer owner" } },
  );
}

/** Serve each renewed lease's recorded end date (true) or its current one (false). */
export function setRecordingCycles(rehearsal, on) {
  return writeFlags(rehearsal, { ...readFlags(rehearsal), recordingCycles: Boolean(on) });
}

/** Make one RentVine read fail as an outage would, for example "leases/statuses"; null clears. */
export function setRentvineOutage(rehearsal, path) {
  const file = rehearsal.files.rentvineOutage;
  if (path) writeFileSync(file, `${String(path).replace(/^\/+/, "")}\n`);
  else rmSync(file, { force: true });
  return { outage: path ?? null };
}

/**
 * L34: mark this month's comparison allowance reached (or open again) by writing the app's own
 * usage count in the Firestore emulator. The emulator's owner token is a fixed word, not a
 * credential, and this call is refused unless the emulator is on 127.0.0.1.
 */
export async function setComparisonAllowance(rehearsal, reached) {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const billed = reached ? REHEARSAL_COMPARISON_ALLOWANCE : 0;
  await call(
    `http://${rehearsal.firestoreEmulatorHost}`,
    `/v1/projects/${rehearsal.projectId}/databases/(default)/documents/rentcast_usage/${month}`,
    {
      method: "PATCH",
      headers: { authorization: "Bearer owner" },
      body: {
        fields: {
          billed_calls: { integerValue: String(billed) },
          updated_at: { stringValue: now.toISOString() },
        },
      },
    },
  );
  return { month, billedCalls: billed, allowance: REHEARSAL_COMPARISON_ALLOWANCE };
}

/**
 * Requests the provider boundary refused (L58), from every process of the run: the server, the
 * rehearsal process itself (stand-ins, seeding and its browser) and the driver. Each entry says
 * which of the three it came from.
 */
export function refusedConnections(rehearsal) {
  const logs = [
    ["server", rehearsal.files.networkLog],
    ["rehearsal", rehearsal.files.harnessNetworkLog],
    ["driver", rehearsal.files.driverNetworkLog],
  ];
  return logs.flatMap(([from, file]) => {
    if (!file || !existsSync(file)) return [];
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line);
          return entry.refused ? [{ from, ...entry }] : [];
        } catch {
          return [];
        }
      });
  });
}
