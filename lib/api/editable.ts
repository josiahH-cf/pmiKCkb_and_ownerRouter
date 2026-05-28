import { NextResponse } from "next/server";
import { z } from "zod";
import { EditableLayerError, editableLayerErrorResponse } from "@/lib/firestore/errors";

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>) {
  const payload = await request.json().catch(() => {
    throw new EditableLayerError("Invalid JSON request body.", 400);
  });
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return Promise.reject(
      new EditableLayerError(
        `Invalid request body: ${flattenIssues(parsed.error).join("; ")}`,
        400,
      ),
    );
  }

  return parsed.data;
}

export async function parseOptionalJsonBody<T>(request: Request, schema: z.ZodType<T>) {
  const text = await request.text();

  if (!text.trim()) {
    return schema.parse({});
  }

  const payload = JSON.parse(text);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new EditableLayerError(
      `Invalid request body: ${flattenIssues(parsed.error).join("; ")}`,
      400,
    );
  }

  return parsed.data;
}

export function createdJson(data: unknown) {
  return NextResponse.json(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  return editableLayerErrorResponse(error);
}

function flattenIssues(error: z.ZodError) {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return issues.length ? issues : ["Invalid request body."];
}
