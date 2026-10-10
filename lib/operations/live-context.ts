import { resolveEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
/** New operations own only explicit Production/Live records; retired Demo is never a write lane. */
export function requireOperationsLiveContext() {
  const result = resolveEnvironmentDescriptor();
  if (
    !result.ok ||
    result.descriptor.source !== "explicit" ||
    result.descriptor.environmentKind !== "production" ||
    result.descriptor.dataContext !== "live"
  )
    throw new EditableLayerError(
      "This operation requires the explicitly configured Production and Live application context.",
      409,
    );
  return result.descriptor;
}
