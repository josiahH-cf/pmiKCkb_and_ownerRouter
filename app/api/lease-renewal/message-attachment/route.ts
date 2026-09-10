import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { buildLiveCompScreenshotRuntime } from "@/lib/lease-renewal/comp-screenshot-runtime";
import {
  loadCurrentRenewalDraftCompScreenshotAttachment,
  resolveRenewalDraftCompScreenshotAttachment,
} from "@/lib/lease-renewal/comp-screenshot-attachment-runtime";
import { compScreenshotDraftAttachmentIdentity } from "@/lib/lease-renewal/comp-screenshot-attachment";
import { compScreenshotErrorResponse } from "@/lib/lease-renewal/comp-screenshot-service";

const query = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    receiptId: z.string().regex(/^comp_store_[a-f0-9]{48}$/),
  })
  .strict();

/** Download only the current receipted screenshot through the existing exact Drive resolver. */
export async function GET(request: Request) {
  try {
    await requireCapabilityInSpace(renewalRoleCapability("screenshot_store"), "renewals");
    const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success)
      throw new EditableLayerError("Select an exact reviewed attachment.", 400);
    const runtime = buildLiveCompScreenshotRuntime();
    const current = await loadCurrentRenewalDraftCompScreenshotAttachment(
      parsed.data.leaseId,
      runtime.deps.store,
    );
    if (!current || current.receiptId !== parsed.data.receiptId)
      throw new EditableLayerError(
        "This attachment is no longer the current verified screenshot.",
        409,
      );
    const resolved = await resolveRenewalDraftCompScreenshotAttachment(
      parsed.data.leaseId,
      compScreenshotDraftAttachmentIdentity(current),
      runtime.deps,
      runtime.context,
    );
    return new NextResponse(Buffer.from(resolved.bytes), {
      headers: {
        "Content-Type": resolved.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(resolved.filename).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = compScreenshotErrorResponse(error);
    if (response) return NextResponse.json(response.body, { status: response.status });
    return apiErrorResponse(error);
  }
}
