import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, requireCapabilityInSpace } from "@/lib/auth/session";
import {
  getRenewalCompScreenshotActionView,
  renewalCompScreenshotClosedResponse,
} from "@/lib/lease-renewal/comp-screenshot-action";
import { readServerConfig } from "@/lib/config/server";
import {
  ImageStoreSetupError,
  createMaintenanceImageStore,
} from "@/lib/maintenance/image-store";
import { sniffImageMime } from "@/lib/maintenance/image-mime";

// ~10 MB base64 cap (~7.5 MB image) bounds payload size + storage.
const MAX_IMAGE_BASE64 = 10_000_000;

const CompScreenshotRequestSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  // Advisory only: the server sniffs the actual bytes below and stores THAT canonical type.
  mimeType: z.string().trim().min(1).max(100),
  base64: z.string().min(1).max(MAX_IMAGE_BASE64),
});

// Store a renewal comp screenshot via the SAME image-store seam the maintenance photo uses (Google Drive
// in-boundary in prod, free stub in dev), but into the renewal-comp folder and behind its OWN Action
// Registry gate. Edit-gated (renewal desk work). Returns a reference (drive:<id> / link), never the binary.
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "renewals");
  } catch (error) {
    return authErrorResponse(error);
  }

  // The committed Action Registry is the canonical execution gate. Refuse before inspecting body size,
  // parsing JSON/base64, reading config, constructing the Drive client, or touching bytes.
  if (!getRenewalCompScreenshotActionView().executable) {
    return NextResponse.json(renewalCompScreenshotClosedResponse(), { status: 409 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BASE64 + 65_536) {
    return NextResponse.json({ error: "Screenshot payload too large." }, { status: 413 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = CompScreenshotRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid screenshot upload." }, { status: 400 });
  }

  // The stored object's type is decided by the ACTUAL leading bytes, not the caller's declared type; a
  // non-image payload is refused before anything is written.
  const detectedMimeType = sniffImageMime(parsed.data.base64);
  if (!detectedMimeType) {
    return NextResponse.json(
      { error: "Only image uploads (JPEG, PNG, WebP, or HEIC) are supported." },
      { status: 400 },
    );
  }

  try {
    const config = readServerConfig();
    const store = createMaintenanceImageStore({
      imageStore: config.imageStore,
      maintenanceImageFolderId: config.renewalCompImageFolderId,
    });
    const stored = await store.put({ ...parsed.data, mimeType: detectedMimeType });
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
