import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapability } from "@/lib/auth/session";
import { checkDotloopSelection } from "@/lib/connections/dotloop-resource-selection";
import { FirestoreConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { FirestoreDotloopObservationStore } from "@/lib/firestore/dotloop-connection-observations";
import {
  getDotloopRenewalSettings,
  selectDotloopRenewalSettings,
} from "@/lib/firestore/dotloop-renewal-settings";
import { EditableLayerError } from "@/lib/firestore/errors";
import { DOTLOOP_TRANSACTION_TYPES } from "@/lib/integrations/dotloop/client";

// S106 (AC-S106-6): read or set the exact Dotloop profile, renewal template, transaction type and
// initial status used for renewal packets. Reading needs read access; setting is Admin-only and is
// verified against the current connection's fresh resource observation: unsupported, missing or
// inaccessible resources are refused. Selection is by stable provider id, so a later rename in
// Dotloop never changes which template a packet uses. Labels are taken from the observation, not
// the browser. No provider call, token or customer value passes through this route.
const BodySchema = z
  .object({
    profile_id: z.string().trim().min(1).max(120),
    template_id: z.string().trim().min(1).max(120),
    transaction_type: z.enum(DOTLOOP_TRANSACTION_TYPES),
    initial_status: z.string().trim().min(1).max(40),
  })
  .strict();

export async function GET() {
  try {
    const user = await requireCapability("read");
    const settings = await getDotloopRenewalSettings(user);
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    if (!can(user.role, "manageAdmin")) {
      throw new EditableLayerError(
        "Admin authority is required to choose the Dotloop renewal profile and template.",
        403,
      );
    }
    const input = await parseJsonBody(request, BodySchema);
    const [connection, observation] = await Promise.all([
      new FirestoreConnectorConnectionStore().getConnection("dotloop"),
      new FirestoreDotloopObservationStore().read(),
    ]);
    const check = checkDotloopSelection({
      observation,
      generationId:
        connection?.status === "connected" ? (connection.generationId ?? null) : null,
      nowIso: new Date().toISOString(),
      profileId: input.profile_id,
      templateId: input.template_id,
      transactionType: input.transaction_type,
      initialStatus: input.initial_status,
    });
    if (!check.ok) throw new EditableLayerError(check.reason, 409);
    const settings = await selectDotloopRenewalSettings(user, {
      profile_id: input.profile_id,
      profile_label: check.profileLabel.slice(0, 200),
      template_id: input.template_id,
      template_label: check.templateLabel.slice(0, 200),
      transaction_type: check.transactionType,
      initial_status: check.initialStatus,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
