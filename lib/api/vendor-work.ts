import { VendorBoundaryError } from "@/lib/vendor/model";
import { apiErrorResponse } from "./editable";
export function vendorWorkErrorResponse(error: unknown) {
  if (error instanceof VendorBoundaryError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "cache-control": "private, no-store" } },
    );
  return apiErrorResponse(error);
}
export const vendorWorkHeaders = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};
