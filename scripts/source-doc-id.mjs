import { createHash } from "node:crypto";

/**
 * Derive the deterministic Agent Search document id for a Cloud Storage source URI.
 * Pure helper shared by the seed/corpus tooling and the Admin migration console; kept
 * free of SDK imports so importing it never pulls firebase-admin into a bundle.
 */
export function cloudStorageContentDocumentId(gcsUri) {
  return createHash("sha256").update(gcsUri).digest("hex").slice(0, 32);
}
