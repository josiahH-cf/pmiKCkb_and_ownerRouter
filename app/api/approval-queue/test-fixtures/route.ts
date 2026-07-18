import { NextResponse } from "next/server";
import { z } from "zod";

import { listAppUsers } from "@/lib/admin/users";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  APPROVAL_TEST_FIXTURE_CONFIRMATION,
  inspectApprovalTestFixtures,
  restoreApprovalTestFixtures,
} from "@/lib/firestore/approval-test-fixtures";
import { EditableLayerError } from "@/lib/firestore/errors";

const RestoreSchema = z
  .object({
    action: z.literal("restore"),
    confirmation: z.literal(APPROVAL_TEST_FIXTURE_CONFIRMATION),
  })
  .strict();

export async function GET() {
  try {
    const actor = await requireCapabilityInSpace("manageAdmin", "renewals");
    const restricted = await resolveRestrictedStaff(actor.uid);
    const fixtures = await inspectApprovalTestFixtures(actor, restricted.uid);
    return NextResponse.json({ fixtures, restricted_role: restricted.role });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("manageAdmin", "renewals");
    await parseJsonBody(request, RestoreSchema);
    const restricted = await resolveRestrictedStaff(actor.uid);
    const fixtures = await restoreApprovalTestFixtures(actor, restricted.uid);
    return NextResponse.json({ fixtures, restricted_role: restricted.role });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function resolveRestrictedStaff(actorUid: string) {
  const users = await listAppUsers();
  const restricted = users.find(
    (user) =>
      user.uid !== actorUid &&
      !user.disabled &&
      !user.scopeClaimInvalid &&
      user.role !== "Admin" &&
      (user.scopes === undefined || user.scopes.includes("renewals")),
  );
  if (!restricted) {
    throw new EditableLayerError(
      "Create or restore one enabled non-Admin staff identity with renewals scope before seeding Test approval fixtures.",
      409,
    );
  }
  return restricted;
}
