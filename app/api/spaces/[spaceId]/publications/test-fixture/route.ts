import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  continueTestPublicationToPinnedRun,
  inspectTestPublicationFixture,
  publishTestPublicationRevision,
  restoreTestPublicationBaseline,
  rollbackTestPublicationToBaseline,
} from "@/lib/publication/test-fixture";
import {
  TEST_PUBLICATION_CONFIRMATIONS,
  TEST_PUBLICATION_SPACE_ID,
} from "@/lib/publication/test-fixture-contract";

const OperationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      confirmation: z.literal(TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun),
      operation: z.literal("continue_pinned_run"),
    })
    .strict(),
  z
    .object({
      confirmation: z.literal(TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline),
      operation: z.literal("restore_baseline"),
    })
    .strict(),
  z
    .object({
      confirmation: z.literal(TEST_PUBLICATION_CONFIRMATIONS.publishRevision),
      operation: z.literal("publish_revision"),
    })
    .strict(),
  z
    .object({
      confirmation: z.literal(TEST_PUBLICATION_CONFIRMATIONS.rollbackBaseline),
      operation: z.literal("rollback_baseline"),
    })
    .strict(),
]);

interface RouteContext {
  params: Promise<{ spaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requireCapabilityInSpace("manageAdmin", "renewals");
    await assertCanonicalSpace(context);
    return NextResponse.json({
      fixture: await inspectTestPublicationFixture(actor),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireCapabilityInSpace("manageAdmin", "renewals");
    await assertCanonicalSpace(context);
    const input = await parseJsonBody(request, OperationSchema);
    const result =
      input.operation === "continue_pinned_run"
        ? await continueTestPublicationToPinnedRun(actor, input.confirmation)
        : input.operation === "restore_baseline"
          ? await restoreTestPublicationBaseline(actor, input.confirmation)
          : input.operation === "publish_revision"
            ? await publishTestPublicationRevision(actor, input.confirmation)
            : await rollbackTestPublicationToBaseline(actor, input.confirmation);
    return NextResponse.json({ result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function assertCanonicalSpace(context: RouteContext) {
  const { spaceId } = await context.params;
  if (spaceId !== TEST_PUBLICATION_SPACE_ID) {
    throw new EditableLayerError(
      "The exact Test publication fixture belongs only to Lease Renewals.",
      404,
    );
  }
}
