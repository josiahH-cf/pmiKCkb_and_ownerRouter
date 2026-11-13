// S284 W12-14, harness only: the in-process seed scripts/lib/one-path-rehearsal/process-draft-seed.mjs
// starts. It writes one renewal process definition as the non-executable Draft that
// scripts/seed-process-definitions.ts writes in production, with the same literal placeholder
// owner and approver, through the served commit's own seed writer, into the rehearsal's Firestore
// emulator and nowhere else. It refuses to run unless the rehearsal's network boundary is loaded in
// this process and the emulator is on 127.0.0.1 under a rehearsal test project. It prints one JSON
// line: the definition id and whether it was created, updated or skipped.
import net from "node:net";

import type { SeedFirestore } from "@/lib/lease-renewal/process-definition-seed";

const LOOPBACK_HOST = /^127\.0\.0\.1:\d{1,5}$/;
const TEST_PROJECT = /^pmi-kc-kb-[a-z0-9-]+-test$/;
// The placeholders the production seed uses when no real staff is recorded.
const OWNER_UID = "process-owner-PLACEHOLDER";
const APPROVER_UID = "process-approver-PLACEHOLDER";

function assertRehearsal() {
  const fetchGuarded =
    (globalThis.fetch as { name?: string } | undefined)?.name === "guardedFetch";
  if (!fetchGuarded || net.Socket.prototype.connect.name !== "guardedConnect")
    throw new Error("The rehearsal network boundary is not loaded; nothing was written.");
  if (!LOOPBACK_HOST.test(process.env.FIRESTORE_EMULATOR_HOST ?? ""))
    throw new Error("The Firestore emulator is not on 127.0.0.1; nothing was written.");
  if (!TEST_PROJECT.test(process.env.FIREBASE_PROJECT_ID ?? ""))
    throw new Error("The project is not a rehearsal test project; nothing was written.");
}

async function main() {
  assertRehearsal();
  const definitionId = process.env.ONE_PATH_PROCESS_DRAFT ?? "";
  const { getAdminFirestore } = await import("@/lib/firestore/admin");
  const db = getAdminFirestore() as unknown as SeedFirestore;
  const now = new Date().toISOString();
  const options = { db, ownerUid: OWNER_UID, approverUid: APPROVER_UID, now };
  let result: unknown;
  if (definitionId === "owner-renewal-outreach") {
    const seed =
      await import("@/lib/lease-renewal/owner-renewal-outreach/process-definition-seed");
    result = await seed.seedOwnerRenewalOutreachDefinition(options);
  } else if (definitionId === "tenant-renewal-notice") {
    const seed =
      await import("@/lib/lease-renewal/tenant-renewal-notice/process-definition-seed");
    result = await seed.seedTenantRenewalNoticeDefinition(options);
  } else if (definitionId === "lease-renewal") {
    const seed = await import("@/lib/lease-renewal/process-definition-seed");
    result = await seed.seedLeaseRenewalDefinition(options);
  } else throw new Error(`No renewal process draft is named ${definitionId}.`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String((error as Error)?.stack ?? error)}\n`);
    process.exit(1);
  },
);
