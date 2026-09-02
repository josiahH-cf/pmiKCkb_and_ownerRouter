// S97 per-key live proof runner (owner-authorized bounded proof windows, 2026-09-02 grant).
//
// Mirrors the S30 proof posture: runs locally under fresh ADC with the managed identity, uses the
// deployed S97 execution service against live RentVine, persists claims/receipts in the production
// Firestore execution ledger, and echoes every exact value before an effect. The per-key
// committed-seed + runtime-suspension gates stay authoritative: with a key closed this runner can
// only propose, inspect, and reconcile. The designated lease and effect terms arrive via an
// untracked packet file; nothing here names a customer value.
//
// Usage (always with explicit production context):
//   ENVIRONMENT_KIND=production DATA_CONTEXT=live npx tsx scripts/prove-s97-renewal-writeback.ts \
//     <propose|status|execute|reconcile|reverse-preview|reverse-execute|discard> \
//     [--packet=temp/s97-proof-packet.json] [--index=0]

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
import {
  RenewalWritebackService,
  leaseDateStateOf,
} from "@/lib/lease-renewal/writeback/execution-service";
import {
  assertRenewalWritebackExecutionAllowed,
  buildLiveRenewalWritebackDeps,
} from "@/lib/lease-renewal/writeback/live";
import {
  RENEWAL_WRITEBACK_ACCOUNT,
  buildRenewalWritebackProposal,
  projectRecurringCharge,
  renewalWritebackExecutionId,
  type RenewalWritebackEffectInput,
  type RenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";
import {
  discardRenewalWritebackProposal,
  getRenewalWritebackProposal,
  saveRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-store";

const OWNER_EMAIL = "josiah@pmikcmetro.com";

interface PacketEffect {
  kind: "renewal_dates_update" | "recurring_charge_update" | "recurring_charge_create";
  after?: { endDate?: string | null; increaseEligibilityDate?: string | null };
  chargeId?: string;
  changes?: Record<string, string | null>;
  create?: Record<string, string>;
}

interface ProofPacket {
  leaseId: string;
  evidenceRef: string;
  effects: PacketEffect[];
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
  return join("temp", `s97-reversal-${effectHash.slice(0, 12)}.json`);
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (!operation) {
    throw new Error(
      "operation required: propose|status|execute|reconcile|reverse-preview|reverse-execute|discard",
    );
  }
  const descriptor = requireEnvironmentDescriptor();
  console.log(
    `descriptor: ${descriptor.environmentKind}+${descriptor.dataContext} account=${RENEWAL_WRITEBACK_ACCOUNT}`,
  );
  const deps = buildLiveRenewalWritebackDeps(descriptor);
  if ("status" in deps) throw new Error("RentVine provider is not configured locally.");
  // Force the durable production ledger (never a memory store) before any effect.
  getAdminFirestore();
  const actor = await ownerActor();
  console.log(`actor: ${OWNER_EMAIL} uid=${actor.uid.slice(0, 8)}… role=Admin`);
  const service = new RenewalWritebackService(deps);

  if (operation === "propose") {
    const packetPath = argValue("packet", "temp/s97-proof-packet.json");
    const packet = JSON.parse(readFileSync(packetPath, "utf8")) as ProofPacket;
    await assertRenewalWritebackExecutionAllowed(descriptor, "recovery");
    const leaseState = leaseDateStateOf(await deps.reads.getLease(packet.leaseId));
    console.log("fresh lease state:", JSON.stringify(leaseState));
    const effects: RenewalWritebackEffectInput[] = [];
    for (const effect of packet.effects) {
      if (effect.kind === "renewal_dates_update") {
        effects.push({
          kind: effect.kind,
          before: leaseState,
          after: effect.after ?? {},
        });
      } else if (effect.kind === "recurring_charge_update") {
        const before = projectRecurringCharge(
          await deps.reads.getRecurringCharge(packet.leaseId, String(effect.chargeId)),
        );
        console.log("fresh charge before:", JSON.stringify(before));
        effects.push({
          kind: effect.kind,
          chargeId: String(effect.chargeId),
          before,
          changes: (effect.changes ?? {}) as never,
        });
      } else {
        effects.push({ kind: effect.kind, create: (effect.create ?? {}) as never });
      }
    }
    const proposal = buildRenewalWritebackProposal({
      leaseId: packet.leaseId,
      account: RENEWAL_WRITEBACK_ACCOUNT,
      actorUid: actor.uid,
      actorEmail: OWNER_EMAIL,
      actorRole: "Admin",
      leaseState,
      sourceReadAtIso: new Date().toISOString(),
      evidenceRef: packet.evidenceRef,
      effects,
      nowMs: Date.now(),
    });
    await saveRenewalWritebackProposal(actor, proposal);
    console.log(`proposal saved previewHash=${proposal.previewHash}`);
    for (const entry of proposal.effects) {
      console.log(
        `  effect[${entry.index}] ${entry.actionKey} hash=${entry.effectHash} reversal=${entry.reversal.kind}`,
      );
      console.log(`    exact: ${JSON.stringify(entry.effect)}`);
    }
    return;
  }

  const leaseId = argValue("lease", "115");
  const proposal = (await getRenewalWritebackProposal(
    actor,
    leaseId,
  )) as RenewalWritebackProposal | null;
  if (!proposal) throw new Error(`no active proposal for lease ${leaseId}`);

  if (operation === "discard") {
    await discardRenewalWritebackProposal(actor, leaseId);
    console.log("proposal discarded (app-plane only).");
    return;
  }

  if (operation === "status") {
    console.log(`proposal previewHash=${proposal.previewHash}`);
    console.log(`confirmation expires ${proposal.confirmationExpiresAtIso}`);
    for (const entry of proposal.effects) {
      const record = await deps.store.get(renewalWritebackExecutionId(proposal, entry));
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
    await assertRenewalWritebackExecutionAllowed(
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
    if (outcome.createdChargeId) {
      console.log(`created charge id=${outcome.createdChargeId}`);
    }
    return;
  }

  if (operation === "reconcile") {
    await assertRenewalWritebackExecutionAllowed(descriptor, "recovery");
    const receipt = await service.reconcileEffect({
      proposal,
      effectHash: effect.effectHash,
    });
    console.log(
      `RECONCILED providerRef=${receipt.providerRef} outcome=${receipt.outcome ?? "succeeded"}`,
    );
    return;
  }

  if (operation === "reverse-preview") {
    await assertRenewalWritebackExecutionAllowed(descriptor, "recovery");
    const preview = await service.previewReversal({
      proposal,
      effectHash: effect.effectHash,
    });
    const path = reversalFilePath(effect.effectHash);
    writeFileSync(path, `${JSON.stringify(preview, null, 2)}\n`);
    console.log(
      `REVERSAL PREVIEW kind=${preview.kind} previewHash=${preview.previewHash} expires=${preview.expiresAtIso}`,
    );
    console.log(`written to ${path}; confirm with reverse-execute`);
    return;
  }

  if (operation === "reverse-execute") {
    await assertRenewalWritebackExecutionAllowed(
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

  throw new Error(`unknown operation ${operation}`);
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
