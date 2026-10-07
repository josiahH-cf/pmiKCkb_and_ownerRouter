// The documented Dotloop participant roles, kept free of server dependencies so a reviewed signer
// role can be chosen in the browser. S66: a reviewed broker signer is handed off as MANAGING_BROKER.
export const DOTLOOP_PARTICIPANT_ROLES = [
  "TENANT",
  "LANDLORD",
  "PROPERTY_MANAGER",
  "MANAGING_BROKER",
  "ADMIN",
  "OTHER",
] as const;
export type DotloopParticipantRole = (typeof DOTLOOP_PARTICIPANT_ROLES)[number];
