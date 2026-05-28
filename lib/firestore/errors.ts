import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/session";

export class EditableLayerError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "EditableLayerError";
  }
}

export function editableLayerErrorResponse(error: unknown) {
  if (error instanceof EditableLayerError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return authErrorResponse(error);
}
