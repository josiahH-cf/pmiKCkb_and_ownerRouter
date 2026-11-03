/** S130 provenance compatibility only; approval, access and current-version checks stay separate. */
export function isRenewalArtifactPublicationSpace(
  spaceId: unknown,
): spaceId is "lease-renewals" | "renewals" {
  return spaceId === "lease-renewals" || spaceId === "renewals";
}
