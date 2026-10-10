import { z } from "zod";
import { EditableLayerError } from "@/lib/firestore/errors";
import { parseValidatedValue } from "./editable";
export function parseUniqueQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const q = new URL(request.url).searchParams;
  for (const key of q.keys())
    if (q.getAll(key).length !== 1)
      throw new EditableLayerError("Duplicate query parameters are not supported.", 400);
  return parseValidatedValue(Object.fromEntries(q), schema);
}
