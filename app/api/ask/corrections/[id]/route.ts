import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getAskCorrection,
  setAskCorrectionStatus,
} from "@/lib/firestore/ask-corrections";
import { createPlaceholder } from "@/lib/firestore/editable";
import { proposeKbEntryFromCorrection } from "@/lib/kb-corrections/propose";

const DecideSchema = z.object({ decision: z.enum(["approve", "dismiss"]) });

interface RouteContext {
  params: Promise<{ id: string }>;
}

// S32 review lane (Admin-only). Approve is the ONLY path that acts: it files the proposed KB entry as a
// DRAFT placeholder through the existing editable layer (which then follows its own approval-queue
// lifecycle) and marks the correction Approved. Dismiss marks it Dismissed. Neither turns a correction
// directly into an active KB entry, a re-rank weight, or a tracked eval fixture.
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("manageAdmin");
    const { id } = await context.params;
    const { decision } = await parseJsonBody(request, DecideSchema);

    if (decision === "dismiss") {
      const correction = await setAskCorrectionStatus(user, id, "Dismissed");
      return NextResponse.json({ correction });
    }

    const existing = await getAskCorrection(user, id);
    if (!existing) {
      return NextResponse.json(
        { error: "This correction does not exist." },
        { status: 404 },
      );
    }
    // File the proposed KB entry as a Draft placeholder (it still needs its own approval).
    const proposal = proposeKbEntryFromCorrection(existing);
    const placeholder = await createPlaceholder(
      user,
      proposal.space_id,
      proposal.placeholder,
    );
    const correction = await setAskCorrectionStatus(user, id, "Approved");
    return NextResponse.json({ correction, placeholder });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
