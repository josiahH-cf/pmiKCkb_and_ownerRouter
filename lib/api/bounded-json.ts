import { EditableLayerError } from "@/lib/firestore/errors";
/** Enforces the actual streamed size even when Content-Length is absent or incorrect. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes)
    throw new EditableLayerError("This request exceeds the file limit.", 413);
  if (!request.body) throw new EditableLayerError("A request body is required.", 400);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0,
    done = false;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) {
        done = true;
        break;
      }
      size += part.value.length;
      if (size > maxBytes)
        throw new EditableLayerError("This request exceeds the file limit.", 413);
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks);
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new EditableLayerError("Invalid JSON request body.", 400);
    }
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
