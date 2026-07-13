import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, requireCapabilityInSpace } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  ImageStoreSetupError,
  createMaintenanceImageStore,
} from "@/lib/maintenance/image-store";
import {
  getMaintenancePhotoActionView,
  maintenancePhotoClosedResponse,
} from "@/lib/maintenance/photo-action";

// ~10 MB base64 cap (~7.5 MB image) bounds payload size + storage. Field photos are small.
const MAX_IMAGE_BASE64 = 10_000_000;

const PhotoRequestSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1),
  base64: z.string().min(1).max(MAX_IMAGE_BASE64),
});

// Store a maintenance capture photo via the image-store seam (Google Drive in-boundary in prod, free stub
// in dev). Edit-gated (capture is editor work). Returns a reference (Drive file id/link), never re-emits
// the binary.
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "maintenance");
  } catch (error) {
    return authErrorResponse(error);
  }

  // The committed Action Registry is the canonical execution gate. Refuse before inspecting body
  // size, parsing JSON/base64, reading config, constructing the Drive client, or touching bytes.
  if (!getMaintenancePhotoActionView().executable) {
    return NextResponse.json(maintenancePhotoClosedResponse(), { status: 409 });
  }

  // Reject an oversized body via Content-Length BEFORE buffering it into memory (the Zod cap below only
  // applies after json() has read the whole body). 64KB headroom for the JSON wrapper.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BASE64 + 65_536) {
    return NextResponse.json({ error: "Photo payload too large." }, { status: 413 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = PhotoRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid photo upload." }, { status: 400 });
  }

  try {
    const config = readServerConfig();
    const store = createMaintenanceImageStore(config);
    const stored = await store.put(parsed.data);
    return NextResponse.json(stored);
  } catch (error) {
    if (error instanceof ImageStoreSetupError) {
      return NextResponse.json(
        { error: error.message, error_type: error.name },
        { status: 503 },
      );
    }
    throw error;
  }
}
