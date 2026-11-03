/** The existing canonical file identity rule, shared by Admin review and byte admission. */
export function publicationResourceIdentityText(
  connectorId: string,
  rootId: string,
  spaceId: string,
  path: string,
) {
  return JSON.stringify({ connectorId, path, rootId, spaceId });
}
