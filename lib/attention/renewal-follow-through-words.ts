// S280 R-S280-1: the exact staff words of the viewer's own renewal follow-through. A words-only
// module, so the Dashboard panel reads them without the evidence projection behind them.

export const FOLLOW_THROUGH_WORDS = {
  basis: "Because you sent this message.",
  heading: "From your renewal messages",
  unavailable: "Your renewal messages could not be checked just now.",
  reply: {
    owner: "record the owner's decision",
    tenant: "record the tenant's response",
  },
  held: {
    owner: "review the held owner message",
    tenant: "review the held offer",
  },
  out_of_date: {
    owner: "update the out-of-date owner message",
    tenant: "update the out-of-date offer",
  },
  unconfirmed: {
    owner: "check whether the owner message went out",
    tenant: "check whether the offer went out",
  },
} as const;
