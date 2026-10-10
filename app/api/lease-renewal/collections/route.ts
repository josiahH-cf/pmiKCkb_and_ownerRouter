import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { z } from "zod";
import { NextResponse } from "next/server";
import { parseJsonBody, apiErrorResponse } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { RenewalSharedCollectionStore } from "@/lib/firestore/renewal-shared-collections";
import { CollectionMutationSchema } from "@/lib/lease-renewal/shared-collections";
import { readSharedCollectionSource } from "@/lib/lease-renewal/shared-collection-source";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
        renewalRoleCapability("read_workspace"),
        "renewals",
      ),
      q = new URL(request.url).searchParams,
      allowed = q.has("operation")
        ? ["operation"]
        : q.has("review")
          ? ["review"]
          : q.has("id")
            ? ["id"]
            : ["after"];
    if ([...q.keys()].some((key) => !allowed.includes(key) || q.getAll(key).length !== 1))
      throw new EditableLayerError("Choose one collection read and its cursor.", 400);
    if ([...q.values()].some((value) => !z.string().uuid().safeParse(value).success))
      throw new EditableLayerError("Invalid collection identity or cursor.", 400);
    const store = new RenewalSharedCollectionStore();
    const result = q.has("operation")
      ? await store.receipt(actor, q.get("operation")!)
      : q.has("review")
        ? await store.readReview(actor, q.get("review")!)
        : q.has("id")
          ? await store.statuses(
              actor,
              q.get("id")!,
              await readSharedCollectionSource(actor),
            )
          : await store.list(actor, q.get("after"));
    return NextResponse.json(result, { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
        renewalRoleCapability("save_shared_collection"),
        "renewals",
      ),
      input = await parseJsonBody(request, CollectionMutationSchema),
      store = new RenewalSharedCollectionStore();
    const result =
      input.action === "review"
        ? {
            review: await store.review(
              actor,
              input,
              await readSharedCollectionSource(actor),
            ),
          }
        : input.action === "rename"
          ? await store.rename(actor, input)
          : await store.save(actor, input, () => readSharedCollectionSource(actor));
    return NextResponse.json(result, { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
