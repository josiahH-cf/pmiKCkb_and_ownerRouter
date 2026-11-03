import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/execution/preview-hash";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";

/** One deterministic byte owner for exact source review and actual publication. No I/O. */
export function processDefinitionPublicationContent(definition: ProcessDefinitionRecord) {
  const snapshot = {
    ...definition,
    revision: undefined,
    active_version_id: undefined,
    pending_queue_item_id: undefined,
    status: "Active" as const,
  };
  const content = new TextEncoder().encode(canonicalJson(snapshot));
  return {
    snapshot,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}
