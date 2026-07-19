// TOTP enrollment helpers (D-2 / AUM-3). The two pure operations a self-registration second-factor
// flow calls: begin an enrollment (mint a secret + the authenticator-app URI to show as a QR) and
// confirm it (verify the user's first code proves they scanned the secret). Pure and storage-free —
// persisting the secret per user and enforcing the factor at sign-in are the owner-gated flow's job.

import { PRODUCT_NAME } from "@/lib/constants";
import { generateTotpSecret, totpAuthUri, verifyTotp } from "@/lib/auth/totp";

export interface TotpEnrollment {
  /** Base32 shared secret to persist (sensitive) once the user confirms the first code. */
  secret: string;
  /** The `otpauth://` URI to render as a QR for the authenticator app. Carries the secret. */
  uri: string;
}

/** Begin enrollment: mint a fresh secret and the authenticator URI for the given account. */
export function beginTotpEnrollment(input: {
  accountName: string;
  issuer?: string;
}): TotpEnrollment {
  const secret = generateTotpSecret();
  const uri = totpAuthUri({
    secret,
    accountName: input.accountName,
    issuer: input.issuer ?? PRODUCT_NAME,
  });
  return { secret, uri };
}

/**
 * Confirm enrollment: the user types the code their app shows for the just-minted secret. Only when
 * this returns true should the flow persist the secret and mark the second factor active.
 */
export function confirmTotpEnrollment(
  secret: string,
  token: string,
  nowSeconds?: number,
): boolean {
  return verifyTotp({ secret }, token, nowSeconds === undefined ? {} : { nowSeconds });
}
