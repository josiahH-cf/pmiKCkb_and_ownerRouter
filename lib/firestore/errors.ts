import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";

export { EditableLayerError };

export function editableLayerErrorResponse(error: unknown) {
  if (error instanceof EditableLayerError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return authErrorResponse(error);
}
