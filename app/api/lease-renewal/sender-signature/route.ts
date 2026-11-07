import { NextResponse } from "next/server";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { readBusinessProfile } from "@/lib/firestore/presentation-settings";
import { getRetainedSenderSignature } from "@/lib/firestore/renewal-sender-signatures";
import {
  readSenderSignatureChoice,
  saveSenderSignatureChoice,
} from "@/lib/firestore/renewal-sender-signature-choice";
import { SaveSenderSignatureChoiceSchema } from "@/lib/lease-renewal/sender-signature-choice";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

const options = { headers: { "Cache-Control": "private, no-store" } };

export async function GET() {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const [choice, retained, profile] = await Promise.all([
      readSenderSignatureChoice(actor),
      getRetainedSenderSignature(actor),
      readBusinessProfile(actor).catch(() => null),
    ]);
    return NextResponse.json(
      {
        choice,
        retained: retained?.signature ?? null,
        profile: profile?.profile ?? null,
      },
      options,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_sender_signature"),
      "renewals",
    );
    const input = await parseJsonBody(request, SaveSenderSignatureChoiceSchema);
    return NextResponse.json(
      { choice: await saveSenderSignatureChoice(actor, input) },
      options,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
