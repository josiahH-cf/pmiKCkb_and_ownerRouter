// S284 W12-05 (S276 AC-S276-3), harness only: a one-shot write fault in the rehearsal server's own
// Firestore client, so a journey can see what staff see when the reminder pause that saving a
// tenant response writes could not be written. Nothing in the application changes: the provider
// boundary preload (tests/browser/renewal-novdec-journey-network.mjs) installs this only in a
// process whose environment names the fault file (the rehearsal server's, never the tick's or a
// driver's), and it acts only while that file exists.
//
// While the file exists, the next transaction write that stores a communication paused under
// "tenant_response_recorded" throws before anything is committed, so that one transaction fails
// as a refused write would. The file is renamed to "<file>.fired" (with when and which document)
// in the same step, so the fault fires once and later writes, a "Stop them" retry and the worker's
// own hold included, are untouched. The control hook (setTenantResponsePauseFault in control.mjs)
// writes, removes and reads these files.
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/** The pause cause S276 writes when staff record a tenant response (R-S276-2). */
export const TENANT_RESPONSE_PAUSE_CAUSE = "tenant_response_recorded";

const staffReminderPause = (path, data) =>
  Boolean(
    typeof path === "string" &&
    /^gmail_communication_sequences\/[^/]+$/.test(path) &&
    data &&
    typeof data === "object" &&
    data.state === "paused" &&
    data.pause &&
    typeof data.pause === "object" &&
    data.pause.cause === TENANT_RESPONSE_PAUSE_CAUSE &&
    typeof data.pause.byUid === "string" &&
    data.pause.byUid !== "communication-worker",
  );

/** Take the armed fault, once: true for exactly one caller while the file exists. */
function take(file, path) {
  if (!existsSync(file)) return false;
  try {
    renameSync(file, `${file}.fired`);
  } catch {
    return false;
  }
  try {
    writeFileSync(
      `${file}.fired`,
      `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, path })}\n`,
    );
  } catch {
    // The rename alone already records that it fired.
  }
  return true;
}

/** This process's Firestore client: the copy firebase-admin loads, resolved as the app does. */
function processFirestore() {
  try {
    return createRequire(join(process.cwd(), "package.json"))("@google-cloud/firestore");
  } catch {
    return null;
  }
}

/**
 * Install the fault in this process's Firestore client (or in `firestore`, a module with the
 * same Transaction class, for a test). Returns whether it was installed; a process without the
 * client is left as it is.
 */
export function installFirestoreFault(file, record = () => undefined, firestore) {
  if (!file) return false;
  const prototype = (firestore ?? processFirestore())?.Transaction?.prototype;
  if (!prototype || typeof prototype.set !== "function") return false;
  if (prototype.set.name === "faultedTransactionSet") return true;
  const original = prototype.set;
  prototype.set = function faultedTransactionSet(documentRef, data, ...rest) {
    const path = documentRef?.path;
    if (staffReminderPause(path, data) && take(file, path)) {
      record({ fault: "firestore_write_refused", path });
      throw new Error(
        "Rehearsal fault (S284 W12-05): this reminder pause write was refused on purpose.",
      );
    }
    return original.call(this, documentRef, data, ...rest);
  };
  return true;
}
