import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  ChangeRuntimeSuspensionInputSchema,
  RuntimeSuspensionExpectedIdSchema,
  RuntimeSuspensionOperationIdSchema,
} from "@/lib/firestore/schemas";
import {
  RuntimeSuspensionStoreError,
  changeRuntimeActionSuspension,
  listRuntimeActionSuspensions,
  listRuntimeSuspensionActionOptions,
} from "@/lib/firestore/runtime-action-suspensions";
import {
  RUNTIME_SUSPENSION_EXPECTED_ID_HEADER,
  RUNTIME_SUSPENSION_OPERATION_ID_HEADER,
} from "@/lib/operations/runtime-suspension-policy";

export async function GET() {
  try {
    const actor = await requireCapability("manageAdmin");
    const snapshot = await listRuntimeActionSuspensions(actor);
    return NextResponse.json({
      actions: listRuntimeSuspensionActionOptions([
        ...snapshot.suspensions.map((record) => record.action_key),
        ...snapshot.unreadableActionKeys,
      ]),
      ...snapshot,
    });
  } catch (error) {
    return runtimeSuspensionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const input = await parseRuntimeSuspensionBody(request);
    const operationId = readRequiredHeader(
      request,
      RUNTIME_SUSPENSION_OPERATION_ID_HEADER,
      RuntimeSuspensionOperationIdSchema,
    );
    const expectedSuspensionId = readOptionalHeader(
      request,
      RUNTIME_SUSPENSION_EXPECTED_ID_HEADER,
      RuntimeSuspensionExpectedIdSchema,
    );
    const suspension = await changeRuntimeActionSuspension(actor, input, {
      operationId,
      ...(expectedSuspensionId === undefined ? {} : { expectedSuspensionId }),
    });
    return NextResponse.json({ suspension });
  } catch (error) {
    return runtimeSuspensionErrorResponse(error);
  }
}

async function parseRuntimeSuspensionBody(request: Request) {
  const payload = await request.json().catch(() => {
    throw invalidInputError("A valid JSON request body is required.");
  });
  const parsed = ChangeRuntimeSuspensionInputSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidInputError("Runtime suspension input is invalid.");
  }
  return parsed.data;
}

function readRequiredHeader<T>(
  request: Request,
  name: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): T {
  const parsed = schema.safeParse(request.headers.get(name));
  if (!parsed.success) {
    throw invalidInputError(`A valid ${name} header is required.`);
  }
  return parsed.data;
}

function readOptionalHeader<T>(
  request: Request,
  name: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): T | undefined {
  const value = request.headers.get(name);
  if (value === null) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw invalidInputError(`The ${name} header is invalid.`);
  }
  return parsed.data;
}

function invalidInputError(message: string) {
  return new RuntimeSuspensionStoreError(
    "runtime_suspension_invalid_input",
    message,
    400,
  );
}

function runtimeSuspensionErrorResponse(error: unknown) {
  if (error instanceof RuntimeSuspensionStoreError) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { status: error.status },
    );
  }
  return apiErrorResponse(error);
}
