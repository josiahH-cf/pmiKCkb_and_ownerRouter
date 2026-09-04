import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { hasSpaceAccess, requireCapability } from "@/lib/auth/session";
import { runAssistantQuery } from "@/lib/assistant/query";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { WorkAccountabilityStore } from "@/lib/firestore/work-accountability";
import { loadRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";

// S110: the Dashboard assistant's one read-only boundary. The body carries the question text and
// nothing else: the actor, their role, their Space access, the intent, and every filter are derived
// server-side, so no caller can widen the query. Every path reads through an owning service; none
// writes, starts a run, drafts, or reaches a provider.
export const dynamic = "force-dynamic";

const RequestSchema = z.object({ question: z.string().trim().min(1).max(500) }).strict();

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const body = await parseJsonBody(request, RequestSchema);
    const now = new Date();
    const envelope = await runAssistantQuery({ question: body.question }, user, {
      nowIso: now.toISOString(),
      hasRenewalsAccess: hasSpaceAccess(user, "renewals"),
      loadWorkSnapshot: async (actor) =>
        new WorkAccountabilityStore({ db: getAdminFirestore() }).listSnapshot(
          actor,
          "mine",
        ),
      loadRenewalRows: async (actor) => {
        const source = await loadRenewalAssistantSource(actor, now);
        if (source.outcome.status !== "ok") {
          return { status: source.outcome.status, rows: [] };
        }
        return {
          status: "ok" as const,
          rows: source.outcome.view.items,
          degraded: source.auxiliaryFailures.map((failure) => failure.key),
        };
      },
    });
    return NextResponse.json(envelope);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
