import { headers } from "next/headers";
import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  assertRenewalWritebackExecutionAllowed as assertLiveWritebackAllowed,
  buildLiveRenewalWritebackDeps as buildLiveReadbackDeps,
} from "../../../lib/lease-renewal/writeback/live";
import {
  hasCompiledRehearsalCapability,
  resolveRehearsalMail,
} from "./s260-compiled-mail";

function hasSyntheticRentVine() {
  return (
    process.env.RENTVINE_API_BASE_URL === "https://pmikcmetro.rentvine.com/api/manager" &&
    process.env.RENTVINE_API_KEY === "synthetic-rehearsal-key" &&
    process.env.RENTVINE_API_SECRET === "synthetic-rehearsal-secret"
  );
}

export async function assertRenewalWritebackExecutionAllowed(
  descriptor: EnvironmentDescriptor,
  mode: "mutating" | "recovery",
  actionKey?: string,
) {
  if (mode === "recovery" && hasSyntheticRentVine()) {
    const requestHeaders = await headers();
    if (hasCompiledRehearsalCapability(requestHeaders.get("x-s260-source-preview"))) {
      return;
    }
  }
  return assertLiveWritebackAllowed(descriptor, mode, actionKey);
}

function refuseSourceWrite(): never {
  throw new Error("The compiled source-preview fixture refuses every source write.");
}

export function buildLiveRenewalWritebackDeps(descriptor: EnvironmentDescriptor) {
  if (!resolveRehearsalMail() || !hasSyntheticRentVine())
    return { status: "not_configured" } as const;
  const dependencies = buildLiveReadbackDeps(descriptor);
  if ("status" in dependencies) return dependencies;
  // The rehearsal's existing network guard supplies the synthetic RentVine GETs.
  // No effect can construct a writer, enter a provider action or acquire a claim.
  return {
    ...dependencies,
    createWriter: refuseSourceWrite,
    gateFor: () => ({ isExecutable: async () => false, run: refuseSourceWrite }),
    claimActiveEffect: refuseSourceWrite,
  };
}
