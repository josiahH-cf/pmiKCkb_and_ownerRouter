// S284 W12-05 (S276 AC-S276-3), harness only: the one-shot reminder-pause write fault the W12-05
// checks arm through the control hook. It refuses exactly one tenant-response pause write, only
// in a process that names the fault file (the rehearsal server), and a harness reset clears it.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  setTenantResponsePauseFault,
  tenantResponsePauseFault,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  installFirestoreFault,
  TENANT_RESPONSE_PAUSE_CAUSE,
} from "../../scripts/lib/one-path-rehearsal/firestore-fault.mjs";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function rehearsalWithFaultFile() {
  const directory = mkdtempSync(join(tmpdir(), "s284-w1205-fault-"));
  directories.push(directory);
  return { files: { firestoreFault: join(directory, "firestore-fault.json") } };
}
/** A stand-in for the Firestore client's Transaction class: set() reports what it would write. */
function fakeFirestore() {
  class Transaction {
    set(documentRef, data) {
      return { written: documentRef.path, data };
    }
  }
  return { Transaction };
}
const pausedForResponse = {
  state: "paused",
  pause: { cause: TENANT_RESPONSE_PAUSE_CAUSE, byUid: "local-demo-editor", atMs: 1 },
};

describe("S284 W12-05: the one-shot reminder-pause write fault", () => {
  it("refuses one tenant-response pause write while armed, then is spent", () => {
    const rehearsal = rehearsalWithFaultFile();
    const firestore = fakeFirestore();
    const records = [];
    expect(
      installFirestoreFault(
        rehearsal.files.firestoreFault,
        (entry) => records.push(entry),
        firestore,
      ),
    ).toBe(true);
    const transaction = new firestore.Transaction();
    const sequence = { path: "gmail_communication_sequences/one" };

    // Not armed: every write passes.
    expect(transaction.set(sequence, pausedForResponse).written).toBe(sequence.path);
    expect(setTenantResponsePauseFault(rehearsal, true)).toEqual({
      armed: true,
      fired: false,
    });
    // Armed: other writes pass, a pause under another cause included.
    expect(
      transaction.set(sequence, { state: "paused", pause: { cause: "staff" } }).written,
    ).toBe(sequence.path);
    expect(
      transaction.set(sequence, {
        ...pausedForResponse,
        pause: { ...pausedForResponse.pause, byUid: "communication-worker" },
      }).written,
    ).toBe(sequence.path);
    expect(transaction.set({ path: "audit/one" }, pausedForResponse).written).toBe(
      "audit/one",
    );
    // The pause the recorded response writes is refused once.
    expect(() => transaction.set(sequence, pausedForResponse)).toThrow(
      /refused on purpose/,
    );
    expect(tenantResponsePauseFault(rehearsal)).toEqual({ armed: false, fired: true });
    expect(
      JSON.parse(readFileSync(`${rehearsal.files.firestoreFault}.fired`, "utf8")).path,
    ).toBe(sequence.path);
    expect(records).toEqual([{ fault: "firestore_write_refused", path: sequence.path }]);
    // Spent: the retry and the worker's own hold write as before.
    expect(transaction.set(sequence, pausedForResponse).written).toBe(sequence.path);
    expect(setTenantResponsePauseFault(rehearsal, false)).toEqual({
      armed: false,
      fired: false,
    });
  });

  it("is installed once, and only for a named fault file", () => {
    const firestore = fakeFirestore();
    const original = firestore.Transaction.prototype.set;
    expect(installFirestoreFault(undefined, () => undefined, firestore)).toBe(false);
    expect(firestore.Transaction.prototype.set).toBe(original);
    expect(installFirestoreFault("unused-fault.json", () => undefined, firestore)).toBe(
      true,
    );
    const patched = firestore.Transaction.prototype.set;
    expect(installFirestoreFault("unused-fault.json", () => undefined, firestore)).toBe(
      true,
    );
    expect(firestore.Transaction.prototype.set).toBe(patched);
  });

  it("a rehearsal without a fault file refuses to arm it and reads it as off", () => {
    expect(() => setTenantResponsePauseFault({ files: {} }, true)).toThrow(
      /names no Firestore fault file/,
    );
    expect(tenantResponsePauseFault({ files: {} })).toEqual({
      armed: false,
      fired: false,
    });
  });

  it("only the rehearsal server names the fault file, and a harness reset clears it", () => {
    expect(read("scripts/one-path-rehearsal.mjs")).toContain(
      "ONE_PATH_REHEARSAL_FIRESTORE_FAULT: files.firestoreFault",
    );
    expect(read("tests/browser/renewal-novdec-journey-network.mjs")).toContain(
      "if (FIRESTORE_FAULT) installFirestoreFault(FIRESTORE_FAULT, record);",
    );
    // The worker tick runs without it, so its own hold is never refused.
    expect(read("scripts/lib/one-path-rehearsal/due-message-tick.mjs")).not.toContain(
      "ONE_PATH_REHEARSAL_FIRESTORE_FAULT",
    );
    expect(read("scripts/lib/one-path-rehearsal/reset.mjs")).toContain(
      "setTenantResponsePauseFault(rehearsal, false)",
    );
    // Application code never reads it.
    for (const path of [
      "lib/gmail-hub/sequence-store.ts",
      "lib/firestore/renewal-workspace.ts",
      "lib/environment/rehearsal-stand-in.ts",
    ])
      expect(read(path), path).not.toContain("FIRESTORE_FAULT");
  });
});
