// S98 per-key live proof runner (owner-authorized bounded proof windows). Mirrors the S97 runner:
// local ADC + Sheets DWD, the deployed S98 service, and production-ledger receipts with every
// exact value echoed. The committed per-key gates and the operating-write switch stay
// authoritative. ONLY this runner's packet path can produce the sealed proof append mode; the
// packet arrives untracked and is never committed.
//
// Usage (always with explicit production context and the write switch only inside a window):
//   ENVIRONMENT_KIND=production DATA_CONTEXT=live LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=true \
//     npx tsx scripts/prove-s98-sheet-writeback.ts <propose|status|execute|reconcile|\
//     reverse-preview|reverse-execute|reverse-reconcile|discard> [--packet=...] [--index=0]

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
import { getAdminFirestore } from "@/lib/firestore/admin";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import {
  SheetWritebackService,
  hashSheetHeader,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  OPERATING_SHEET_TAB,
  assertSheetWritebackV2ExecutionAllowed,
  buildLiveSheetWritebackDeps,
  liveOperatingSheetId,
} from "@/lib/lease-renewal/sheet-writeback/live";
import {
  buildSheetWritebackProposal,
  sheetWritebackExecutionId,
  type SheetWritebackEffectInput,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  discardSheetWritebackProposal,
  getSheetWritebackProposal,
  saveSheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";

const OWNER_EMAIL = "josiah@pmikcmetro.com";

interface ProofPacket {
  evidenceRef: string;
  effects: (
    | {
        kind: "row_append";
        mode: "normal" | "proof";
        leaseId: string;
        propertyId: string;
        tenantName: string;
        fields?: Record<string, { value: string; source: string }>;
      }
    | {
        kind: "field_update";
        field: string;
        rowNumber: number;
        rowKey: string | null;
        afterValue: string;
        source: string;
      }
  )[];
}

function argValue(name: string, fallback: string): string {
  const match = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

async function ownerActor(): Promise<AuthenticatedUser> {
  const record = await getAuth().getUserByEmail(OWNER_EMAIL);
  return {
    uid: record.uid,
    email: OWNER_EMAIL,
    role: "Admin",
    spaces: ["renewals"],
  } as unknown as AuthenticatedUser;
}

function reversalFilePath(effectHash: string): string {
  return join("temp", `s98-reversal-${effectHash.slice(0, 12)}.json`);
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (!operation) {
    throw new Error(
      "operation required: propose|status|execute|reconcile|reverse-preview|reverse-execute|reverse-reconcile|discard",
    );
  }
  const descriptor = requireEnvironmentDescriptor();
  console.log(`descriptor: ${descriptor.environmentKind}+${descriptor.dataContext}`);
  const spreadsheetId = liveOperatingSheetId();
  if (!spreadsheetId) throw new Error("RENEWAL_SHEET_ID is not configured locally.");
  const deps = buildLiveSheetWritebackDeps(descriptor);
  if ("status" in deps) throw new Error("Operating sheet is not configured locally.");
  getAdminFirestore();
  const actor = await ownerActor();
  console.log(`actor: ${OWNER_EMAIL} uid=${actor.uid.slice(0, 8)}… role=Admin`);
  const service = new SheetWritebackService(deps);

  if (operation === "propose") {
    const packetPath = argValue("packet", "temp/s98-proof-packet.json");
    const packet = JSON.parse(readFileSync(packetPath, "utf8")) as ProofPacket;
    await assertSheetWritebackV2ExecutionAllowed(descriptor, "recovery");
    const writer = deps.createWriter();
    const headerRows = await writer.getValues(
      spreadsheetId,
      `'${OPERATING_SHEET_TAB}'!A1:AZ1`,
    );
    const header = headerRows[0] ?? [];
    const resolution = resolveHeaders([header], RENEWAL_TAB_SCHEMAS.Renewals);
    const columns = new Map<string, number>();
    for (const column of resolution.columns) {
      if (column.field !== null && column.status === "resolved") {
        columns.set(column.field, column.index);
      }
    }
    const tenantColumnIndex = columns.get("tenant_name");
    if (tenantColumnIndex === undefined) throw new Error("tenant column unresolved");
    console.log(
      `header: width=${header.length} tenantColumn=${tenantColumnIndex} resolved=${columns.size}`,
    );

    const effects: SheetWritebackEffectInput[] = [];
    for (const effect of packet.effects) {
      if (effect.kind === "row_append") {
        effects.push({
          kind: "row_append",
          mode: effect.mode,
          operationId: `op-${randomUUID()}`,
          leaseId: effect.leaseId,
          propertyId: effect.propertyId,
          tenantName: effect.tenantName,
          fields: effect.fields ?? {},
        });
      } else {
        const letter = (index: number) => {
          let value = index;
          let letters = "";
          do {
            letters = String.fromCharCode(65 + (value % 26)) + letters;
            value = Math.floor(value / 26) - 1;
          } while (value >= 0);
          return letters;
        };
        const fieldColumn = columns.get(effect.field);
        if (fieldColumn === undefined)
          throw new Error(`field ${effect.field} unresolved`);
        const cellRows = await writer.getValues(
          spreadsheetId,
          `'${OPERATING_SHEET_TAB}'!${letter(fieldColumn)}${effect.rowNumber}:${letter(fieldColumn)}${effect.rowNumber}`,
        );
        const tenantRows = await writer.getValues(
          spreadsheetId,
          `'${OPERATING_SHEET_TAB}'!${letter(tenantColumnIndex)}${effect.rowNumber}:${letter(tenantColumnIndex)}${effect.rowNumber}`,
        );
        effects.push({
          kind: "field_update",
          field: effect.field,
          rowNumber: effect.rowNumber,
          rowKey: effect.rowKey,
          anchorTenantName: tenantRows[0]?.[0] ?? "",
          expectedValue: cellRows[0]?.[0] ?? "",
          afterValue: effect.afterValue,
          source: effect.source,
        });
      }
    }
    const proposal = buildSheetWritebackProposal({
      spreadsheetId,
      tabTitle: OPERATING_SHEET_TAB,
      headerHash: hashSheetHeader(header, columns),
      headerWidth: header.length,
      tenantColumnIndex,
      actorUid: actor.uid,
      actorEmail: OWNER_EMAIL,
      actorRole: "Admin",
      sourceReadAtIso: new Date().toISOString(),
      evidenceRef: packet.evidenceRef,
      effects,
      nowMs: Date.now(),
    });
    await saveSheetWritebackProposal(actor, proposal);
    console.log(`proposal saved previewHash=${proposal.previewHash}`);
    for (const entry of proposal.effects) {
      console.log(
        `  effect[${entry.index}] ${entry.actionKey} hash=${entry.effectHash} reversal=${entry.reversal.kind}`,
      );
      console.log(`    exact: ${JSON.stringify(entry.effect)}`);
    }
    return;
  }

  const proposal = (await getSheetWritebackProposal(
    actor,
    spreadsheetId,
    OPERATING_SHEET_TAB,
  )) as SheetWritebackProposal | null;
  if (!proposal) throw new Error("no active operating-sheet proposal");

  if (operation === "discard") {
    await discardSheetWritebackProposal(actor, spreadsheetId, OPERATING_SHEET_TAB);
    console.log("proposal discarded (app-plane only).");
    return;
  }

  if (operation === "status") {
    console.log(`proposal previewHash=${proposal.previewHash}`);
    console.log(`confirmation expires ${proposal.confirmationExpiresAtIso}`);
    for (const entry of proposal.effects) {
      const record = await deps.store.get(sheetWritebackExecutionId(proposal, entry));
      console.log(
        `  effect[${entry.index}] ${entry.actionKey} state=${record?.state ?? "not_started"} receipt=${record?.receipt?.providerRef ?? "-"}`,
      );
    }
    return;
  }

  const index = Number(argValue("index", "0"));
  const effect = proposal.effects[index];
  if (!effect) throw new Error(`no effect at index ${index}`);
  console.log(`target effect[${index}] ${effect.actionKey} hash=${effect.effectHash}`);
  console.log(`exact effect: ${JSON.stringify(effect.effect)}`);

  if (operation === "execute") {
    await assertSheetWritebackV2ExecutionAllowed(
      descriptor,
      "mutating",
      effect.actionKey,
    );
    const outcome = await service.executeEffect({
      proposal,
      effectHash: effect.effectHash,
      confirmation: {
        previewHash: proposal.previewHash,
        effectHash: effect.effectHash,
        confirmedAtIso: new Date().toISOString(),
      },
    });
    console.log(
      `EXECUTED duplicate=${outcome.duplicate} providerRef=${outcome.receipt.providerRef} resultHash=${outcome.receipt.resultHash}`,
    );
    if (outcome.appendedRowNumber !== undefined) {
      console.log(`appended at sheet row ${outcome.appendedRowNumber}`);
    }
    return;
  }

  if (operation === "reconcile") {
    await assertSheetWritebackV2ExecutionAllowed(descriptor, "recovery");
    const receipt = await service.reconcileEffect({
      proposal,
      effectHash: effect.effectHash,
    });
    console.log(`RECONCILED providerRef=${receipt.providerRef}`);
    return;
  }

  if (operation === "reverse-preview") {
    await assertSheetWritebackV2ExecutionAllowed(descriptor, "recovery");
    const preview = await service.previewReversal({
      proposal,
      effectHash: effect.effectHash,
    });
    const path = reversalFilePath(effect.effectHash);
    writeFileSync(path, `${JSON.stringify(preview, null, 2)}\n`);
    console.log(
      `REVERSAL PREVIEW kind=${preview.kind} previewHash=${preview.previewHash} expires=${preview.expiresAtIso}` +
        (preview.currentRowNumber !== undefined
          ? ` currentRow=${preview.currentRowNumber}`
          : ""),
    );
    console.log(`written to ${path}; confirm with reverse-execute`);
    return;
  }

  if (operation === "reverse-execute") {
    await assertSheetWritebackV2ExecutionAllowed(
      descriptor,
      "mutating",
      effect.actionKey,
    );
    const preview = JSON.parse(readFileSync(reversalFilePath(effect.effectHash), "utf8"));
    const outcome = await service.executeReversal({
      proposal,
      effectHash: effect.effectHash,
      reversal: preview,
      confirmedAtIso: new Date().toISOString(),
    });
    console.log(
      `REVERSED duplicate=${outcome.duplicate} providerRef=${outcome.receipt.providerRef} resultHash=${outcome.receipt.resultHash}`,
    );
    return;
  }

  if (operation === "reverse-reconcile") {
    await assertSheetWritebackV2ExecutionAllowed(descriptor, "recovery");
    const receipt = await service.reconcileReversal({
      proposal,
      effectHash: effect.effectHash,
    });
    console.log(
      `REVERSAL RECONCILED providerRef=${receipt.providerRef} resultHash=${receipt.resultHash}`,
    );
    return;
  }

  throw new Error(`unknown operation ${operation}`);
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
