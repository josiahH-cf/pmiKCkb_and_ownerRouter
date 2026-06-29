export interface LaunchSpace {
  id: string;
  name: string;
  processCategory: string;
  readOnly?: boolean;
}

export const launchSpaces: readonly LaunchSpace[] = [
  { id: "lease-renewals", name: "Lease Renewals", processCategory: "Renewals" },
  {
    id: "owner-renewal-outreach",
    name: "Owner Renewal Outreach + Comp Lookup",
    processCategory: "Renewals",
  },
  {
    id: "tenant-renewal-notice",
    name: "Tenant Renewal Notice + DotLoop Follow-Up",
    processCategory: "Renewals",
  },
  {
    id: "maintenance-work-order-intake",
    name: "Maintenance Work Order Intake",
    processCategory: "Maintenance",
  },
  {
    id: "vendor-assignment-handoff",
    name: "Vendor Assignment Handoff",
    processCategory: "Maintenance",
  },
  { id: "daily-inbox-triage", name: "Daily Inbox Triage", processCategory: "Inbox" },
  { id: "fathom-training", name: "Fathom Training", processCategory: "Training" },
  { id: "escalation-rules", name: "Escalation Rules", processCategory: "Escalation" },
  { id: "move-in", name: "Move-In", processCategory: "Move-In" },
  {
    id: "move-out-deposit-disposition",
    name: "Move-Out + Deposit Disposition",
    processCategory: "Move-Out",
  },
  { id: "owner-onboarding", name: "Owner Onboarding", processCategory: "Onboarding" },
  {
    id: "owner-email",
    name: "Owner Email",
    processCategory: "Owner Email",
    readOnly: true,
  },
] as const;

/** Where a launch space opens. Lease Renewals has a built operator desk; every other space opens its
 *  space detail. Centralized so the home launcher and the Spaces directory stay consistent. */
export function spaceHref(space: Pick<LaunchSpace, "id">): string {
  return space.id === "lease-renewals" ? "/lease-renewal" : `/spaces/${space.id}`;
}
