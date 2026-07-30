import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  MAINTENANCE_OWNER_DRAFT_ACTION_KEY,
  RENEWAL_DRAFT_ACTION_KEY,
  resolveAskAction,
} from "@/lib/ask/action-intent";
import { matchRenewalTarget } from "@/lib/ask/renewal-target";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseAddressLabel } from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { getLiveLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { isProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";

const BodySchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    processId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

function leaseIdOf(view: RawLease): string | undefined {
  for (const key of ["leaseID", "leaseId", "id"]) {
    const value = view[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

// S33 read-only target lookup. Resolves the single lease a question names from the AUTHORITATIVE live
// RentVine read the desk already uses. It performs NO external effect (read only) and returns a value-free
// status. An ambiguous or empty read yields `no_match`; unconfigured live sources yield `not_configured`.
// Ask never invents a lease; a live action surfaces only on an unambiguous single match.
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "renewals");
    const { question, processId } = await parseJsonBody(request, BodySchema);

    const config = buildLiveRentVineConfig();
    if (!config.ok) {
      return NextResponse.json({ status: "not_configured", reason: config.reason });
    }

    const views = await getLiveLeaseViews(config.rentvineClient, Date.now());
    const candidates = views
      .map((view) => ({
        leaseId: leaseIdOf(view),
        addressLabel: leaseAddressLabel(view),
      }))
      .filter(
        (candidate): candidate is { leaseId: string; addressLabel: string } =>
          Boolean(candidate.leaseId) && Boolean(candidate.addressLabel),
      );

    const target = matchRenewalTarget(question, candidates);
    if (!target) {
      return NextResponse.json({ status: "no_match" });
    }
    // The gate check runs SERVER-SIDE (never a client seed import): resolveAskAction returns a route only
    // for an already-open action key, so a closed gate yields route:null and Ask surfaces no live affordance.
    const mappedActionKey =
      processId === "lease-renewal"
        ? RENEWAL_DRAFT_ACTION_KEY
        : processId === "maintenance-work-order-intake"
          ? MAINTENANCE_OWNER_DRAFT_ACTION_KEY
          : null;
    const mappedActionExecutable = mappedActionKey
      ? await isProductionRuntimeActionExecutable(mappedActionKey)
      : false;
    const route = resolveAskAction({
      detected: processId ? { processId } : null,
      target,
      isExecutable: (actionKey) =>
        actionKey === mappedActionKey && mappedActionExecutable,
    });
    return NextResponse.json({
      status: "ok",
      leaseId: target.leaseId,
      addressLabel: target.addressLabel,
      route,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
