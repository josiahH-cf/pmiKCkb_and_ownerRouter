// Read-only inspection of the completed S98 proof ledger. Every proof mutation path is permanently
// retired; this command can only display the existing sealed-proof proposal and durable receipts.
//
// Usage (always with explicit production context and the write switch only inside a window):
//   ENVIRONMENT_KIND=production DATA_CONTEXT=live \
//     npx tsx scripts/prove-s98-sheet-writeback.ts status

import { readFileSync } from "node:fs";

for (const file of [".env.local", ".env.production.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^"|"$/g, "");
      }
    }
  } catch {
    // Optional file; ambient environment stays authoritative.
  }
}

import { getAuth } from "firebase-admin/auth";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  OPERATING_SHEET_TAB,
  buildLiveSheetWritebackDeps,
  liveOperatingSheetId,
} from "@/lib/lease-renewal/sheet-writeback/live";
import { sheetWritebackExecutionId } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { getSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-store";

const OWNER_EMAIL = "josiah@pmikcmetro.com";

async function ownerActor(): Promise<AuthenticatedUser> {
  const record = await getAuth().getUserByEmail(OWNER_EMAIL);
  return {
    uid: record.uid,
    email: OWNER_EMAIL,
    role: "Admin",
    spaces: ["renewals"],
  } as unknown as AuthenticatedUser;
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (operation !== "status") {
    throw new Error(
      "The completed S98 proof is permanently retired; only read-only `status` inspection remains.",
    );
  }
  const descriptor = requireEnvironmentDescriptor();
  console.log(`descriptor: ${descriptor.environmentKind}+${descriptor.dataContext}`);
  const spreadsheetId = liveOperatingSheetId();
  if (!spreadsheetId) throw new Error("RENEWAL_SHEET_ID is not configured locally.");
  const deps = buildLiveSheetWritebackDeps(descriptor);
  if ("status" in deps) throw new Error("Operating sheet is not configured locally.");
  const actor = await ownerActor();
  console.log(`actor: ${OWNER_EMAIL} uid=${actor.uid.slice(0, 8)}… role=Admin`);

  const proposal = await getSheetWritebackProposal(
    actor,
    spreadsheetId,
    OPERATING_SHEET_TAB,
    { kind: "sealed_proof" },
  );
  if (!proposal) throw new Error("no active operating-sheet proposal");
  console.log(`proposal previewHash=${proposal.previewHash}`);
  console.log(`confirmation expires ${proposal.confirmationExpiresAtIso}`);
  for (const entry of proposal.effects) {
    const record = await deps.store.get(sheetWritebackExecutionId(proposal, entry));
    console.log(
      `  effect[${entry.index}] ${entry.actionKey} state=${record?.state ?? "not_started"} receipt=${record?.receipt?.providerRef ?? "-"}`,
    );
  }
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
