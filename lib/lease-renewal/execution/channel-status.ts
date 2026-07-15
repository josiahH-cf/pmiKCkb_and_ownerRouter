export interface RenewalChannelReceipts {
  email?: string;
  portal?: string;
  sms?: string;
}

export function renewalOutreachStatus(receipts: RenewalChannelReceipts) {
  const complete = Boolean(receipts.email && receipts.portal && receipts.sms);
  return {
    complete,
    emailSent: Boolean(receipts.email),
    portalSent: Boolean(receipts.portal),
    smsSent: Boolean(receipts.sms),
    claim:
      receipts.email && receipts.portal
        ? "Email and portal receipts verified."
        : "Cross-channel delivery is not verified.",
  };
}
