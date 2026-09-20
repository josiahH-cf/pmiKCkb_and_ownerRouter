import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  decideArtifactFamily,
  readArtifactIntakeManifest,
  receiveArtifactFamily,
  recordArtifactFieldMap,
} from "@/lib/firestore/lease-artifact-intake";
import {
  DecideArtifactFamilyInputSchema,
  ReceiveArtifactInputSchema,
  RecordArtifactFieldMapInputSchema,
} from "@/lib/lease-documents/artifact-intake-contract";
import { projectIntakeCheckpoints } from "@/lib/lease-documents/artifact-intake";

// S130 (F10): Admin surface for the seven-family lease-artifact intake. Admin-only, server-only
// writes through the Admin SDK. GET returns the manifest and the receipt-time checkpoints; POST
// receives one family's file through the trusted publication path (never a public upload); PUT
// records the reviewed field and signer map; PATCH approves or rejects that exact version. Nothing
// here connects a provider, opens an action key, uploads a document or fills a form.
export async function GET() {
  try {
    await requireCapability("manageAdmin");
    const manifest = await readArtifactIntakeManifest();
    return NextResponse.json({
      artifactIntake: {
        manifest,
        checkpoints: projectIntakeCheckpoints({
          manifest,
          filledValuesVerified: false,
          packetState: null,
          providerReceiptId: null,
          returnedStateInspected: false,
        }),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, ReceiveArtifactInputSchema);
    const result = await receiveArtifactFamily(user, input);
    return NextResponse.json({ artifactIntake: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, RecordArtifactFieldMapInputSchema);
    const entry = await recordArtifactFieldMap(user, input);
    return NextResponse.json({ artifactIntake: { entry, duplicate: false } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, DecideArtifactFamilyInputSchema);
    const result = await decideArtifactFamily(user, input);
    return NextResponse.json({ artifactIntake: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
