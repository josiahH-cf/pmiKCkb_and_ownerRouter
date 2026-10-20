/** Provider connection identity requested by the owner; release/assurance identities are separate. */
export const APPROVED_INTEGRATION_ACCOUNT = "integrations@pmikcmetro.com";
export function isApprovedIntegrationAccount(email: string | null | undefined) {
  return email?.trim().toLowerCase() === APPROVED_INTEGRATION_ACCOUNT;
}
