// S284 W12-03, harness only: the other app instance scripts/lib/one-path-rehearsal/lease-reads-elsewhere.mjs
// starts. Until its stop file appears (or its time runs out) it admits one lease read every
// interval through the served commit's own notice admission, as an instance does before each
// RentVine read, and starts no read itself. It writes only the rehearsal's Firestore emulator and
// refuses to run unless the rehearsal's network boundary is loaded in this process, the emulator is
// on 127.0.0.1 under a rehearsal test project and the environment is the Demo one. It prints one
// JSON line when its first admission landed ({"ready":true}) and one with its counts at the end.
import { existsSync } from "node:fs";
import net from "node:net";

import type { AuthenticatedUser } from "@/lib/auth/session";

const LOOPBACK_HOST = /^127\.0\.0\.1:\d{1,5}$/;
const TEST_PROJECT = /^pmi-kc-kb-[a-z0-9-]+-test$/;
// A synthetic reader of the managed domain: the admission requires read authority, nothing more.
const OTHER_INSTANCE: AuthenticatedUser = {
  uid: "rehearsal-other-instance",
  email: "rehearsal-other-instance@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function assertRehearsal() {
  const fetchGuarded =
    (globalThis.fetch as { name?: string } | undefined)?.name === "guardedFetch";
  if (!fetchGuarded || net.Socket.prototype.connect.name !== "guardedConnect")
    throw new Error("The rehearsal network boundary is not loaded; nothing was written.");
  if (!LOOPBACK_HOST.test(process.env.FIRESTORE_EMULATOR_HOST ?? ""))
    throw new Error("The Firestore emulator is not on 127.0.0.1; nothing was written.");
  if (!TEST_PROJECT.test(process.env.FIREBASE_PROJECT_ID ?? ""))
    throw new Error("The project is not a rehearsal test project; nothing was written.");
  if (process.env.ENVIRONMENT_KIND !== "demo" || process.env.LOCAL_DEMO_AUTH !== "true")
    throw new Error(
      "This runs only in the rehearsal's Demo environment; nothing was written.",
    );
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function main() {
  assertRehearsal();
  const stopFile = process.env.ONE_PATH_ELSEWHERE_STOP ?? "";
  if (!stopFile) throw new Error("No stop file was named; nothing was written.");
  const intervalMs = Math.max(
    50,
    Number(process.env.ONE_PATH_ELSEWHERE_INTERVAL_MS) || 250,
  );
  const deadline =
    Date.now() +
    Math.max(1, Number(process.env.ONE_PATH_ELSEWHERE_MAX_SECONDS) || 300) * 1000;
  const { getAdminFirestore } = await import("@/lib/firestore/admin");
  const { withRenewalNoticeAdmission } =
    await import("@/lib/firestore/renewal-notice-safety");
  const reader = withRenewalNoticeAdmission(OTHER_INSTANCE, {}, getAdminFirestore());
  let admissions = 0;
  let refused = 0;
  while (!existsSync(stopFile) && Date.now() < deadline) {
    try {
      await reader.beforeLeaseSourceRead(Date.now());
      admissions += 1;
      if (admissions === 1) process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
    } catch {
      // A contended admission is retried on the next interval, as another instance would.
      refused += 1;
    }
    await pause(intervalMs);
  }
  process.stdout.write(`${JSON.stringify({ admissions, refused })}\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String((error as Error)?.stack ?? error)}\n`);
    process.exit(1);
  },
);
