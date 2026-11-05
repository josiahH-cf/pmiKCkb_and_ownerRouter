// S254 R-S254-3: the rehearsal's own Firestore emulator through the Admin SDK, for a candidate-only
// seed that writes the documents an Admin or staff member would otherwise prepare by hand (S253's
// forms seed is the first). It opens the emulator on 127.0.0.1 that the rehearsal description
// names, under the rehearsal's test project, and refuses anything else. With
// FIRESTORE_EMULATOR_HOST set the Admin SDK uses no credential and reaches no other host; the
// rehearsal process also runs under the provider boundary, which refuses every other connection.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APP_NAME = "one-path-rehearsal";
const PROJECT_ID = "pmi-kc-kb-one-path-rehearsal-test";

/** The rehearsal's emulator database. Throws unless this process is bound to that emulator. */
export function openRehearsalDatabase(rehearsal) {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  assert.match(
    host,
    /^127\.0\.0\.1:\d{1,5}$/,
    "The rehearsal database is a Firestore emulator on 127.0.0.1 only.",
  );
  assert.equal(
    host,
    rehearsal?.firestoreEmulatorHost,
    "This process is bound to another Firestore emulator than the rehearsal names.",
  );
  assert.equal(
    rehearsal?.projectId,
    PROJECT_ID,
    "The rehearsal database belongs to the rehearsal's test project only.",
  );
  const app =
    getApps().find((entry) => entry.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  return getFirestore(app);
}
