import { createHash } from "node:crypto";
import { publicationResourceIdentityText } from "./resource-identity";

export function stablePublicationResourceId(
  connectorId: string,
  rootId: string,
  spaceId: string,
  path: string,
) {
  return `source:${createHash("sha256")
    .update(publicationResourceIdentityText(connectorId, rootId, spaceId, path))
    .digest("hex")}`;
}
